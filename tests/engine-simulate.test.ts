import { describe, expect, it } from "vitest";
import { loadHistory } from "@/lib/engine/history";
import { calibrate } from "@/lib/engine/calibrate";
import { farmPnl, simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG, type FarmInputs, type History } from "@/lib/engine/types";
import { farmFromProfile } from "@/lib/engine/farm";
import * as demo from "@/lib/profile/fenland-ridge";
import { valuesOf } from "@/lib/profile/risk-profile";

const tiny: FarmInputs = {
  crops: { wheat: { areaHa: 100, yieldTHa: 8, forwardT: 200 }, barley: { areaHa: 0, yieldTHa: 0, forwardT: 0 }, osr: { areaHa: 0, yieldTHa: 0, forwardT: 0 } },
  stockT: { wheat: 0, barley: 0, osr: 0 },
  priceToday: { wheat: 180, barley: 0, osr: 0, an: 500, fuel: 100 },
  anNeedT: 10, anBoughtT: 0, anPricePaid: 0,
  dieselL: 1000, dieselBoughtPct: 0, sprayGbp: 1000, sfiAnnual: 10_000, fixedCosts: 50_000,
  loan: 100_000, loanVariable: true, loanMarginPct: 2, bankRatePct: 4, capitalRepayment: 10_000,
};

describe("farmPnl (worked example)", () => {
  it("matches the hand calculation with no shocks", () => {
    // revenue 200×180 + 600×180 = 144,000; AN 5,000; fuel 1,000; spray 1,000; fixed 50,000; interest 6,000; SFI +10,000
    const r = farmPnl(tiny, {});
    expect(r.profit).toBeCloseTo(91_000);
    expect(r.dscr).toBeCloseTo((91_000 + 6_000) / (6_000 + 10_000));
  });
  it("prices only the unsold tonnes at spot", () => {
    expect(farmPnl(tiny, { wheat: Math.log(0.9) }).profit).toBeCloseTo(80_200);
  });
  it("applies the scheme cut", () => {
    expect(farmPnl(tiny, {}, 0.5).profit).toBeCloseTo(86_000);
  });
});

describe("calibrate", () => {
  const h = loadHistory();
  it("uses no data after asOf", () => {
    const asOf = "2019-08-01";
    const poisoned = structuredClone(h) as History;
    for (const s of Object.values(poisoned)) for (const p of s.points) if (p.date > asOf && p.date.length > 4) p.value *= 10;
    for (const s of Object.values(poisoned)) for (const p of s.points) if (p.date.length === 4 && Number(p.date) >= 2019) p.value *= 10;
    expect(calibrate(poisoned, asOf, DEFAULT_CONFIG).sigma).toEqual(calibrate(h, asOf, DEFAULT_CONFIG).sigma);
  });
  it("refuses to fit with too little history", () => {
    expect(() => calibrate(h, "2015-06-01", DEFAULT_CONFIG)).toThrow(/months of joint history/);
  });
});

describe("simulate", () => {
  const h = loadHistory();
  const { farm } = farmFromProfile(valuesOf(demo.profileFields), demo.market);
  const cfg = { ...DEFAULT_CONFIG, paths: 4000 };
  const a = simulate(h, farm, "2026-08-01", cfg);
  it("is reproducible from the seed", () => {
    expect(simulate(h, farm, "2026-08-01", cfg).profit.p5.value).toBe(a.profit.p5.value);
  });
  it("orders its quantiles", () => {
    expect(a.profit.p5.value).toBeLessThan(a.profit.p50.value);
    expect(a.profit.p50.value).toBeLessThan(a.profit.p95.value);
  });
  it("scores every risk 1–10 and cites figures by id", () => {
    expect(a.risks).toHaveLength(5);
    for (const r of a.risks) {
      expect(r.score.value).toBeGreaterThanOrEqual(1);
      expect(r.score.value).toBeLessThanOrEqual(10);
      expect(a.figures[r.p5Hit.id]).toBe(r.p5Hit);
    }
  });
  it("selling wheat forward improves the bad year net of cost", () => {
    expect(a.options.find((o) => o.id === "sell_forward_wheat_50")!.p5Gain.value).toBeGreaterThan(0);
  });
  it("break-even wheat price really breaks even", () => {
    const be = a.figures["threshold.wheat_breakeven"].value;
    expect(Math.abs(farmPnl(farm, { wheat: Math.log(be / farm.priceToday.wheat) }).profit)).toBeLessThan(1);
  });
  it("gives a DSCR breach probability and a driver", () => {
    expect(a.dscr.pBelow.value).toBeGreaterThanOrEqual(0);
    expect(a.dscr.pBelow.value).toBeLessThanOrEqual(1);
    expect(a.dscr.mainDriver).toBeTruthy();
  });
  it("runs 10k paths fast", () => {
    const t = performance.now();
    simulate(h, farm, "2026-08-01", DEFAULT_CONFIG);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
