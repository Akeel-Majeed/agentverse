import { describe, expect, it, vi } from "vitest";
import { summariseProfits } from "@/lib/engine/distribution";
import { farmFromProfile } from "@/lib/engine/farm";
import { loadHistory } from "@/lib/engine/history";
import { profitPaths, simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/types";
import * as demo from "@/lib/profile/fenland-ridge";
import { valuesOf } from "@/lib/profile/risk-profile";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

describe("the overview's Monte Carlo chart", () => {
  it("draws the same simulated years as the published figures", () => {
    const { farm } = farmFromProfile(valuesOf(demo.profileFields), demo.market);
    const h = loadHistory();
    const sim = simulate(h, farm, "2026-11-07", DEFAULT_CONFIG);
    const d = summariseProfits(profitPaths(h, farm, "2026-11-07", DEFAULT_CONFIG));
    expect(d.paths).toBe(DEFAULT_CONFIG.paths);
    expect(d.mean).toBeCloseTo(sim.profit.mean.value, 6);
    expect(d.p5).toBeCloseTo(sim.profit.p5.value, 6);
    expect(d.p95).toBeCloseTo(sim.profit.p95.value, 6);
    expect(d.lossProb).toBeCloseTo(sim.profit.lossProb.value, 9);
    expect(d.bins.reduce((s, b) => s + b.count, 0)).toBe(DEFAULT_CONFIG.paths);
  });

  it("is served by the data layer for the current snapshot", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    vi.resetModules();
    const s = await (await import("@/lib/data")).getProfitSimulation();
    expect(s).toMatchObject({ paths: DEFAULT_CONFIG.paths, seed: DEFAULT_CONFIG.seed, snapshotVersion: 1 });
    expect(s!.p5).toBeLessThan(s!.p50);
    expect(s!.p50).toBeLessThan(s!.p95);
    console.log("MC", JSON.stringify({ mean: s!.mean, p5: s!.p5, p95: s!.p95, loss: s!.lossProb, asOf: s!.asOf }));
  });
});
