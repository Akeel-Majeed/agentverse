/** Strategy and whole-farm benchmarks over harvest years (docs/eval/benchmark.md). Walk-forward: each year uses only data at its origin. */
import { farmAt, realisedShock } from "./backtest";
import { yieldFit } from "./calibrate";
import { mean, sd } from "./linalg";
import { mulberry32 } from "./rng";
import { farmPnl, profitPaths } from "./simulate";
import { pinball, quantile, wilson } from "./stats";
import { type FactorId, type FarmInputs, type History, type SimConfig, YIELD_FACTORS } from "./types";

/** Sell `share` of expected wheat forward at the origin price, paying `costGbpT` a tonne. Same rule as the sell_forward_wheat_50 option. */
export function withForward(farm: FarmInputs, share: number, costGbpT: number): FarmInputs {
  const t = share * farm.crops.wheat.areaHa * farm.crops.wheat.yieldTHa;
  return { ...farm, crops: { ...farm.crops, wheat: { ...farm.crops.wheat, forwardT: t } }, fixedCosts: farm.fixedCosts + t * costGbpT };
}

export const STRATEGIES = [
  { id: "do_nothing", label: "Do nothing (sell all at harvest)", share: 0 },
  { id: "forward_50", label: "Sell 50% forward (the agent's option)", share: 0.5 },
  { id: "forward_100", label: "Sell 100% forward", share: 1 },
] as const;

const missingYield = (h: History, year: number) => YIELD_FACTORS.some((f) => !h[f].points.some((p) => p.date === String(year)));

/** Percentile bootstrap 95% interval of the mean. Seeded, so reruns match. */
export function bootMean(xs: number[], seed = 42, n = 10_000): [number, number] {
  const r = mulberry32(seed);
  const m = Float64Array.from({ length: n }, () => mean(xs.map(() => xs[Math.floor(r() * xs.length)]))).sort();
  return [quantile(m, 0.025), quantile(m, 0.975)];
}

export function hedgeBacktest(h: History, cfg: SimConfig, years: number[]) {
  const rows = years.map((year) => {
    const asOf = `${year - 1}-08-01`, at = `${year}-08-01`;
    const farm = farmAt(h, asOf);
    const shock = realisedShock(h, asOf, at, year);
    const profit = Object.fromEntries(STRATEGIES.map((s) => [s.id, farmPnl(withForward(farm, s.share, cfg.optionCosts.forwardGbpT), shock).profit]));
    return {
      harvestYear: year, origin: asOf, harvest: at,
      wheatOriginGbpT: farm.priceToday.wheat, wheatHarvestGbpT: farm.priceToday.wheat * Math.exp(shock.wheat!),
      yieldsImputedAtTrend: missingYield(h, year),
      profit: profit as Record<(typeof STRATEGIES)[number]["id"], number>,
    };
  });
  const summary = STRATEGIES.map((s) => {
    const p = rows.map((r) => r.profit[s.id]);
    const sorted = [...p].sort((a, b) => a - b);
    const gain = rows.map((r) => r.profit[s.id] - r.profit.do_nothing);
    const tonnes = s.share * farmAt(h, rows[0].origin).crops.wheat.areaHa * farmAt(h, rows[0].origin).crops.wheat.yieldTHa;
    return {
      strategy: s.id, label: s.label, n: p.length,
      meanProfit: mean(p), meanProfitCI: bootMean(p),
      worstYear: sorted[0], worstYearHarvest: rows[p.indexOf(sorted[0])].harvestYear,
      p5: quantile(sorted, 0.05),
      sdAcrossYears: sd(p),
      tailMeanWorst2: mean(sorted.slice(0, 2)),
      hedgeCostPerYear: tonnes * cfg.optionCosts.forwardGbpT, hedgeCostTotal: tonnes * cfg.optionCosts.forwardGbpT * p.length,
      meanGainVsNothing: mean(gain), meanGainVsNothingCI: bootMean(gain),
      yearsWorseThanNothing: s.share === 0 ? [] : rows.filter((r) => r.profit[s.id] < r.profit.do_nothing).map((r) => r.harvestYear),
    };
  });
  return { rows, summary };
}

