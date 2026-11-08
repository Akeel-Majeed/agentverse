import { cholesky, sd, shrunkCorrelation } from "./linalg";
import { FACTORS, type Calibration, type FactorId, type History, type Series, type SimConfig, YIELD_FACTORS, type YieldFactor } from "./types";

const JOINT: FactorId[] = ["wheat", "barley", "osr", "an", "fuel", "bank_rate"];

export interface Calibrated {
  asOf: string;
  sigma: Record<FactorId, number>;
  /** Correlation in FACTORS order (block-diagonal: monthly prices and rate; annual yields). */
  corr: number[][];
  chol: number[][];
  shrinkage: number;
  calibration: Calibration[];
  yieldTrend: Record<YieldFactor, { slope: number; intercept: number }>;
}

/** Month-on-month changes using only points dated on or before asOf. Log for prices, pp for the rate. */
export function monthlyChanges(s: Series, asOf: string): { date: string; change: number }[] {
  const pts = s.points.filter((p) => p.date <= asOf);
  return pts.slice(1).map((p, i) => ({
    date: p.date,
    change: s.id === "bank_rate" ? p.value - pts[i].value : Math.log(p.value / pts[i].value),
  }));
}

/** Linear trend on annual yields published before asOf's year; returns trend and relative residuals. */
export function yieldFit(s: Series, asOf: string) {
  const year = Number(asOf.slice(0, 4));
  const pts = s.points.filter((p) => Number(p.date) < year).map((p) => ({ x: Number(p.date), y: p.value }));
  if (pts.length < 8) throw new Error(`Only ${pts.length} years of ${s.id} before ${asOf}; need 8`);
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const resid = pts.map((p) => ({ year: p.x, r: p.y / (intercept + slope * p.x) - 1 }));
  return { slope, intercept, resid };
}

export function calibrate(h: History, asOf: string, cfg: SimConfig): Calibrated {
  const maps = JOINT.map((f) => new Map(monthlyChanges(h[f], asOf).map((c) => [c.date, c.change])));
  const dates = Array.from(maps[0].keys()).filter((d) => maps.every((m) => m.has(d)));
  if (dates.length < cfg.warmupMonths) {
    throw new Error(`Only ${dates.length} months of joint history before ${asOf}; need ${cfg.warmupMonths}`);
  }
  const rows = dates.map((d) => maps.map((m) => m.get(d)!));
  const price = shrunkCorrelation(rows);
  const scale = Math.sqrt(cfg.horizonMonths);

  const fits = Object.fromEntries(YIELD_FACTORS.map((f) => [f, yieldFit(h[f], asOf)])) as Record<YieldFactor, ReturnType<typeof yieldFit>>;
  const years = fits.yield_wheat.resid.map((r) => r.year).filter((y) => YIELD_FACTORS.every((f) => fits[f].resid.some((r) => r.year === y)));
  const yRows = years.map((y) => YIELD_FACTORS.map((f) => fits[f].resid.find((r) => r.year === y)!.r));
  const yld = shrunkCorrelation(yRows);

  const sigma = {} as Record<FactorId, number>;
  const calibration: Calibration[] = [];
  JOINT.forEach((f, j) => {
    sigma[f] = sd(rows.map((r) => r[j])) * scale;
    calibration.push({ factor: f, sigma: sigma[f], n: rows.length, from: dates[0], to: dates.at(-1)! });
  });
  YIELD_FACTORS.forEach((f, j) => {
    sigma[f] = sd(yRows.map((r) => r[j]));
    calibration.push({ factor: f, sigma: sigma[f], n: yRows.length, from: String(years[0]), to: String(years.at(-1)) });
  });

  const idx = (f: FactorId) => FACTORS.indexOf(f as (typeof FACTORS)[number]);
  const corr = FACTORS.map(() => new Array(FACTORS.length).fill(0));
  JOINT.forEach((a, i) => JOINT.forEach((b, j) => (corr[idx(a)][idx(b)] = price.corr[i][j])));
  YIELD_FACTORS.forEach((a, i) => YIELD_FACTORS.forEach((b, j) => (corr[idx(a)][idx(b)] = yld.corr[i][j])));

  return {
    asOf,
    sigma,
    corr,
    chol: cholesky(corr),
    shrinkage: price.intensity,
    calibration,
    yieldTrend: Object.fromEntries(YIELD_FACTORS.map((f) => [f, { slope: fits[f].slope, intercept: fits[f].intercept }])) as Calibrated["yieldTrend"],
  };
}
