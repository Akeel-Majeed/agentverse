import { describe, expect, it } from "vitest";
import { createMemoryAgentStore } from "@/lib/server/agent-store";
import { runPhaseOne } from "@/lib/assess/phase-one";
import { runPhaseTwo } from "@/lib/agents/risk/run";
import type { FunctionCallStep, InteractionLike, InteractionsClient } from "@/lib/agents/risk/gemini";
import { verifyChain } from "@/lib/trace/chain";
import type { AgentProposal, EngineResultEvent } from "@/lib/trace/types";
import type { AgentStore } from "@/lib/server/agent-store";
import * as demo from "@/lib/profile/fenland-ridge";

const DOC_TEXT = "GRAIN PURCHASE CONTRACT. Seller: Fenland Ridge Farm Ltd. Commodity: feed wheat, harvest 2027. Quantity: 200 tonnes. Price: £185 per tonne.";
const cleanJev = async () => ({ injection: 0.01, unsupported_change: 0.01 });

async function setup(withDoc = false, docName = "contract.txt") {
  const proposals: AgentProposal[] = [];
  const store = createMemoryAgentStore(async (p) => { proposals.push(p); });
  const { run } = await runPhaseOne({
    store, farmId: demo.FARM_ID, trigger: withDoc ? "document" : "demo", fields: demo.profileFields, market: demo.market, now: new Date(),
    document: withDoc ? { name: docName, text: DOC_TEXT } : undefined, jev: withDoc ? cleanJev : null, extract: null, geminiAvailable: true,
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
const simOf = async (store: AgentStore, runId: string) => (JSON.parse((await store.getEvents(runId)).find((e) => e.type === "engine.result")!.body) as EngineResultEvent).sim;

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
  it("blocks untraced numbers in every prose field, including conflict values", async () => {
    const { store, run } = await setup(true);
    const doc = (await store.getDocuments(demo.FARM_ID))[0];
    const conflict = { observation_id: doc.id, field_key: "sales.wheat_2027_forward_t", document_value: "999", profile_value: "0", explanation: "The contract and the profile differ." };
    for (const bad of [
      { ...good, conflicts: [conflict] },
      { ...good, hold_for_human: true, hold_reason: "A 31 per cent chance." },
      { ...good, risks: [{ risk_id: "output_prices", explanation: "Prices could gain you 42,000 pounds.", cites: [] }] },
    ]) {
      const { store: s2, run: r2 } = await setup(true);
      const client = fakeClient([reads, () => [call("submit_judgement", bad)]]);
      expect((await runPhaseTwo(r2.id, { store: s2, profile: demo.profileFields, client })).status).toBe("blocked");
    }
    const ok = { ...conflict, document_value: "200" };
    const client = fakeClient([reads, () => [call("submit_judgement", { ...good, conflicts: [ok] })]]);
    expect((await runPhaseTwo(run.id, { store, profile: demo.profileFields, client })).status).toBe("published");
  });
  it("blocks a gain claimed for a figure the engine computed as negative", async () => {
    const { store, run } = await setup();
    const sim = await simOf(store, run.id);
    const neg = Object.values(sim.figures).find((f) => f.unit === "gbp" && f.value < -1000)!;
    const claim = neg.display.replace("−", "");
    const client = fakeClient([reads, () => [call("submit_judgement", { ...good, risks: [{ risk_id: "output_prices", explanation: `This gains ${claim}.`, cites: [neg.id] }] })]]);
    expect((await runPhaseTwo(run.id, { store, profile: demo.profileFields, client })).status).toBe("blocked");
  });
  it("publishes engine display strings with real figure ids", async () => {
    const { store, run } = await setup();
    const sim = await simOf(store, run.id);
    const opt = sim.options[0], th = sim.thresholds[0], risk = sim.risks[0];
    const judgement = {
      ...good,
      ranked_options: [{ option_id: opt.id, rank: 1, reason: `Costs ${opt.cost.display}; changes the 1-in-20 profit by ${opt.p5Gain.display}.`, cites: [opt.cost.id, opt.p5Gain.id] }],
      risks: [{ risk_id: risk.riskId, explanation: `Scores ${risk.score.display}.`, cites: [risk.score.id] }],
      change_my_mind: [{ threshold_id: th.id, statement: `At ${th.display} the ranking changes.` }],
    };
    const client = fakeClient([reads, () => [call("submit_judgement", judgement)]]);
    expect((await runPhaseTwo(run.id, { store, profile: demo.profileFields, client })).status).toBe("published");
  });
  it.each([
    ["an unknown option id", { ranked_options: [{ option_id: "sell_the_farm", rank: 1, reason: "No.", cites: [] }] }],
    ["an unknown cited figure", { risks: [{ risk_id: "output_prices", explanation: "Prices move.", cites: ["profit.p1"] }] }],
    ["an unknown threshold", { change_my_mind: [{ threshold_id: "threshold.moon", statement: "If the moon falls." }] }],
    ["an unknown risk", { risks: [{ risk_id: "asteroids", explanation: "Rocks.", cites: [] }] }],
  ])("blocks %s", async (_label, patch) => {
    const { store, run } = await setup();
    const client = fakeClient([reads, () => [call("submit_judgement", { ...good, ...patch })]]);
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("blocked");
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
  describe("propose_change checks in code", () => {
    const base = (docId: string) => ({
      field_key: "sales.wheat_2027_forward_t", field_label: "2027 wheat sold forward", current_value: "12345", proposed_value: "200",
      reason: "Contract sells 200 t forward", observation_id: docId, quote: "Quantity: 200 tonnes",
    });
    async function propose(args: (docId: string) => Record<string, unknown>, opts: { docName?: string; otherRun?: boolean } = {}) {
      const { store, run, proposals } = await setup(true, opts.docName);
      const doc = (await store.getDocuments(demo.FARM_ID))[0];
      let target = run;
      if (opts.otherRun) target = (await runPhaseOne({ store, farmId: demo.FARM_ID, trigger: "demo", fields: demo.profileFields, market: demo.market, now: new Date(), jev: null, extract: null, geminiAvailable: true })).run;
      const client = fakeClient([() => [call("get_documents")], () => [call("propose_change", args(doc.id), "p1")], () => [call("submit_judgement", good)]]);
      await runPhaseTwo(target.id, { store, profile: demo.profileFields, client });
      const result = (await store.getEvents(target.id)).filter((e) => e.type === "tool.result" && JSON.parse(e.body).tool === "propose_change").map((e) => JSON.parse(e.body).result);
      return { proposals, result: result[0] };
    }
    it("fills the current value and label from the profile and catalogue, not the model", async () => {
      const { proposals } = await propose(base);
      expect(proposals).toHaveLength(1);
      const current = demo.profileFields.find((f) => f.key === "sales.wheat_2027_forward_t")?.value;
      expect(proposals[0].currentValue).toBe(current === undefined || current === null ? "not set" : String(current));
      expect(proposals[0].fieldLabel).toBe("2027 wheat sold forward");
    });
    it.each([
      ["a quote that does not contain the proposed value", (id: string) => ({ ...base(id), proposed_value: "250" })],
      ["a field key outside the catalogue", (id: string) => ({ ...base(id), field_key: "bank.overdraft_limit" })],
      ["an untraced number in the reason", (id: string) => ({ ...base(id), reason: "Selling 200 t forward saves £999k" })],
      ["a quote shorter than 8 characters", (id: string) => ({ ...base(id), quote: "200 ton" })],
      ["a proposed value with a multiplier", (id: string) => ({ ...base(id), proposed_value: "200k" })],
      ["a negative proposed value", (id: string) => ({ ...base(id), proposed_value: "-200" })],
      ["a proposed value in exponent form", (id: string) => ({ ...base(id), proposed_value: "2e2" })],
      ["a proposed value with extra digits", (id: string) => ({ ...base(id), proposed_value: "2,000" })],
    ])("rejects %s", async (_label, args) => {
      const { proposals, result } = await propose(args);
      expect(proposals).toHaveLength(0);
      expect(result.error).toBeTruthy();
    });
    it("matches the quote against the document text only, not its file name", async () => {
      const { proposals } = await propose((id) => ({ ...base(id), proposed_value: "750", quote: "Quantity 750 tonnes" }), { docName: "Quantity 750 tonnes.txt" });
      expect(proposals).toHaveLength(0);
    });
    it("only accepts documents observed in this run", async () => {
      const { proposals, result } = await propose(base, { otherRun: true });
      expect(proposals).toHaveLength(0);
      expect(result.error).toMatch(/observation_id/);
    });
  });
  it("stops at the run deadline and ends the run failed", async () => {
    const { store, run } = await setup();
    const client: InteractionsClient = {
      interactions: { create: (_req, options) => new Promise<InteractionLike>((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }) },
    };
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client, deadlineMs: 50 });
    expect(r.status).toBe("failed");
    const events = await store.getEvents(run.id);
    expect(events.some((e) => e.type === "control.deadline")).toBe(true);
    expect(events[events.length - 1].type).toBe("run.end");
    expect((await store.getRun(run.id))!.error).toMatch(/deadline/i);
  });
  it("treats a response without usage as the budget control firing", async () => {
    const { store, run } = await setup();
    const client: InteractionsClient = { interactions: { create: async () => ({ id: "ix-1", status: "completed", steps: reads() }) } };
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client });
    expect(r.status).toBe("failed");
    const budget = (await store.getEvents(run.id)).find((e) => e.type === "control.budget_limit");
    expect(JSON.parse(budget!.body).reason).toBe("usage missing");
  });
  it("stops the run when the kill-switch read fails (fail closed)", async () => {
    const { store, run } = await setup();
    let reads = 0;
    const flaky: AgentStore = { ...store, getControls: async () => { if (++reads > 2) throw new Error("db down"); return store.getControls(); } };
    const client: InteractionsClient = {
      interactions: { create: (_req, options) => new Promise<InteractionLike>((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }) },
    };
    const r = await runPhaseTwo(run.id, { store: flaky, profile: demo.profileFields, client, pollMs: 10 });
    expect(r.status).toBe("killed");
    const events = await store.getEvents(run.id);
    expect(events.some((e) => e.type === "control.kill_switch")).toBe(true);
    expect(events[events.length - 1].type).toBe("run.end");
  });
  it("ends the run failed, never stuck running, when the final controls read throws", async () => {
    const { store, run } = await setup();
    const flaky: AgentStore = {
      ...store,
      getControls: async () => {
        if ((await store.getEvents(run.id)).some((e) => e.type === "checker.result")) throw new Error("db down");
        return store.getControls();
      },
    };
    const client = fakeClient([reads, () => [call("submit_judgement", good)]]);
    const r = await runPhaseTwo(run.id, { store: flaky, profile: demo.profileFields, client });
    expect(r.status).toBe("failed");
    expect((await store.getRun(run.id))!.status).toBe("failed");
    const events = await store.getEvents(run.id);
    expect(events[events.length - 1].type).toBe("run.end");
  });
  it("runs numbers only when there is no client", async () => {
    const { store, run } = await setup();
    const r = await runPhaseTwo(run.id, { store, profile: demo.profileFields, client: null });
    expect(r.status).toBe("numbers_only");
  });
});