/**
 * Historical simulation for the whole farm: every 12-month price and rate move ending on or before asOf,
 * crossed with every past year's yield residuals (price and yield taken as independent; no scheme cut).
 */
export function histSimProfits(h: History, farm: FarmInputs, asOf: string): number[] {
  const months = h.wheat.points.filter((p) => p.date <= asOf).map((p) => p.date);
  const lvl = (f: FactorId, d: string) => h[f as "wheat"].points.filter((p) => p.date <= d).at(-1)!.value;
  const fits = Object.fromEntries(YIELD_FACTORS.map((f) => [f, yieldFit(h[f], asOf)]));
  const yieldYears = fits.yield_wheat.resid.map((r) => r.year).filter((y) => YIELD_FACTORS.every((f) => fits[f].resid.some((r) => r.year === y)));
  const out: number[] = [];
  for (let i = 12; i < months.length; i++) {
    const [a, b] = [months[i - 12], months[i]];
    const price: Partial<Record<FactorId, number>> = { bank_rate: lvl("bank_rate", b) - lvl("bank_rate", a) };
    for (const f of ["wheat", "barley", "osr", "an", "fuel"] as const) price[f] = Math.log(lvl(f, b) / lvl(f, a));
    for (const y of yieldYears) {
      const s = { ...price };
      for (const f of YIELD_FACTORS) s[f] = fits[f].resid.find((r) => r.year === y)!.r;
      out.push(farmPnl(farm, s).profit);
    }
  }
  return out;
}

export const FORECAST_MODELS = ["mc", "normal_refit", "hist_sim"] as const;
type Model = (typeof FORECAST_MODELS)[number];

/** Whole-farm P5/P50/P95 from each model at August of the year before, against the realised profit. */
export function forecastBenchmark(h: History, cfg: SimConfig, years: number[], heldOutFrom: string) {
  const rows = years.flatMap((year) => {
    const asOf = `${year - 1}-08-01`;
    const farm = farmAt(h, asOf);
    const realised = farmPnl(farm, realisedShock(h, asOf, `${year}-08-01`, year)).profit;
    const dists: Record<Model, Float64Array> = {
      mc: profitPaths(h, farm, asOf, cfg).sort(),
      // ponytail: Student-t with nu = 200 is numerically Gaussian; same calibration and seed as mc.
      normal_refit: profitPaths(h, farm, asOf, { ...cfg, nu: 200 }).sort(),
      hist_sim: Float64Array.from(histSimProfits(h, farm, asOf)).sort(),
    };
    return FORECAST_MODELS.map((model) => {
      const [p5, p50, p95] = [0.05, 0.5, 0.95].map((q) => quantile(dists[model], q));
      return {
        harvestYear: year, origin: asOf, heldOut: asOf >= heldOutFrom, model, p5, p50, p95, realised,
        yieldsImputedAtTrend: missingYield(h, year), scenarios: dists[model].length,
        inside: realised >= p5 && realised <= p95, breachLow: realised < p5, breachHigh: realised > p95,
        pinballP5: pinball(realised, 0.05, p5), pinballP50: pinball(realised, 0.5, p50), pinballP95: pinball(realised, 0.95, p95),
      };
    });
  });
  const summarise = (period: "all" | "held_out") => FORECAST_MODELS.map((model) => {
    const g = rows.filter((r) => r.model === model && (period === "all" || r.heldOut));
    const inside = g.filter((r) => r.inside).length;
    const p5 = g.map((r) => r.pinballP5);
    return {
      model, period, n: g.length,
      coverage: inside / g.length, coverageCI: wilson(inside, g.length),
      breachLowYears: g.filter((r) => r.breachLow).map((r) => r.harvestYear),
      breachHighYears: g.filter((r) => r.breachHigh).map((r) => r.harvestYear),
      pinballP5: mean(p5), pinballP5CI: g.length > 1 ? bootMean(p5) : ([NaN, NaN] as [number, number]),
      pinballP50: mean(g.map((r) => r.pinballP50)), pinballP95: mean(g.map((r) => r.pinballP95)),
    };
  });
  return { rows, summary: [...summarise("all"), ...summarise("held_out")] };
}
