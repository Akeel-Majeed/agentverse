"use client";

import Link from "next/link";
import { DEFAULT_CONFIG } from "@/lib/engine/types";
import { gbp, gbpK } from "@/lib/format";
import type { ProfitSimulation } from "@/lib/data";
import { Z95, type RiskSim } from "@/lib/sim";
import type { RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, SourceTag } from "./card";
import { ProfitHistogram, SimulationFootnote, intervalsText } from "./profit-simulation";

/** Standard normal quantile of the quartiles, Φ⁻¹(0.75). The 1-in-20 z is Z95 from lib/sim.ts. */
const Z75 = 0.674;

interface Interval {
  key: string;
  label: string;
  sub: string;
  /** £, whole farm. */
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  lossProb: number;
  tone: string;
}

/** Normal model N(μ, σ²) in £k → its quantiles in £. */
function normalInterval(key: string, label: string, sub: string, m: RiskSim, tone: string): Interval {
  const q = (z: number) => (m.meanK + z * m.sdK) * 1000;
  return { key, label, sub, p5: q(-Z95), p25: q(-Z75), p50: q(0), p75: q(Z75), p95: q(Z95), lossProb: m.lossChance, tone };
}

/** Round £ ticks across a domain, always including £0 if it's in range. */
function ticksFor(lo: number, hi: number) {
  const step = [25_000, 50_000, 100_000, 200_000, 250_000, 500_000].find((x) => (hi - lo) / x <= 6) ?? 1_000_000;
  return Array.from({ length: Math.floor(hi / step) - Math.ceil(lo / step) + 1 }, (_, i) => (Math.ceil(lo / step) + i) * step);
}

/**
 * Interval (forest) plot: per row, a whisker for the 90% interval, a box for the interquartile range and a
 * tick at the median, on one shared £ axis so the rows compare directly.
 */
