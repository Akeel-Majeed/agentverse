import { beforeEach, describe, expect, it, vi } from "vitest";
import * as demo from "@/lib/profile/fenland-ridge";

// lib/data.ts and the judge route on the in-memory stores, never a live database or API.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

beforeEach(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "TYPESAFE_API_KEY", "AGENT_TABLES", "RISK_AGENT_DATABASE_URL"]) delete process.env[k];
  delete (globalThis as { __agentStore?: unknown }).__agentStore;
  delete (globalThis as { __hedgedMockStore?: unknown }).__hedgedMockStore;
  vi.resetModules();
});

async function queuedRun() {
  const { getAgentStore } = await import("@/lib/server/agent-store");
  const { runPhaseOne } = await import("@/lib/assess/phase-one");
  const store = await getAgentStore();
  const { run } = await runPhaseOne({
    store, farmId: demo.FARM_ID, trigger: "demo", fields: demo.profileFields, market: demo.market,
    now: new Date(), jev: null, extract: null, geminiAvailable: true,
  });
  expect(run.status).toBe("queued");
  return { store, run };
}

describe("claimRun", () => {
  it("moves a queued run to running exactly once", async () => {
    const { store, run } = await queuedRun();
    const [a, b] = await Promise.all([store.claimRun(run.id), store.claimRun(run.id)]);
    expect([a?.status, b?.status].sort()).toEqual(["running", undefined].sort());
    expect((await store.getRun(run.id))!.status).toBe("running");
    expect(await store.claimRun("no-such-run")).toBeNull();
  });
});

describe("POST /api/judge/[runId]", () => {
  it("starts the judge once: a second request gets 409", async () => {
    const { run } = await queuedRun();
    const { POST } = await import("@/app/api/judge/[runId]/route");
    const call = () => POST(new Request(`http://localhost/api/judge/${run.id}`, { method: "POST" }), { params: { runId: run.id } });
    const statuses = (await Promise.all([call(), call()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });
  it("returns 404 for an unknown run", async () => {
    const { POST } = await import("@/app/api/judge/[runId]/route");
    const res = await POST(new Request("http://localhost/api/judge/x", { method: "POST" }), { params: { runId: "x" } });
    expect(res.status).toBe(404);
  });
});

describe("kill switch", () => {
  it("does not write to a queued run's chain (the judge owns it)", async () => {
    const { store, run } = await queuedRun();
    const before = (await store.getEvents(run.id)).length;
    const data = await import("@/lib/data");
    await data.setPaused(true);
    expect((await store.getEvents(run.id)).length).toBe(before);
    expect((await store.getControls()).paused).toBe(true);
    await data.setPaused(false);
  });
});

describe("approvals", () => {
  it("logs the farmer's approval and rejection of an agent proposal on the run's chain", async () => {
    const { getAgentStore } = await import("@/lib/server/agent-store");
    const { runPhaseOne } = await import("@/lib/assess/phase-one");
    const { verifyChain } = await import("@/lib/trace/chain");
    const store = await getAgentStore();
    const { run } = await runPhaseOne({
      store, farmId: demo.FARM_ID, trigger: "demo", fields: demo.profileFields, market: demo.market,
      now: new Date(), jev: null, extract: null, geminiAvailable: false,
    });
    const proposal = {
      runId: run.id, farmId: demo.FARM_ID, fieldKey: "sales.wheat_2027_forward_t", fieldLabel: "Wheat sold forward",
      currentValue: "0", proposedValue: "200", reason: "Contract", evidence: { observationId: "obs-1", quote: "200 tonnes" },
    };
    await store.insertProposal(proposal);
    await store.insertProposal({ ...proposal, proposedValue: "300" });
    const data = await import("@/lib/data");
    const mine = (await data.getPendingChanges()).filter((p) => p.source === "agent");
    expect(mine.map((p) => p.runId)).toEqual([run.id, run.id]);
    expect(mine[0].evidence).toEqual(proposal.evidence);
    const [reject, approve] = mine; // newest first
    expect(await data.approveChange(approve.id)).toMatchObject({ ok: true });
    await data.rejectChange(reject.id);
    const events = await store.getEvents(run.id);
    expect(events.slice(-2).map((e) => [e.type, e.actor])).toEqual([["proposal.approved", "human"], ["proposal.rejected", "human"]]);
    expect(JSON.parse(events.at(-2)!.body)).toMatchObject({ pendingChangeId: approve.id, fieldKey: "sales.wheat_2027_forward_t", proposedValue: "200", approvedValue: 200, by: "farmer" });
    expect(JSON.parse(events.at(-1)!.body)).toMatchObject({ pendingChangeId: reject.id, proposedValue: "300", by: "farmer" });
    expect(verifyChain(events).ok).toBe(true);
  });
});
