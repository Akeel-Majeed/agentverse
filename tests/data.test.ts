import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/data.ts runs on the in-memory demo store here: no Supabase env vars.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// React's cache() is per server request; these tests make several requests, so don't memoise.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const load = () => import("@/lib/data");

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete (globalThis as { __mockStore?: unknown }).__mockStore;
  vi.resetModules();
});

describe("approving a proposed change", () => {
  it("saves the value and marks it approved", async () => {
    const data = await load();
    const result = await data.approveChange("pc-wheat-sold");
    expect(result).toMatchObject({ ok: true, item: { status: "approved" } });
    const field = (await data.getRiskInputs("output_prices")).fields.find((f) => f.key === "sales.wheat_2026_unsold_t");
    expect(field?.value).toBe("828 t");
  });

  it("fails loudly and stays pending when the value doesn't parse", async () => {
    const data = await load();
    const result = await data.approveChange("pc-wheat-sold", "sold most of it");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Enter a number") });
    expect((await data.getPendingChanges()).find((p) => p.id === "pc-wheat-sold")?.status).toBe("pending");
    const field = (await data.getRiskInputs("output_prices")).fields.find((f) => f.key === "sales.wheat_2026_unsold_t");
    expect(field?.value).toBe("1,028 t");
  });
});

describe("re-running the assessment", () => {
  it("keeps the snapshot, so news since it still shows", async () => {
    const data = await load();
    const before = await data.getRiskProfile();
    await data.rerunAssessment();
    const after = await data.getRiskProfile();
    expect(after.snapshot.version).toBe(before.snapshot.version);
    expect(after.impacts.length).toBe(before.impacts.length);
    expect(after.impacts.length).toBeGreaterThan(0);
  });
});

describe("updating the risk profile", () => {
  it("removes the new snapshot if the assessment can't be saved", async () => {
    const data = await load();
    const store = await (await import("@/lib/server/store")).getStore();
    vi.spyOn(store, "insertAssessment").mockRejectedValueOnce(new Error("Supabase: save assessment: timeout"));
    await expect(data.updateRiskProfile("test")).rejects.toThrow(/timeout/);
    expect((await data.getRiskProfile()).snapshot.version).toBe(1);
  });

  it("says so when another tab updated it first", async () => {
    const data = await load();
    const results = await Promise.all([data.updateRiskProfile("tab 1"), data.updateRiskProfile("tab 2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: expect.stringContaining("another tab") });
    expect((await data.getRiskProfile()).snapshot.version).toBe(2);
  });
});
