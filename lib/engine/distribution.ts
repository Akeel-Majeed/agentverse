/**
 * Summary of the simulated whole-farm profit for the overview chart: a histogram and the
 * percentiles, computed in code from profitPaths() (lib/engine/simulate.ts).
 */
import { mean } from "./linalg";
import { quantile } from "./stats";

export interface ProfitDistribution {
  paths: number;
  mean: number;
  p5: number;
  /** Quartiles: the middle 50% of simulated years lies between p25 and p75. */
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  /** Share of simulated years with a loss, 0–1. */
  lossProb: number;
  /** Equal-width bins from the 0.5th to the 99.5th percentile; the end bins also hold the tails. */
  bins: { from: number; to: number; count: number }[];
}

export function summariseProfits(profits: ArrayLike<number>, binCount = 36): ProfitDistribution {
  const s = Float64Array.from(profits).sort();
  const n = s.length;
  const lo = quantile(s, 0.005);
  const hi = quantile(s, 0.995);
  const width = (hi - lo) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (let i = 0; i < n; i++) {
    const v = s[i];
    bins[Math.min(binCount - 1, Math.max(0, Math.floor((v - lo) / width)))].count++;
  }
  return {
    paths: n,
    mean: mean(s),
    p5: quantile(s, 0.05),
    p25: quantile(s, 0.25),
    p50: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    lossProb: s.filter((v) => v < 0).length / n,
    bins,
  };
}
