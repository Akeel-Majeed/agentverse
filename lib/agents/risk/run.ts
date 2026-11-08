/**
 * Phase 2: Gemini 4 Argon ranks, explains and proposes through five declared functions.
 * Our own loop enforces the controls, all in code:
 *   allowlist (only TOOL_NAMES run), turn cap, budget cap from `usage` at the Argon price,
 *   proposal cap (tools.ts), kill switch (paused flag checked before every turn and every tool,
 *   plus AbortController on the in-flight request), every call and result appended to the
 *   hash-chained trace with the Gemini interaction id. The figure checker then blocks any number
 *   the engine did not produce.
 */
import type { AgentStore } from "../../server/agent-store";
import { TraceWriter } from "../../trace/chain";
import type { AgentRun, EngineResultEvent, RunStatus } from "../../trace/types";
import type { ProfileFieldValue } from "../../types";
import { geminiFromEnv, JUDGE_MODEL, usageCostUsd, type FunctionCallStep, type InteractionsClient } from "./gemini";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { JudgementSchema, type Judgement } from "./schema";
import { callTool, TOOL_DECLARATIONS, TOOL_NAMES, type ToolContext } from "./tools";
import { verifyOutput } from "./verify";

export interface RunDeps {
  store: AgentStore;
  profile: ProfileFieldValue[];
  /** undefined = read GEMINI_API_KEY; null = no client (numbers only); or a fake in tests. */
  client?: InteractionsClient | null;
  pollMs?: number;
}

const USER_PROMPT =
  "Assess this run. Call get_engine_results, get_documents and get_profile, propose any changes the documents justify, then call submit_judgement.";
const THINKING_LEVEL = "medium";