function IntervalPlot({ rows }: { rows: Interval[] }) {
  const lo0 = Math.min(0, ...rows.map((r) => r.p5));
  const hi0 = Math.max(0, ...rows.map((r) => r.p95));
  const pad = (hi0 - lo0) * 0.04;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const ticks = ticksFor(lo, hi);
  return (
    <figure
      role="img"
      aria-label={rows.map((r) => `${r.label}: P5 ${gbp(r.p5)}, P25 ${gbp(r.p25)}, median ${gbp(r.p50)}, P75 ${gbp(r.p75)}, P95 ${gbp(r.p95)}.`).join(" ")}
      className="flex flex-col gap-1"
    >
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{r.label}</p>
            <p className="truncate text-[11.5px] text-sub">{r.sub}</p>
          </div>
          <div className="relative h-9">
            {/* £0 */}
            <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-ink/60" style={{ left: x(0) }} />
            {/* P5–P95 whisker with end caps */}
            <span aria-hidden className={cn("absolute top-1/2 h-px -translate-y-1/2", r.tone)} style={{ left: x(r.p5), right: `calc(100% - ${x(r.p95)})` }} />
            <span aria-hidden className={cn("absolute top-1/2 h-3 w-px -translate-y-1/2", r.tone)} style={{ left: x(r.p5) }} />
            <span aria-hidden className={cn("absolute top-1/2 h-3 w-px -translate-y-1/2", r.tone)} style={{ left: x(r.p95) }} />
            {/* P25–P75 box */}
            <span
              aria-hidden
              className={cn("absolute top-1/2 h-4 -translate-y-1/2 rounded-[3px] opacity-80", r.tone)}
              style={{ left: x(r.p25), right: `calc(100% - ${x(r.p75)})` }}
            />
            {/* median */}
            <span aria-hidden className="absolute top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-card" style={{ left: x(r.p50) }} />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-3 sm:grid-cols-[12rem_1fr]">
        <span />
        <div className="relative h-4 border-t border-line">
          {ticks.map((t) => (
            <span
              key={t}
              className={cn("absolute top-1 -translate-x-1/2 whitespace-nowrap text-[11px] tabular text-sub", ticks.length > 4 && Math.round(t / (ticks[1] - ticks[0])) % 2 !== 0 && "max-sm:hidden")}
              style={{ left: x(t) }}
            >
              {gbp(t)}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

/**
 * The risk page's distribution: the 10,000-year Monte Carlo histogram with its typical intervals, then the
 * same intervals from the hand-checkable model today and with the options added, and the percentile table.
 */
export function RiskDistribution({
  risk,
  simulation,
  today,
  withOptions,
}: {
  risk: RiskResult;
  simulation: ProfitSimulation | null;
  today: RiskSim;
  /** The hand-checkable model with the options the farmer added; null when none are added. */
  withOptions: RiskSim | null;
}) {
  const rows: Interval[] = [
    ...(simulation
      ? [
          {
            key: "mc",
            label: "Monte Carlo",
            sub: `${simulation.paths.toLocaleString("en-GB")} years, all risks`,
            p5: simulation.p5,
            p25: simulation.p25,
            p50: simulation.p50,
            p75: simulation.p75,
            p95: simulation.p95,
            lossProb: simulation.lossProb,
            tone: "bg-sub",
          },
        ]
      : []),
    normalInterval("model", "Hand-checkable model", "today, normal N(μ, σ²)", today, "bg-[#8E9386]"),
    ...(withOptions ? [normalInterval("options", "With your options", "same model, options added", withOptions, "bg-good")] : []),
  ];
  const sim = risk.simulation;
  const cols = [
    { label: "P5", get: (r: Interval) => r.p5 },
    { label: "P25", get: (r: Interval) => r.p25 },
    { label: "Median", get: (r: Interval) => r.p50 },
    { label: "P75", get: (r: Interval) => r.p75 },
    { label: "P95", get: (r: Interval) => r.p95 },
  ];

  return (
    <Card label="Profit distribution">
      <CardHeader
        title="Whole-farm profit, distribution and typical intervals"
        description={
          simulation
            ? `${simulation.paths.toLocaleString("en-GB")} simulated years from your risk profile, every risk at once. Below, the same intervals from the model you can check by hand.`
            : "The intervals from the model you can check by hand."
        }
        leading={<SourceTag className="whitespace-nowrap">Computed (code)</SourceTag>}
        action={
          simulation?.runId ? (
            <Link href={`/trace/${simulation.runId}`} className="rounded-sm text-[13px] font-medium text-sub hover:text-ink hover:underline">
              View trace
            </Link>
          ) : null
        }
      />
      <CardBody className="flex flex-col gap-6">
        {simulation ? (
          <div className="flex flex-col gap-2">
            <ProfitHistogram simulation={simulation} height={210} />
            <p className="text-[13.5px] leading-relaxed">{intervalsText(simulation)}</p>
          </div>
        ) : (
          <p className="text-[13.5px] text-sub">
            The Monte Carlo simulation needs a complete profile. Complete the farm profile and update the risk profile.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <p className="text-label text-sub">Intervals compared · box P25–P75 · whisker P5–P95 · tick median</p>
          <IntervalPlot rows={rows} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-label text-sub">
                <th className="py-2 pr-3 font-medium">Whole-farm profit</th>
                {cols.map((c) => (
                  <th key={c.label} className="px-2 py-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-medium">P(loss)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.label}</td>
                  {cols.map((c) => (
                    <td key={c.label} className={cn("px-2 py-2 text-right", c.get(r) < 0 && "text-bad")}>
                      {gbp(c.get(r))}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right">{(r.lossProb * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sim ? (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px]">
            <span className="text-sub">{risk.name} alone, 1-in-20 hit:</span>
            <span className="font-semibold tabular">{sim.p5HitDisplay}</span>
            <span className="text-sub">simulated</span>
            <span className="font-semibold tabular">{gbpK(today.hitK)}</span>
            <span className="text-sub">hand-checkable · score {Math.round(sim.score)}/10</span>
            <Link href={`/trace/${sim.runId}#risk.${risk.id}.p5_hit`} className="text-[13px] font-medium text-sub hover:text-ink hover:underline">
              Trace row
            </Link>
          </p>
        ) : null}

        <div className="flex flex-col gap-1 font-mono text-[11.5px] leading-relaxed text-sub">
          <p>
            model: P_q = μ + z_q·σ · μ = {gbpK(today.meanK)} · σ = {gbpK(today.sdK)} · z = ±{Z75} (quartiles), ±{Z95} (1 in 20) · P(loss) = Φ(−μ/σ)
          </p>
          <p>simulation: empirical quantiles of every simulated year · fat tails (t, ν = {DEFAULT_CONFIG.nu}) and correlated shocks fitted on Defra and Bank of England history</p>
          {withOptions ? <p>options change the hand-checkable model live; the simulation re-runs when you update the risk profile</p> : null}
        </div>
        {simulation ? <SimulationFootnote simulation={simulation} /> : null}
      </CardBody>
    </Card>
  );
}
