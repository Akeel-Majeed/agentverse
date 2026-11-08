import { monthlyChanges, yieldFit } from "./calibrate";
import { farmFromProfile } from "./farm";
import { mean, sd } from "./linalg";
import { mulberry32, normalSampler, tScale } from "./rng";
import { configHash, farmPnl, simulate } from "./simulate";
import { christoffersen, kupiec, pinball, quantile, wilson } from "./stats";
import { CROPS, type BacktestRow, type BacktestSummary, type FactorId, type FarmInputs, type History, type PriceFactor, type SimConfig, type WholeFarmRow, YIELD_FACTORS } from "./types";
import * as demo from "../profile/fenland-ridge";
import { valuesOf } from "../profile/risk-profile";

export const BACKTEST_SERIES: PriceFactor[] = ["wheat", "barley", "osr", "an", "fuel"];

/** 1-month-ahead P5/P95 at every month after the warm-up. Non-overlapping by construction. */
export function monthlyBacktest(h: History, series: PriceFactor, cfg: SimConfig): BacktestRow[] {
  const pts = h[series].points;
  const hash = configHash(cfg);
  const normal = normalSampler(mulberry32(cfg.seed));
  const t = Float64Array.from({ length: cfg.paths }, () => normal() * tScale(normal, cfg.nu)).sort();
  const tq05 = quantile(t, 0.05), tq95 = quantile(t, 0.95);
  const rows: BacktestRow[] = [];
  for (let i = cfg.warmupMonths; i < pts.length - 1; i++) {
    const origin = pts[i].date;
    const changes = monthlyChanges(h[series], origin).map((c) => c.change);
    const sigma = sd(changes);
    const level = pts[i].value;
    const realised = pts[i + 1].value;
    const recent = changes.slice(-36).sort((a, b) => a - b);
    const preds: Record<BacktestRow["model"], [number, number]> = {
      mc: [level * Math.exp(sigma * tq05), level * Math.exp(sigma * tq95)],
      normal_refit: [level * Math.exp(-1.645 * sigma), level * Math.exp(1.645 * sigma)],
      hist_sim: [level * Math.exp(quantile(recent, 0.05)), level * Math.exp(quantile(recent, 0.95))],
    };
    for (const model of ["mc", "normal_refit", "hist_sim"] as const) {
      const [p5, p95] = preds[model];
      rows.push({
        series, origin, horizonMonths: 1, model, p5, p95, realised,
        breachLow: realised < p5, breachHigh: realised > p95,
        pinball: (pinball(realised, 0.05, p5) + pinball(realised, 0.95, p95)) / 2 / level,
        configHash: hash,
      });
    }
  }
  return rows;
}

export function summarise(rows: BacktestRow[], heldOutFrom: string): BacktestSummary[] {
  const out: BacktestSummary[] = [];
  const groups = new Map<string, BacktestRow[]>();
  for (const r of rows) {
    for (const period of ["all", r.origin >= heldOutFrom ? "held_out" : "development"] as const) {
      const key = `${r.series}|${r.model}|${period}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }
  for (const [key, g] of Array.from(groups)) {
    const [series, model, period] = key.split("|") as [FactorId, BacktestRow["model"], BacktestSummary["period"]];
    const lows = g.filter((r) => r.breachLow).length;
    const highs = g.filter((r) => r.breachHigh).length;
    out.push({
      series, model, period, n: g.length,
      breachLowRate: lows / g.length, breachLowCI: wilson(lows, g.length),
      breachHighRate: highs / g.length, breachHighCI: wilson(highs, g.length),
      kupiecLowP: kupiec(lows, g.length, 0.05),
      christoffersenLowP: christoffersen(g.map((r) => r.breachLow)),
      pinballMean: mean(g.map((r) => r.pinball)),
      breachMonths: g.filter((r) => r.breachLow || r.breachHigh).map((r) => `${r.origin}${r.breachLow ? " low" : " high"}`),
    });
  }
  return out;
}

const level = (h: History, f: PriceFactor | "bank_rate", date: string) => {
  const p = h[f].points.filter((x) => x.date <= date).at(-1);
  if (!p) throw new Error(`No ${f} on or before ${date}`);
  return p.value;
};

/** The fictional farm as it would have stood at asOf: unhedged, no stock, prices anchored to today's £/t through the Defra index. */
export function farmAt(h: History, asOf: string): FarmInputs {
  const { farm: today } = farmFromProfile(valuesOf(demo.profileFields), demo.market);
  const latest = (f: PriceFactor) => h[f].points.at(-1)!.value;
  // £/t at asOf = today's £/t × index(asOf) ÷ index(latest). Labelled as an index-anchored estimate.
  const priceToday = Object.fromEntries(
    (["wheat", "barley", "osr", "an", "fuel"] as const).map((f) => [f, (today.priceToday[f] * level(h, f, asOf)) / latest(f)]),
  ) as FarmInputs["priceToday"];
  return {
    ...today,
    crops: Object.fromEntries(CROPS.map((c) => [c, { ...today.crops[c], forwardT: 0 }])) as FarmInputs["crops"],
    stockT: { wheat: 0, barley: 0, osr: 0 },
    anBoughtT: 0,
    dieselBoughtPct: 0,
    priceToday,
    bankRatePct: level(h, "bank_rate", asOf),
  };
}

/** What actually happened between asOf and at: price log-changes, rate change, yield vs trend (0 = trend when a year is missing). */
export function realisedShock(h: History, asOf: string, at: string, year: number): Partial<Record<FactorId, number>> {
  const shock: Partial<Record<FactorId, number>> = {};
  for (const f of ["wheat", "barley", "osr", "an", "fuel"] as const) shock[f] = Math.log(level(h, f, at) / level(h, f, asOf));
  shock.bank_rate = level(h, "bank_rate", at) - level(h, "bank_rate", asOf);
  for (const f of YIELD_FACTORS) {
    const fit = yieldFit(h[f], asOf);
    const actual = h[f].points.find((p) => p.date === String(year));
    shock[f] = actual ? actual.value / (fit.intercept + fit.slope * year) - 1 : 0;
  }
  return shock;
}

/** Harvest years 2019–2025: forecast from August of the year before, farm held fixed and unhedged. */
export function wholeFarmBacktest(h: History, cfg: SimConfig): WholeFarmRow[] {
  const rows: WholeFarmRow[] = [];
  for (let year = 2019; year <= 2025; year++) {
    const asOf = `${year - 1}-08-01`;
    const farm = farmAt(h, asOf);
    const sim = simulate(h, farm, asOf, cfg);
    const realised = farmPnl(farm, realisedShock(h, asOf, `${year}-08-01`, year)).profit;
    rows.push({
      harvestYear: year, asOf,
      p5: sim.profit.p5.value, p50: sim.profit.p50.value, p95: sim.profit.p95.value, realised,
      breachLow: realised < sim.profit.p5.value, breachHigh: realised > sim.profit.p95.value,
    });
  }
  return rows;
}
