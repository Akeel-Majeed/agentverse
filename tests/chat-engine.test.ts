import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPausedError, runChatAgent } from "@/lib/agents/chat/agent";
import { judgementView } from "@/lib/agents/chat/engine-views";
import { createTools, type ToolCall } from "@/lib/agents/chat/tools";
import { checkFigures } from "@/lib/agents/checker";
import { getAssessmentMeta, getTrace, rerunAssessment } from "@/lib/data";
import type { SimResult } from "@/lib/engine/types";
import type { TraceEvent } from "@/lib/trace/types";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

async function call(name: string, input: Record<string, unknown> = {}) {
  const calls: ToolCall[] = [];
  const tool = createTools(calls).find((t) => t.name === name)!;
  const raw = (await tool.run(input as never)) as string;
  return { out: JSON.parse(raw), raw };
}

let sim: SimResult;
let events: TraceEvent[];

// tests/setup.ts resets the demo store before each test, so each test runs its own assessment.
beforeEach(async () => {
  // Demo mode: an assessment runs the Monte Carlo engine and stores its result on the run's trace.
  await rerunAssessment();
  const trace = await getTrace((await getAssessmentMeta()).runId ?? undefined);
  events = trace!.events;
  sim = JSON.parse(events.find((e) => e.type === "engine.result")!.body).sim;
}, 60_000);

describe("chat agent: Monte Carlo engine", () => {
  it("passes on the engine's profit spread, risks, options, covenant and thresholds as displayed", async () => {
    const { out } = await call("get_simulation");
    expect(out.profit.one_in_20_bad_year.value).toBe(sim.profit.p5.display);
    expect(out.profit.chance_of_a_loss.value).toBe(sim.profit.lossProb.display);
    expect(out.risks).toHaveLength(5);
    expect(out.risks.find((r: { risk_id: string }) => r.risk_id === "output_prices").one_in_20_hit).toBe(
      sim.risks.find((r) => r.riskId === "output_prices")!.p5Hit.display
    );
    expect(out.options.map((o: { option_id: string }) => o.option_id)).toEqual(sim.options.map((o) => o.id));
    expect(out.loan_covenant.chance_dscr_below.value).toBe(sim.dscr.pBelow.display);
    expect(out.thresholds.length).toBe(sim.thresholds.length);
    expect(out.run.record_intact).toBe(true);
  });

  it("lets the figure checker trace engine figures quoted in a reply", async () => {
    const { raw } = await call("get_simulation");
    const reply = `In a 1-in-20 bad year profit is ${sim.profit.p5.display}, with a ${sim.profit.lossProb.display} chance of a loss.`;
    expect(checkFigures(reply, [raw]).untraced).toEqual([]);
  });

  it("adds the simulated hit to get_risk next to the hand-checkable one", async () => {
    const { out } = await call("get_risk", { risk_id: "output_prices" });
    expect(out.monte_carlo.one_in_20_hit).toBe(sim.risks.find((r) => r.riskId === "output_prices")!.p5Hit.display);
    expect(out.bad_year_hit).toBeTruthy();
  });
});

describe("chat agent: analyst judgement", () => {
  it("says why there is no judgement when the analyst didn't run", async () => {
    const { out } = await call("get_analyst_judgement");
    expect(out.judgement).toBeNull();
    expect(out.why_no_judgement).toMatch(/GEMINI_API_KEY|numbers/);
    expect(out.run.record_intact).toBe(true);
  });

  it("resolves cited figure ids, sorts options by rank and lists controls that fired", () => {
    const option = sim.options[0];
    const judge = {
      ranked_options: [
        { option_id: sim.options[1].id, rank: 2, reason: "second", cites: [] },
        { option_id: option.id, rank: 1, reason: "best", cites: [option.p5Gain.id] },
      ],
      risks: [{ risk_id: "output_prices", explanation: "most of the crop is unsold", cites: [] }],
      change_my_mind: [{ threshold_id: sim.thresholds[0].id, statement: "if wheat passes break-even" }],
      conflicts: [],
      hold_for_human: true,
      hold_reason: "Document and profile disagree",
    };
    const extra = [
      { type: "checker.result", body: JSON.stringify({ untraced: [] }) },
      { type: "control.budget_limit", body: "{}" },
      { type: "judge.output", body: JSON.stringify(judge) },
    ] as TraceEvent[];
    const view = judgementView({ id: "r1", status: "held", startedAt: "", model: "m", error: null } as never, [...events, ...extra], true);
    expect(view.judgement!.ranked_options.map((o) => o.rank)).toEqual([1, 2]);
    expect(view.judgement!.ranked_options[0]).toMatchObject({ option: option.label, figures_cited: [`${option.p5Gain.label}: ${option.p5Gain.display}`] });
    expect(view.judgement!.what_would_change_its_mind[0].threshold).toContain(sim.thresholds[0].display);
    expect(view.judgement!.held_for_human).toBe("Document and profile disagree");
    expect(view.controls_fired).toEqual(["spend limit reached"]);
    expect(view.run.status).toMatch(/held/);
  });
});

describe("chat agent: evaluation and documents", () => {
  it("reports the held-out backtest against both benchmarks, and the screen's misses", async () => {
    const { out } = await call("get_evaluation");
    const wheat = out.price_backtest.results.find((r: { series: string }) => r.series === "feed wheat price");
    expect(wheat.models).toHaveLength(3);
    expect(wheat.models[0].low_breach_rate).toMatch(/% \(95% CI/);
    expect(out.document_screen.all.texts).toBe(146);
    expect(out.document_screen.all.misses).toBeGreaterThan(0);
  });

  it("says when there are no documents", async () => {
    const { out } = await call("get_documents");
    expect(out.note).toMatch(/No documents/);
  });
});

describe("chat agent: kill switch", () => {
  it("answers nothing while the agents are paused, before any model call", async () => {
    const fetch = vi.fn();
    const client = new Anthropic({ apiKey: "test", fetch: fetch as never, maxRetries: 0 });
    await expect(runChatAgent([{ role: "user", content: "hi" }], { client, isPaused: async () => true })).rejects.toBeInstanceOf(ChatPausedError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
