import { beforeEach, describe, expect, it, vi } from "vitest";

// Same pattern as tests/data.test.ts: lib/data.ts on the in-memory demo store, never a live database or API.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

beforeEach(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "TYPESAFE_API_KEY", "AGENT_TABLES", "RISK_AGENT_DATABASE_URL", "MCP_TOKEN"]) delete process.env[k];
  delete (globalThis as { __agentStore?: unknown }).__agentStore;
  delete (globalThis as { __mockStore?: unknown }).__mockStore;
  vi.resetModules();
});

describe("MCP tools", () => {
  it("returns a covenant view with a probability and a hash", async () => {
    const { updateRiskProfile } = await import("@/lib/data");
    const { covenantViewTool } = await import("@/lib/mcp/tools");
    await updateRiskProfile("test");
    const v = await covenantViewTool();
    expect(v.available).toBe(true);
    if (v.available) {
      expect(v.probabilityBelowThreshold.value).toBeGreaterThanOrEqual(0);
      expect(v.dscrThreshold).toBe(1.25);
      expect(v.headHash).toMatch(/^[0-9a-f]{64}$/);
      expect(v.chainIntact).toBe(true);
    }
  });

  it("both tools and the assessment report the assessment's run at its current head, after phase 2", async () => {
    const data = await import("@/lib/data");
    const { covenantViewTool, riskProfileTool } = await import("@/lib/mcp/tools");
    const { getAgentStore } = await import("@/lib/server/agent-store");
    const { TraceWriter, verifyChain } = await import("@/lib/trace/chain");
    const { meta } = (await data.updateRiskProfile("test")) as { meta: { runId: string; headHash: string } };
    // Phase 2 extends the assessment's run after the assessment was stored.
    const store = await getAgentStore();
    const last = (await store.getEvents(meta.runId)).at(-1)!;
    await TraceWriter.resume(meta.runId, store, last.seq, last.hash).append("run.end", "code", { status: "published" });
    await store.updateRun(meta.runId, { status: "published" });
    // A later document run must not be what the bank sees.
    await data.addDocument("note.txt", "Wheat sold forward: 200 t.");
    const head = verifyChain(await store.getEvents(meta.runId)).head;
    expect(head).not.toBe(meta.headHash);
    const [cov, profile, now] = await Promise.all([covenantViewTool(), riskProfileTool(), data.getAssessmentMeta()]);
    expect(cov).toMatchObject({ available: true, runId: meta.runId, headHash: head, chainIntact: true });
    expect(profile).toMatchObject({ runId: meta.runId, headHash: head, chainIntact: true, runStatus: "published" });
    expect(now).toMatchObject({ runId: meta.runId, headHash: head, runStatus: "published" });
  });

  it("says no run yet before any assessment", async () => {
    const { covenantViewTool } = await import("@/lib/mcp/tools");
    expect(await covenantViewTool()).toEqual({ available: false, reason: "No run yet" });
  });

  it("returns five risks", async () => {
    const { riskProfileTool } = await import("@/lib/mcp/tools");
    expect((await riskProfileTool()).risks).toHaveLength(5);
  });
});

describe("MCP route", () => {
  const call = (auth?: string) =>
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

  it("returns 503 when MCP_TOKEN is unset", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    expect((await POST(call("Bearer x"))).status).toBe(503);
  });

  it("returns 401 on a wrong token", async () => {
    process.env.MCP_TOKEN = "secret";
    const { POST } = await import("@/app/api/mcp/route");
    expect((await POST(call("Bearer wrong"))).status).toBe(401);
    expect((await POST(call())).status).toBe(401);
  });

  it("lists exactly the two read-only tools with the right token", async () => {
    process.env.MCP_TOKEN = "secret";
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(call("Bearer secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["covenant_view", "get_risk_profile"]);
  });
});
