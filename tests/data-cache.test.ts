import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// React's cache() memoises per server request; stand in with a plain memo (one "request" per test file).
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T extends (...args: string[]) => unknown>(fn: T) => {
    const memo = new Map<string, unknown>();
    return (...args: string[]) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key);
    };
  },
}));

describe("reads during one request", () => {
  it("load the assessment, snapshot, profile and news once however many getters a page calls", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const store = await (await import("@/lib/server/store")).getStore();
    const spies = (["getAssessment", "getSnapshot", "getProfileFields", "getSignals"] as const).map((m) => vi.spyOn(store, m));
    const data = await import("@/lib/data");
    // What /overview, /profile and /risks/[id] call between them.
    await Promise.all([
      data.getAssessmentMeta(),
      data.getRisks(),
      data.getRisk("output_prices"),
      data.getTopMitigations(),
      data.getProfitSummary(),
      data.getBreakEvens(),
      data.getRiskProfile(),
      data.getOnboarding(),
      data.getProfileStatus(),
      data.getRiskInputs("output_prices"),
    ]);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
