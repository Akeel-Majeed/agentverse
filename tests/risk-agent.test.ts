import { describe, expect, it } from "vitest";
import { createMemoryAgentStore } from "@/lib/server/agent-store";
import { runPhaseOne } from "@/lib/assess/phase-one";
import { runPhaseTwo } from "@/lib/agents/risk/run";
import type { FunctionCallStep, InteractionLike, InteractionsClient } from "@/lib/agents/risk/gemini";
import { verifyChain } from "@/lib/trace/chain";
import type { AgentProposal } from "@/lib/trace/types";
import * as demo from "@/lib/profile/fenland-ridge";

const DOC_TEXT = "GRAIN PURCHASE CONTRACT. Seller: Fenland Ridge Farm Ltd. Commodity: feed wheat, harvest 2027. Quantity: 200 tonnes. Price: £185 per tonne.";
const cleanJev = async () => ({ injection: 0.01, unsupported_change: 0.01 });

async function setup(withDoc = false) {
  const proposals: AgentProposal[] = [];
  const store = createMemoryAgentStore(async (p) => { proposals.push(p); });
  const { run } = await runPhaseOne({
    store, farmId: demo.FARM_ID, trigger: withDoc ? "document" : "demo", fields: demo.profileFields, market: demo.market, now: new Date(),
    document: withDoc ? { name: "contract.txt", text: DOC_TEXT } : undefined, jev: withDoc ? cleanJev : null, extract: null, geminiAvailable: true,
  });
  return { store, run, proposals };
}

const call = (name: string, args: Record<string, unknown> = {}, id = `call-${name}`): FunctionCallStep => ({ type: "function_call", id, name, arguments: args });
const usage = { total_input_tokens: 1000, total_output_tokens: 200, total_thought_tokens: 300 };

/** Scripted client: turn n returns script[n]'s function calls. Records every request. */
function fakeClient(script: Array<(req: Record<string, unknown>, turn: number) => FunctionCallStep[]>, opts: { usage?: typeof usage; onCreate?: (turn: number) => Promise<void> } = {}) {
  const requests: Record<string, unknown>[] = [];
  let n = 0;
  const client: InteractionsClient & { requests: typeof requests } = {
    requests,
    interactions: {
      async create(req): Promise<InteractionLike> {
        requests.push(req);
        await opts.onCreate?.(n);
        const steps = script[Math.min(n, script.length - 1)](req, n);
        n++;
        return { id: `ix-${n}`, status: "completed", steps, usage: opts.usage ?? usage };
      },
    },
  };
  return client;
}

const good = { ranked_options: [], risks: [], change_my_mind: [], conflicts: [], hold_for_human: false, hold_reason: null };
const reads = () => [call("get_engine_results"), call("get_documents"), call("get_profile")];