const callArgs = (s: FunctionCallStep): Record<string, unknown> =>
  typeof s.arguments === "string" ? (JSON.parse(s.arguments) as Record<string, unknown>) : (s.arguments ?? {});
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export async function runPhaseTwo(runId: string, deps: RunDeps): Promise<{ status: RunStatus; output?: Judgement }> {
  const { store } = deps;
  const client = deps.client === undefined ? geminiFromEnv() : deps.client;
  const run = await store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const events = await store.getEvents(runId);
  const engine = events.find((e) => e.type === "engine.result");
  if (!engine) throw new Error(`Run ${runId} has no engine result`);
  const { sim } = JSON.parse(engine.body) as EngineResultEvent;
  const controls = await store.getControls();
  const model = JUDGE_MODEL();
  const last = events[events.length - 1];
  const trace = TraceWriter.resume(runId, store, last.seq, last.hash);
  const started = performance.now();

  const finish = async (status: RunStatus, patch: Partial<AgentRun> = {}, output?: Judgement) => {
    await store.updateRun(runId, {
      status, endedAt: new Date().toISOString(),
      timings: { ...run.timings, judge: Math.round(performance.now() - started) }, ...patch,
    });
    await trace.append("run.end", "code", { status, head: trace.head() });
    return { status, output };
  };

  if (!client) {
    await trace.append("judge.skipped", "code", { reason: "GEMINI_API_KEY not set: numbers only" });
    return finish("numbers_only");
  }

  const ctx: ToolContext = {
    runId, farmId: run.farmId, sim, documents: await store.getDocuments(run.farmId), profile: deps.profile,
    store, trace, controls, outputs: [], proposals: 0,
  };
  await store.updateRun(runId, { status: "running", model, promptVersion: PROMPT_VERSION });
  await trace.append("judge.start", "code", {
    model, promptVersion: PROMPT_VERSION, thinkingLevel: THINKING_LEVEL, tools: TOOL_NAMES,
    limits: { maxTurns: controls.maxTurns, maxBudgetUsd: controls.maxBudgetUsd, maxProposals: controls.maxProposalsPerRun },
  });

  const abort = new AbortController();
  let killed = false;
  const kill = async (where: string) => {
    if (killed) return;
    killed = true;
    abort.abort();
    await trace.append("control.kill_switch", "human", { where });
  };
  const poll = setInterval(() => {
    void store.getControls().then((c) => { if (c.paused) void kill("poll"); });
  }, deps.pollMs ?? 2000);

  let cost = 0, inputTokens = 0, outputTokens = 0, turns = 0;
  let input: unknown = USER_PROMPT;
  let previous: string | undefined;
  let judgement: Judgement | undefined;
  let status: RunStatus = "failed";
  let error: string | null = null;

  try {
    for (let turn = 1; turn <= controls.maxTurns && !judgement; turn++) {
      if ((await store.getControls()).paused) { await kill("before_turn"); break; }
      const ix = await client.interactions.create(
        {
          model, input, system_instruction: SYSTEM_PROMPT, tools: TOOL_DECLARATIONS,
          generation_config: { thinking_level: THINKING_LEVEL, tool_choice: { allowed_tools: { mode: "any", tools: TOOL_NAMES } } },
          ...(previous ? { previous_interaction_id: previous } : {}),
        },
        // A set signal overrides timeout_ms in SDK 3.0.0, so the timeout rides on the same signal.
        { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(240_000)]) },
      );
      turns = turn;
      previous = ix.id;
      cost += usageCostUsd(ix.usage);
      inputTokens += ix.usage?.total_input_tokens ?? 0;
      outputTokens += (ix.usage?.total_output_tokens ?? 0) + (ix.usage?.total_thought_tokens ?? 0);
      const calls = (ix.steps ?? []).filter((s): s is FunctionCallStep => s.type === "function_call");
      await trace.append("judge.turn", "gemini", {
        turn, interactionId: ix.id, status: ix.status, usage: ix.usage ?? null, costUsd: round4(cost),
        calls: calls.map((c) => c.name), text: ix.output_text ?? null,
      });
      if (cost > controls.maxBudgetUsd) {
        await trace.append("control.budget_limit", "code", { costUsd: round4(cost), limit: controls.maxBudgetUsd });
        error = `Budget cap $${controls.maxBudgetUsd} reached`;
        break;
      }
      if (calls.length === 0) {
        input = "Reply only by calling the functions. Finish with submit_judgement.";
        continue;
      }
      const results: unknown[] = [];
      for (const call of calls) {
        if ((await store.getControls()).paused) { await kill("before_tool"); break; }
        const args = callArgs(call);
        await trace.append("tool.call", "gemini", { interactionId: ix.id, callId: call.id, tool: call.name, args });
        let result: unknown;
        if (!TOOL_NAMES.includes(call.name)) {
          await trace.append("tool.denied", "code", { tool: call.name });
          result = { error: `Function ${call.name} is not allowed` };
        } else if (call.name === "submit_judgement") {
          const parsed = JudgementSchema.safeParse(args);
          if (parsed.success) { judgement = parsed.data; result = { status: "received" }; }
          else {
            await trace.append("judge.invalid_output", "code", { issues: parsed.error.issues });
            result = { error: "Invalid judgement; fix these and call submit_judgement again", issues: parsed.error.issues };
          }
        } else {
          const r = await callTool(ctx, call.name, args);
          result = r.ok ? r.value : { error: r.error };
        }
        await trace.append("tool.result", "code", { callId: call.id, tool: call.name, result });
        results.push({ type: "function_result", name: call.name, call_id: call.id, result: [{ type: "text", text: JSON.stringify(result) }] });
      }
      if (killed) break;
      input = results;
    }
    if (judgement) {
      await trace.append("judge.output", "gemini", judgement);
      const check = verifyOutput(judgement, ctx.outputs);
      await trace.append("checker.result", "code", check);
      status = check.untraced.length > 0 ? "blocked" : judgement.hold_for_human ? "held" : "published";
    } else if (!killed && !error && turns >= controls.maxTurns) {
      await trace.append("control.turn_limit", "code", { turns, limit: controls.maxTurns });
      error = `Turn cap ${controls.maxTurns} reached without submit_judgement`;
    }
  } catch (e) {
    if (!killed) {
      error = e instanceof Error ? e.message : String(e);
      await trace.append("judge.error", "code", { message: error });
    }
  } finally {
    clearInterval(poll);
  }
  if (killed || (await store.getControls()).paused) status = "killed";
  return finish(status, { totalCostUsd: round4(cost), turns, inputTokens, outputTokens, error }, judgement);
}
