import { describe, expect, it } from "vitest";
import { loadHistory } from "@/lib/engine/history";
import { monthlyBacktest, summarise, wholeFarmBacktest } from "@/lib/engine/backtest";
import { DEFAULT_CONFIG } from "@/lib/engine/types";

describe("monthly walk-forward", () => {
  const h = loadHistory();
  const rows = monthlyBacktest(h, "wheat", { ...DEFAULT_CONFIG, paths: 2000 });
  it("forecasts only from data at or before each origin", () => {
    for (const r of rows) expect(r.origin < "2099").toBe(true);
    expect(new Set(rows.map((r) => r.origin)).size * 3).toBe(rows.length);
  });
  it("has about 100 forecasts per model", () => {
    expect(rows.filter((r) => r.model === "mc").length).toBeGreaterThan(90);
  });
  it("summarises with intervals and listed breaches", () => {
    const s = summarise(rows, "2024-01-01");
    const mc = s.find((x) => x.model === "mc" && x.period === "all")!;
    expect(mc.breachLowCI[0]).toBeLessThanOrEqual(mc.breachLowRate);
    expect(mc.breachLowCI[1]).toBeGreaterThanOrEqual(mc.breachLowRate);
    expect(mc.breachMonths.length).toBe(Math.round(mc.breachLowRate * mc.n) + Math.round(mc.breachHighRate * mc.n));
  });
});

describe("whole-farm table", () => {
  it("covers harvest years 2019–2025", () => {
    const rows = wholeFarmBacktest(loadHistory(), { ...DEFAULT_CONFIG, paths: 2000 });
    expect(rows.map((r) => r.harvestYear)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    for (const r of rows) expect(r.p5).toBeLessThan(r.p95);
  });
});
