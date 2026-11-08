"use client";

import Link from "next/link";
import { Bar, BarChart, Cell, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { gbp } from "@/lib/format";
import type { ProfitSimulation } from "@/lib/data";
import type { FigureDetail } from "@/lib/types";
import { Card, CardBody, CardHeader, SourceTag } from "./card";
import { MoneyFigure } from "./money-figure";

const config = { count: { label: "Simulated years" } } satisfies ChartConfig;
const INK = "#121611";
const BAD = "#C8361C";
const SUB = "#565C50";
/** Shading for the typical intervals: the middle 50% of years and 9 in 10 years. */
const BAND = "#C9DB6A";

/** The working behind each simulation figure: what was computed, from how many years, with which seed. */
function detail(s: ProfitSimulation, title: string, value: number, how: string): FigureDetail {
  return {
    title,
    value: gbp(value),
    description: "Computed in code from the Monte Carlo engine: correlated, fat-tailed price, yield and rate shocks fitted on Defra and Bank of England history.",
    working: [
      { label: "simulated_years", value: s.paths.toLocaleString("en-GB") },
      { label: "inputs", value: `risk profile snapshot v${s.snapshotVersion}, history to ${s.asOf}` },
      { label: how, value: gbp(value) },
      { label: "seed · config", value: `${s.seed} · ${s.configHash}` },
    ],
    sources: [{ label: "Whole-farm profit, every simulated year", origin: s.runId ? `Agent run ${s.runId.slice(0, 8)}` : "Engine (lib/engine/simulate.ts)", date: s.asOf }],
  };
}

/** The typical intervals of a profit distribution, in words a farmer reads and a statistician checks. */
export function intervalsText(s: Pick<ProfitSimulation, "p5" | "p25" | "p50" | "p75" | "p95">) {
  return `Half of all years between ${gbp(s.p25)} and ${gbp(s.p75)} (P25–P75); 9 in 10 between ${gbp(s.p5)} and ${gbp(s.p95)} (P5–P95); median ${gbp(s.p50)}.`;
}

/**
 * Histogram of whole-farm profit across every simulated year. Shaded: the 90% interval (P5–P95) and,
 * darker, the interquartile range (P25–P75). Lines: median, mean, £0. Reused on each risk page.
 */
export function ProfitHistogram({ simulation: s, height = 200 }: { simulation: ProfitSimulation; height?: number }) {
  const data = s.bins.map((b) => ({ mid: (b.from + b.to) / 2, from: b.from, to: b.to, count: b.count }));
  const lo = s.bins[0].from;
  const hi = s.bins[s.bins.length - 1].to;
  const k = (v: number) => gbp(v);
  // Round £ ticks that include £0 when it's in range.
  const step = [25_000, 50_000, 100_000, 200_000, 250_000, 500_000].find((x) => (hi - lo) / x <= 6) ?? 1_000_000;
  const ticks = Array.from({ length: Math.floor(hi / step) - Math.ceil(lo / step) + 1 }, (_, i) => (Math.ceil(lo / step) + i) * step);
  return (
    <figure
      role="img"
      aria-label={`Histogram of ${s.paths} simulated years of farm profit. ${intervalsText(s)} Average ${k(s.mean)}. A loss in ${Math.round(s.lossProb * 100)}% of years.`}
    >
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 8 }} barCategoryGap={1}>
          <XAxis
            type="number"
            dataKey="mid"
            domain={[lo, hi]}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => k(v)}
            tick={{ fontSize: 11.5, fill: SUB }}
          />
          <YAxis hide />
          <ReferenceArea x1={s.p5} x2={s.p95} fill={BAND} fillOpacity={0.18} strokeOpacity={0} ifOverflow="hidden" />
          <ReferenceArea x1={s.p25} x2={s.p75} fill={BAND} fillOpacity={0.38} strokeOpacity={0} ifOverflow="hidden" />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => {
                  const p = payload[0]?.payload as { from: number; to: number } | undefined;
                  return p ? `Profit ${k(p.from)} to ${k(p.to)}` : "";
                }}
                valueFormatter={(v) => `${Number(v).toLocaleString("en-GB")} years`}
              />
            }
          />
          <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.mid} fill={d.to <= 0 ? BAD : d.from < 0 ? "#D86A1E" : "#8E9386"} />
            ))}
          </Bar>
          <ReferenceLine x={0} stroke={INK} strokeDasharray="3 3" />
          <ReferenceLine x={s.p5} stroke={BAD} strokeWidth={1.5} label={{ value: "P5", position: "top", fontSize: 11, fill: BAD }} />
          <ReferenceLine x={s.p50} stroke={INK} strokeWidth={1.5} label={{ value: "Median", position: "top", fontSize: 11, fill: INK }} />
          <ReferenceLine x={s.p95} stroke={SUB} strokeWidth={1} label={{ value: "P95", position: "top", fontSize: 11, fill: SUB }} />
        </BarChart>
      </ChartContainer>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: BAND, opacity: 0.75 }} />
          Middle 50% of years (P25–P75)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm" style={{ background: BAND, opacity: 0.35 }} />9 in 10 years (P5–P95)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-4 border-t border-dashed border-ink" />
          £0
        </span>
      </figcaption>
    </figure>
  );
}

