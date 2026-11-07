import { afterEach, describe, expect, it, vi } from "vitest";

const handle = vi.fn(async () => "answered");
vi.mock("@/lib/agents/chat/inkbox", () => ({ liveDeps: {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));
vi.mock("@/lib/agents/chat/imessage", async (orig) => ({ ...(await orig<object>()), handleIMessage: (...a: unknown[]) => handle(...(a as [])) }));
vi.mock("@inkbox/sdk", () => ({ verifyWebhook: ({ headers }: { headers: Record<string, string> }) => headers["x-test-valid"] === "yes" }));

import { POST } from "@/app/api/inkbox/webhook/route";

const body = JSON.stringify({
  id: "evt_1",
  event_type: "imessage.received",
  timestamp: "2026-11-07T20:00:00Z",
  data: { message: { id: "m1", conversation_id: "c1", direction: "inbound", content: "hi", is_group: false, created_at: "2026-11-07T20:00:00Z" }, reaction: null, contacts: [], agent_identities: [] },
});
const req = (valid: boolean, b = body) => new Request("http://x/api/inkbox/webhook", { method: "POST", body: b, headers: valid ? { "x-test-valid": "yes" } : {} });

describe("Inkbox webhook route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    handle.mockClear();
  });

  it("refuses to run without a signing secret", async () => {
    vi.stubEnv("INKBOX_WEBHOOK_SECRET", "");
    expect((await POST(req(true))).status).toBe(503);
  });

  it("rejects a bad signature", async () => {
    vi.stubEnv("INKBOX_WEBHOOK_SECRET", "whsec_test");
    expect((await POST(req(false))).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("accepts a signed inbound message and hands it to the agent", async () => {
    vi.stubEnv("INKBOX_WEBHOOK_SECRET", "whsec_test");
    expect((await POST(req(true))).status).toBe(202);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("acknowledges other events without answering", async () => {
    vi.stubEnv("INKBOX_WEBHOOK_SECRET", "whsec_test");
    const delivered = body.replace("imessage.received", "imessage.delivered");
    expect((await POST(req(true, delivered))).status).toBe(204);
    expect(handle).not.toHaveBeenCalled();
  });
});
