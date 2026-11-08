import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The readiness check is db.from(...).select(...).eq(...).limit(1).single(); answer it with `reply`.
let reply: { error: { message: string; code: string } | null };
vi.mock("@supabase/supabase-js", () => {
  const query = { select: () => query, eq: () => query, limit: () => query, single: async () => reply };
  return { createClient: () => ({ from: () => query }) };
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test";
  delete (globalThis as { __hedgedMockStore?: unknown }).__hedgedMockStore;
  vi.resetModules();
});

describe("choosing a store", () => {
  it("uses the demo store when Supabase isn't configured", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { getStore } = await import("@/lib/server/store");
    expect((await getStore()).kind).toBe("mock");
  });

  it("uses the demo store when the tables aren't there yet", async () => {
    reply = { error: { message: "Could not find the table 'public.latest_assessment'", code: "PGRST205" } };
    const { getStore } = await import("@/lib/server/store");
    expect((await getStore()).kind).toBe("mock");
  });

  it("fails on a network error instead of saving to memory", async () => {
    reply = { error: { message: "TypeError: fetch failed", code: "" } };
    const { getStore } = await import("@/lib/server/store");
    await expect(getStore()).rejects.toThrow(/fetch failed/);
    reply = { error: null };
    expect((await getStore()).kind).toBe("supabase");
  });
});

describe("chat memory in the demo store", () => {
  it("saves and reads the farm's notes", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { getStore } = await import("@/lib/server/store");
    const store = await getStore();
    expect(await store.getChatMemory()).toBeNull();
    const memory = { notes: "- asked about rates", turns: 1, updatedAt: "2026-11-07T20:00:00Z" };
    await store.saveChatMemory(memory);
    expect(await store.getChatMemory()).toEqual(memory);
  });
});