/** The 10,000-year simulation on the overview: histogram, typical intervals and the headline percentiles. */
export function ProfitSimulationCard({ simulation: s }: { simulation: ProfitSimulation | null }) {
  if (!s) {
    return (
      <Card label="Monte Carlo simulation">
        <CardHeader title="Monte Carlo simulation" leading={<SourceTag>Computed (code)</SourceTag>} />
        <CardBody>
          <p className="text-[13.5px] text-sub">The profile is missing something the simulation needs. Complete the farm profile and update the risk profile.</p>
        </CardBody>
      </Card>
    );
  }
  const stats = [
    { label: "1-in-20 bad year (P5)", value: s.p5, how: "5th percentile of simulated profit", tone: s.p5 < 0 ? "text-bad" : "text-ink" },
    { label: "Median year (P50)", value: s.p50, how: "50th percentile of simulated profit", tone: "text-ink" },
    { label: "1-in-20 good year (P95)", value: s.p95, how: "95th percentile of simulated profit", tone: "text-ink" },
  ];

  return (
    <Card label="Monte Carlo simulation">
      <CardHeader
        title="Monte Carlo simulation"
        description={`Whole-farm profit in ${s.paths.toLocaleString("en-GB")} simulated years, from your risk profile.`}
        leading={<SourceTag className="whitespace-nowrap">Computed (code)</SourceTag>}
        action={
          s.runId ? (
            <Link href={`/trace/${s.runId}`} className="rounded-sm text-[13px] font-medium text-sub hover:text-ink hover:underline">
              View trace
            </Link>
          ) : null
        }
      />
      <CardBody className="flex flex-col gap-4">
        <ProfitHistogram simulation={s} />
        <p className="text-[13.5px] leading-relaxed">{intervalsText(s)}</p>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="bg-panel px-3 py-2.5">
              <dt className="text-label text-sub">{st.label}</dt>
              <dd className={`mt-1 text-[17px] font-semibold tabular ${st.tone}`}>
                <MoneyFigure detail={detail(s, st.label, st.value, st.how)} />
              </dd>
            </div>
          ))}
          <div className="bg-panel px-3 py-2.5">
            <dt className="text-label text-sub">Chance of a loss</dt>
            <dd className="mt-1 text-[17px] font-semibold tabular">{Math.round(s.lossProb * 100)}%</dd>
          </div>
        </dl>
        <SimulationFootnote simulation={s} />
      </CardBody>
    </Card>
  );
}

/** Seed, paths, config and snapshot, plus any field the snapshot predates. */
export function SimulationFootnote({ simulation: s }: { simulation: ProfitSimulation }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[11.5px] text-sub">
        seed {s.seed} · {s.paths.toLocaleString("en-GB")} paths · config {s.configHash} · snapshot v{s.snapshotVersion} · mean {gbp(s.mean)}
      </p>
      {s.filledFromProfile.length ? (
        <p className="text-[12px] text-warn">
          Snapshot v{s.snapshotVersion} predates {s.filledFromProfile.join(", ")}; taken from your current profile. Update the risk profile to freeze it.
        </p>
      ) : null}
    </div>
  );
}
