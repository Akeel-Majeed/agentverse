import { beforeEach, describe, expect, it, vi } from "vitest";
import * as demo from "@/lib/profile/fenland-ridge";

// lib/data.ts and the judge route on the in-memory stores, never a live database or API.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

beforeEach(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "TYPESAFE_API_KEY", "AGENT_TABLES", "RISK_AGENT_DATABASE_URL"]) delete process.env[k];
  delete (globalThis as { __agentStore?: unknown }).__agentStore;
  delete (globalThis as { __mockStore?: unknown }).__mockStore;
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