describe("phase two", () => {
  it("publishes a clean judgement, chains turns with previous_interaction_id and keeps the trace valid", async () => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", good)]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("published");
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0].previous_interaction_id).toBeUndefined();
    expect(client.requests[1].previous_interaction_id).toBe("ix-1");
    expect(client.requests[1].input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function_result", name: "get_engine_results", call_id: "call-get_engine_results" })]));
    expect((client.requests[0].generation_config as { thinking_level: string }).thinking_level).toBe("medium");
    const events = await store.getEvents(run.id);
    expect(verifyChain(events).ok).toBe(true);
    expect(events.filter((e) => e.type === "judge.turn").map((e) => JSON.parse(e.body).interactionId)).toEqual(["ix-1", "ix-2"]);
    const final = (await store.getRun(run.id))!;
    expect(final.turns).toBe(2);
    expect(final.totalCostUsd).toBeCloseTo(2 * (1000 * 2e-6 + 500 * 10e-6), 6);
  });
  it("blocks an untraceable number", async () => {
    const { store, run } = await setup();
    const bad = { ...good, risks: [{ risk_id: "output_prices", explanation: "You could lose £999k.", cites: [] }] };
    const client = fakeClient([reads, () => [call("submit_judgement", bad)]]);
    expect((await runPhaseTwo(run.id, { store, profile: demo.profileFields, client })).status).toBe("blocked");
  });
  it("holds when the agent asks for a human", async () => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", { ...good, hold_for_human: true, hold_reason: "Documents disagree." })]]);
    expect((await runPhaseTwo(run.id, { store, profile: demo.profileFields, client })).status).toBe("held");
  });
  it("refuses a function outside the allowlist and carries on", async () => {
    const { store, run } = await setup();
    const client = fakeClient([() => [call("delete_profile", { all: true })], () => [call("submit_judgement", good)]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("published");
    expect((await store.getEvents(run.id)).some((e) => e.type === "tool.denied")).toBe(true);
    const sent = (client.requests[1].input as { result: { text: string }[] }[])[0].result[0].text;
    expect(sent).toMatch(/not allowed/);
  });
  it("kill switch before the run ends it as killed without calling Gemini", async () => {
    const { store, run } = await setup();
    await store.setPaused(true, "farmer");
    const client = fakeClient([reads]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client, pollMs: 10 });
    expect(r.status).toBe("killed");
    expect(client.requests).toHaveLength(0);
    expect((await store.getEvents(run.id)).some((e) => e.type === "control.kill_switch")).toBe(true);
  });
  it("kill switch mid-run stops before the next tool runs", async () => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", good)]], { onCreate: async (turn) => { if (turn === 0) await store.setPaused(true, "farmer"); } });
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client, pollMs: 10 });
    expect(r.status).toBe("killed");
    expect(client.requests).toHaveLength(1);
    expect((await store.getEvents(run.id)).some((e) => e.type === "tool.result")).toBe(false);
  });
  it("kill switch aborts the in-flight Gemini request", async () => {
    const { store, run } = await setup();
    let sawAbort = false;
    const client: InteractionsClient = {
      interactions: {
        create: (_req, options) => new Promise<InteractionLike>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => { sawAbort = true; reject(new Error("aborted")); });
          void store.setPaused(true, "farmer");
        }),
      },
    };
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client, pollMs: 10 });
    expect(r.status).toBe("killed");
    expect(sawAbort).toBe(true);
    const events = await store.getEvents(run.id);
    expect(JSON.parse(events.find((e) => e.type === "control.kill_switch")!.body).where).toBe("poll");
    expect(events.some((e) => e.type === "judge.error")).toBe(false);
  });
  it("rejects a judgement that fails the schema and accepts the corrected one", async () => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", { ...good, hold_for_human: "maybe" })], () => [call("submit_judgement", good)]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("published");
    expect(client.requests).toHaveLength(3);
    expect((await store.getEvents(run.id)).some((e) => e.type === "judge.invalid_output")).toBe(true);
    const sent = (client.requests[2].input as { result: { text: string }[] }[])[0].result[0].text;
    expect(sent).toMatch(/Invalid judgement/);
  });
  it("stops at the budget cap computed from usage", async () => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", good)]], { usage: { total_input_tokens: 0, total_output_tokens: 1_000_000, total_thought_tokens: 0 } });
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("failed");
    expect((await store.getEvents(run.id)).some((e) => e.type === "control.budget_limit")).toBe(true);
    expect((await store.getRun(run.id))!.error).toMatch(/Budget/);
  });
  it("stops at the turn cap", async () => {
    const { store, run } = await setup();
    const client = fakeClient([() => [call("get_profile")]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("failed");
    expect(client.requests).toHaveLength(8);
    expect((await store.getEvents(run.id)).some((e) => e.type === "control.turn_limit")).toBe(true);
  });
  it("propose_change writes a pending change only with a verbatim quote from a known document", async () => {
    const { store, run, proposals } = await setup(true);
    const doc = (await store.getDocuments(demo.FARM_ID))[0];
    const proposal = (quote: string) => ({
      field_key: "sales.wheat_2027_forward_t", field_label: "2027 wheat sold forward", current_value: "0", proposed_value: "200",
      reason: "Contract sells 200 t forward", observation_id: doc.id, quote,
    });
    const client = fakeClient([
      () => [call("get_documents")],
      () => [call("propose_change", proposal("Quantity: 200 tonnes"), "p1"), call("propose_change", proposal("Quantity: 999 tonnes"), "p2")],
      () => [call("submit_judgement", good)],
    ]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("published");
    expect(proposals).toHaveLength(1);
    expect(proposals[0].evidence).toEqual({ observationId: doc.id, quote: "Quantity: 200 tonnes" });
    const events = await store.getEvents(run.id);
    expect(events.some((e) => e.type === "control.quote_not_verbatim")).toBe(true);
    expect(events.some((e) => e.type === "proposal.queued_for_farmer")).toBe(true);
  });
  it("stops proposals at the per-run cap", async () => {
    const { store, run, proposals } = await setup(true);
    const doc = (await store.getDocuments(demo.FARM_ID))[0];
    const p = (i: number) => call("propose_change", {
      field_key: "sales.wheat_2027_forward_t", field_label: "2027 wheat sold forward", current_value: "0", proposed_value: "200",
      reason: "Contract sells 200 t forward", observation_id: doc.id, quote: "Quantity: 200 tonnes",
    }, `p${i}`);
    const client = fakeClient([() => [p(1), p(2), p(3), p(4)], () => [call("submit_judgement", good)]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("published");
    expect(proposals).toHaveLength(3);
    expect((await store.getEvents(run.id)).filter((e) => e.type === "control.proposal_limit")).toHaveLength(1);
  });
  it("runs numbers only when there is no client", async () => {
    const { store, run } = await setup();
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client: null });
    expect(r.status).toBe("numbers_only");
  });
});
