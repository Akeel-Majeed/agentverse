import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader, Disclosure, SourceTag } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import backtest from "@/docs/eval/backtest.json";
import screen from "@/docs/eval/screen-eval.json";
import bench from "@/docs/eval/benchmark.json";
import benchChart from "@/docs/eval/benchmark-chart.png";
import forecastChart from "@/docs/eval/forecast-chart.png";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Evidence · Hedged" };

/*
 * Every number and verdict on this page is computed here from docs/eval/backtest.json and
 * docs/eval/screen-eval.json. The prose only says how to read them.
 */

const SERIES: Record<string, string> = { wheat: "Feed wheat", barley: "Feed barley", osr: "Oilseed rape", an: "Nitrogen fertiliser", fuel: "Motor fuel" };
const MODELS = ["mc", "normal_refit", "hist_sim"] as const;
const MODEL_NAME: Record<string, string> = { mc: "Our model (Student-t Monte Carlo)", normal_refit: "Benchmark: normal, refitted", hist_sim: "Benchmark: historical simulation" };
const TARGET = 0.05;
const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)}%`;
const ci = ([lo, hi]: number[]) => `${pct(lo, 1)}–${pct(hi, 1)}`;
const th = "h-10 text-label font-normal text-sub";
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

type Summary = (typeof backtest.summary)[number];
const row = (series: string, model: string, period: string) =>
  backtest.summary.find((s) => s.series === series && s.model === model && s.period === period) as Summary;
/** Compared at the precision shown, so a verdict never contradicts the printed figures. */
const p4 = (x: number) => Number(x.toFixed(4));
type Verdict = "better" | "tie" | "worse";
const verdict = (ours: number, bench: number): Verdict => (p4(ours) < p4(bench) ? "better" : p4(ours) > p4(bench) ? "worse" : "tie");

const series = Array.from(new Set(backtest.summary.map((s) => s.series)));
const heldOut = series.map((s) => ({
  id: s,
  mc: row(s, "mc", "held_out"),
  normal: row(s, "normal_refit", "held_out"),
  hist: row(s, "hist_sim", "held_out"),
  all: row(s, "mc", "all"),
}));
const pooledN = heldOut.reduce((t, s) => t + s.mc.n, 0);
const pooledLow = heldOut.reduce((t, s) => t + Math.round(s.mc.breachLowRate * s.mc.n), 0);
const kupiecRejected = heldOut.filter((s) => s.mc.kupiecLowP < 0.05).length;
const vsNormal = heldOut.map((s) => verdict(s.mc.pinballMean, s.normal.pinballMean));
const vsHist = heldOut.map((s) => verdict(s.mc.pinballMean, s.hist.pinballMean));
const count = (vs: Verdict[], v: Verdict) => vs.filter((x) => x === v).length;
const farmOutside = backtest.wholeFarm.filter((w) => w.breachLow || w.breachHigh).length;
const highOver = heldOut.filter((s) => s.mc.breachHighRate > TARGET).map((s) => SERIES[s.id] ?? s.id);
const clustered = heldOut.filter((s) => s.all.christoffersenLowP < 0.05).map((s) => SERIES[s.id] ?? s.id);
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
const falseAlarms = [...screen.deepset.falseAlarms, ...screen.farm.falseAlarms, ...screen.image.falseAlarms];

/* ---------- Building blocks ---------- */

function Section({ n, eyebrow, title, intro, children }: { n: number; eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`evidence-${n}`} className="flex flex-col gap-6">
      <div className="flex max-w-[76ch] flex-col gap-2">
        <p className="text-label font-medium text-sub">
          {n} · {eyebrow}
        </p>
        <h2 id={`evidence-${n}`} className="text-[24px] font-medium leading-tight tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <div className="text-[15px] leading-relaxed text-sub">{intro}</div>
      </div>
      {children}
    </section>
  );
}

const TONE = { ink: "text-ink", good: "text-good", warn: "text-warn", bad: "text-bad" } as const;

function Tile({ label, value, sub, tone = "ink" }: { label: string; value: string; sub: ReactNode; tone?: "ink" | "good" | "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-6 shadow-card">
      <p className="text-[13.5px] font-medium text-sub">{label}</p>
      <p className={cn("text-[36px] font-medium leading-none tracking-[-0.03em] tabular", TONE[tone])}>{value}</p>
      <p className="text-[13.5px] leading-relaxed text-sub">{sub}</p>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  better: "border-good-border bg-good-surface text-good",
  tie: "border-line bg-panel text-sub",
  worse: "border-bad-border bg-bad-surface text-bad",
};
const VERDICT_TEXT: Record<Verdict, (against: string) => string> = {
  better: (a) => `Better than ${a}`,
  tie: (a) => `Ties with ${a}`,
  worse: (a) => `Worse than ${a}`,
};

function VerdictChip({ v, against }: { v: Verdict; against: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium", VERDICT_STYLE[v])}>
      {VERDICT_TEXT[v](against)}
    </span>
  );
}

/** Share of months outside the band on one side, against the 5% target. Red only when the test rejects it. */
function BreachMeter({ label, rate, n, rejected }: { label: string; rate: number; n: number; rejected?: boolean }) {
  const scale = 0.2;
  const tone = rejected ? "bg-bad" : rate > TARGET ? "bg-warn-dot" : "bg-good";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-sub">{label}</span>
        <span className="font-semibold tabular">
          {pct(rate, 1)} <span className="font-normal text-sub">({Math.round(rate * n)} of {n})</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-panel" aria-hidden>
        <div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${Math.min(1, rate / scale) * 100}%` }} />
        <div className="absolute -inset-y-1 w-px bg-ink" style={{ left: `${(TARGET / scale) * 100}%` }} title="Target 5%" />
      </div>
    </div>
  );
}

function monthChip(m: string) {
  const [date, side] = m.split(" ");
  return `${MONTH.format(new Date(`${date}T00:00:00Z`)).replace("Sept", "Sep")} ${side === "low" ? "below" : "above"}`;
}

/* ---------- Sections ---------- */

function MonthChips({ months }: { months: string[] }) {
  if (!months.length) return <p className="text-[13px] text-sub">None.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {months.map((m) => (
        <li key={m} className={cn("rounded-md px-2 py-0.5 text-[12px] tabular", m.endsWith("low") ? "bg-bad-surface text-bad" : "bg-panel text-sub")}>
          {monthChip(m)}
        </li>
      ))}
    </ul>
  );
}

function SeriesCard({ s }: { s: (typeof heldOut)[number] }) {
  const unseen = s.all.breachMonths.filter((m) => m >= backtest.heldOutFrom);
  const earlier = s.all.breachMonths.length - unseen.length;
  return (
    <Card label={SERIES[s.id] ?? s.id} className="flex flex-col">
      <CardHeader title={SERIES[s.id] ?? s.id} description={`${s.mc.n} unseen months, 2024 onwards`} />
      <CardBody className="flex flex-1 flex-col gap-5 py-5">
        <div className="flex flex-col gap-4">
          <BreachMeter label="Months below the range" rate={s.mc.breachLowRate} n={s.mc.n} rejected={s.mc.kupiecLowP < 0.05} />
          <BreachMeter label="Months above the range" rate={s.mc.breachHighRate} n={s.mc.n} />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-[13px] text-sub">
            Forecast score (pinball loss, lower is better): ours <span className="font-semibold text-ink tabular">{s.mc.pinballMean.toFixed(4)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <VerdictChip v={verdict(s.mc.pinballMean, s.normal.pinballMean)} against="normal" />
            <VerdictChip v={verdict(s.mc.pinballMean, s.hist.pinballMean)} against="historical" />
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-[13px] text-sub">Unseen months outside the range ({unseen.length}):</p>
          <MonthChips months={unseen} />
          {earlier ? <p className="text-[12.5px] text-sub">Plus {earlier} earlier months, listed under Full statistics.</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}

function FullStats() {
  return (
    <Card label="Full backtest statistics">
      <Disclosure title="Full statistics" description="Every model, held-out and full period: breach rates with 95% intervals, Kupiec and Christoffersen tests, pinball loss.">
        {series.map((sid) => (
          <div key={sid} className="border-t border-line first:border-t-0">
            <h3 className="px-5 pt-4 text-[14px] font-semibold tracking-tight">{SERIES[sid] ?? sid}</h3>
            <div className="flex flex-col gap-2 px-5 pt-2">
              <p className="text-[12.5px] text-sub">Every month outside our model&apos;s range, all {row(sid, "mc", "all").n} months tested:</p>
              <MonthChips months={row(sid, "mc", "all").breachMonths} />
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className={cn(th, "pl-5")}>Model</TableHead>
                    <TableHead className={th}>Period</TableHead>
                    <TableHead className={cn(th, "text-right")}>n</TableHead>
                    <TableHead className={cn(th, "text-right")}>Below band (95% CI)</TableHead>
                    <TableHead className={cn(th, "text-right")}>Kupiec p</TableHead>
                    <TableHead className={cn(th, "text-right")}>Christoffersen p</TableHead>
                    <TableHead className={cn(th, "text-right")}>Above band</TableHead>
                    <TableHead className={cn(th, "pr-5 text-right")}>Pinball</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODELS.flatMap((m) =>
                    ["held_out", "all"].map((p) => {
                      const s = row(sid, m, p);
                      return (
                        <TableRow key={m + p} className={cn("border-line text-[13px] tabular", m === "mc" && "font-medium")}>
                          <TableCell className="py-2.5 pl-5">{MODEL_NAME[m]}</TableCell>
                          <TableCell className="py-2.5">{p === "held_out" ? `Held out (from ${backtest.heldOutFrom.slice(0, 4)})` : "All months"}</TableCell>
                          <TableCell className="py-2.5 text-right">{s.n}</TableCell>
                          <TableCell className="py-2.5 text-right">
                            {pct(s.breachLowRate, 1)} ({ci(s.breachLowCI)})
                          </TableCell>
                          <TableCell className={cn("py-2.5 text-right", s.kupiecLowP < 0.05 && "text-bad")}>{s.kupiecLowP.toFixed(2)}</TableCell>
                          <TableCell className={cn("py-2.5 text-right", s.christoffersenLowP < 0.05 && "text-bad")}>{s.christoffersenLowP.toFixed(2)}</TableCell>
                          <TableCell className={cn("py-2.5 text-right", s.breachHighRate > TARGET && "text-bad")}>{pct(s.breachHighRate, 1)}</TableCell>
                          <TableCell className="py-2.5 pr-5 text-right">{s.pinballMean.toFixed(4)}</TableCell>
                        </TableRow>
                      );
                    }),
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
        <p className="border-t border-line px-5 py-4 text-[13px] text-sub">Red: a test rejects the band at p &lt; 0.05, or more than 5% of months above it.</p>
      </Disclosure>
    </Card>
  );
}

/** One row per harvest year: the forecast P5–P95 band, its median and what actually happened, on one £ scale. */
function WholeFarmChart() {
  const values = backtest.wholeFarm.flatMap((w) => [w.p5, w.p95, w.realised, 0]);
  const step = 100_000;
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.ceil(Math.max(...values) / step) * step;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const ticks = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);
  return (
    <Card label="Whole-farm backtest">
      <CardBody className="flex flex-col gap-5 py-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-sub" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-8 rounded-full bg-[#DCE6B4]" /> Forecast range (P5–P95)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3.5 w-0.5 bg-sub" /> Forecast median
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 rounded-full border-2 border-card bg-ink ring-1 ring-ink" /> What happened
          </li>
        </ul>
        <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[56px_minmax(0,1fr)_200px]">
          {backtest.wholeFarm.map((w) => {
            const outside = w.breachLow || w.breachHigh;
            return (
              <div key={w.harvestYear} className="contents">
                <div className="flex h-12 items-center text-[14px] font-medium tabular">{w.harvestYear}</div>
                <div className="relative h-12" role="img" aria-label={`${w.harvestYear}: forecast ${gbp(w.p5)} to ${gbp(w.p95)}, median ${gbp(w.p50)}; realised ${gbp(w.realised)}${outside ? ", outside the range" : ""}.`}>
                  <div aria-hidden className="absolute inset-y-0 w-px bg-line-strong" style={{ left: x(0) }} />
                  <div aria-hidden className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#DCE6B4]" style={{ left: x(w.p5), width: `calc(${x(w.p95)} - ${x(w.p5)})` }} />
                  <div aria-hidden className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-sub" style={{ left: x(w.p50) }} />
                  <div
                    aria-hidden
                    className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card ring-1", outside ? "bg-bad ring-bad" : "bg-ink ring-ink")}
                    style={{ left: x(w.realised) }}
                  />
                </div>
                <div className="col-span-2 -mt-2 mb-2 text-[12.5px] text-sub tabular sm:col-span-1 sm:m-0 sm:flex sm:h-12 sm:items-center">
                  <span>
                    <span className={cn("font-semibold", outside ? "text-bad" : "text-ink")}>{gbp(w.realised)}</span> vs {gbp(w.p5)} to {gbp(w.p95)}
                  </span>
                </div>
              </div>
            );
          })}
          <div />
          <div className="relative mt-1 h-5 text-[12px] text-sub tabular" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: x(t) }}>
                {gbp(t)}
              </span>
            ))}
          </div>
        </div>
        <p className="border-t border-line pt-4 text-[13.5px] leading-relaxed text-sub">
          <span className="font-semibold text-ink">
            {farmOutside} of {backtest.wholeFarm.length}
          </span>{" "}
          years landed outside the forecast range. Seven years can neither confirm nor reject a 90% range, so this is descriptive only. 2022 has no East
          Midlands yield, so that year is price-only.
        </p>
      </CardBody>
    </Card>
  );
}

type ScreenSet = typeof screen.deepset;
function ScreenCard({ title, origin, s }: { title: string; origin: string; s: ScreenSet }) {
  return (
    <Card label={title} className="flex flex-col">
      <CardHeader title={title} description={origin} />
      <CardBody className="flex flex-1 flex-col gap-5 py-5">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-sub">Injected instructions caught</p>
          <p className="text-[30px] font-medium leading-none tracking-[-0.03em] tabular">{pct(s.catchRate)}</p>
          <div className="h-2 rounded-full bg-panel" aria-hidden>
            <div className="h-2 rounded-full bg-good" style={{ width: `${s.catchRate * 100}%` }} />
          </div>
          <p className="text-[12.5px] text-sub tabular">
            {s.caught} of {s.injections} · 95% CI {ci(s.catchCI)}
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
          <p className="text-[13px] text-sub">False alarms on clean text</p>
          <p className={cn("text-[20px] font-semibold tabular", s.falseAlarmCount ? "text-bad" : "text-ink")}>
            {s.falseAlarmCount} of {s.clean}
          </p>
          <p className="text-[12.5px] text-sub tabular">95% CI {ci(s.falseAlarmCI)}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function ItemList({ items, empty }: { items: { id: string; p: number | null; text: string }[]; empty: string }) {
  if (!items.length) return <p className="px-5 py-4 text-[13.5px] text-sub">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((m) => (
        <li key={m.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:gap-4">
          <span className="flex shrink-0 gap-3 text-[12.5px] sm:w-[170px]">
            <span className="font-medium text-ink">{m.id}</span>
            <span className="text-sub tabular">p = {m.p === null ? "n/a" : m.p.toFixed(2)}</span>
          </span>
          <span className="min-w-0 text-[13.5px] leading-relaxed text-sub">{m.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Page ---------- */

export default function EvidencePage() {
  return (
    <PageShell>
      <PageHeader
        title="Evidence"
        subtitle="How the risk model and the input screen did on data they were never fitted on. Misses and false alarms are shown in full, next to the wins."
        meta={`Backtest config ${backtest.configHash}, held out from ${backtest.heldOutFrom} · Screen run ${screen.generatedAt.slice(0, 10)} · Files: docs/eval/backtest.json, docs/eval/screen-eval.json`}
      />

      <div className="flex flex-col gap-16">
        <section aria-label="At a glance" className="grid gap-5 sm:grid-cols-2 min-[1200px]:grid-cols-4">
          <Tile
            label="Unseen months below the forecast range"
            value={pct(pooledLow / pooledN, 1)}
            tone={kupiecRejected ? "bad" : "ink"}
            sub={
              <>
                {pooledLow} of {pooledN} months across {series.length} prices and costs. Target 5%. The test rejects the range in {kupiecRejected} of {series.length}.
              </>
            }
          />
          <Tile
            label="Against the benchmarks"
            value={`${count(vsHist, "better")} of ${series.length}`}
            sub={
              <>
                Better than historical simulation. Against a refitted normal: {count(vsNormal, "better")} better, {count(vsNormal, "tie")} tie,{" "}
                {count(vsNormal, "worse")} worse.
              </>
            }
          />
          <Tile
            label="Whole-farm years outside the range"
            value={`${farmOutside} of ${backtest.wholeFarm.length}`}
            sub="Harvests 2019–2025, forecast the August before. Too few years to prove anything; shown for honesty."
          />
          <Tile
            label="Injected instructions caught"
            value={pct(screen.deepset.catchRate)}
            tone="good"
            sub={
              <>
                On a public test set, with {screen.deepset.falseAlarmCount} false alarms in {screen.deepset.clean} clean texts. {screen.all.misses.length} misses, all listed below.
              </>
            }
          />
        </section>

        <Section
          n={1}
          eyebrow="Prices and costs"
          title="Do the forecast ranges hold on months the model never saw?"
          intro={
            <>
              <p>
                Each month the model forecasts a range for next month&apos;s price, from the 5th to the 95th percentile, using only data up to then. A good range is
                missed about 1 month in 20 on each side. Months from {backtest.heldOutFrom.slice(0, 4)} on were held out: never used to tune the model.
              </p>
              <p className="mt-2">
                Bars show how often each price fell below or rose above the range; the black tick is the 5% target. Source: real Defra monthly price indices.
              </p>
            </>
          }
        >
          <div className="grid gap-5 md:grid-cols-2 min-[1200px]:grid-cols-3">
            {heldOut.map((s) => (
              <SeriesCard key={s.id} s={s} />
            ))}
            <Card label="What this shows" className="flex flex-col">
              <CardHeader title="In short" />
              <CardBody className="flex flex-col gap-3 py-5 text-[14px] leading-relaxed text-sub">
                <p>
                  {kupiecRejected
                    ? `The test rejects the range for ${kupiecRejected} of ${series.length} series on unseen months.`
                    : `Below-range misses are in line with the 5% target: the test rejects none of the ${series.length} series on unseen months.`}
                </p>
                <p>
                  On forecast score it beats historical simulation in {count(vsHist, "better")} of {series.length}. Against a plain refitted normal it is mixed:{" "}
                  {count(vsNormal, "better")} better, {count(vsNormal, "tie")} {count(vsNormal, "tie") === 1 ? "tie" : "ties"}, {count(vsNormal, "worse")} worse. The fat
                  tails don&apos;t buy a clear edge on these months.
                </p>
                {highOver.length ? <p>Above-range misses run over 5% for {list(highOver)}: prices rose faster than the range allowed.</p> : null}
                {clustered.length ? <p>Over all months, misses cluster in time for {list(clustered)} (Christoffersen test): one bad spell, not spread out.</p> : null}
              </CardBody>
            </Card>
          </div>
          <FullStats />
        </Section>

        <Section
          n={2}
          eyebrow="Whole farm"
          title="Did the farm's profit land inside the forecast range?"
          intro="For each harvest from 2019 to 2025, the model forecast the demo farm's profit from the August before, with the farm held fixed and unhedged, then compared it with what real prices and yields would have produced."
        >
          <WholeFarmChart />
        </Section>

        <Section
          n={3}
          eyebrow="Benchmarks, with costs"
          title="Would the agent's hedge have paid off in past years?"
          intro={`Harvest years ${bench.hedge.rows[0].harvestYear}–${bench.hedge.rows.at(-1)!.harvestYear}, n = ${bench.hedge.rows.length}, descriptive. The fictional farm sells 50% of its wheat at the August price (our proxy for a forward price: no historical forward curve), pays £3/t, and sells the rest at the next August's price. Real Defra prices and East Midlands yields. Method: docs/eval/benchmark.md.`}
        >
          <Card label="Hedge against benchmarks">
            <Image src={benchChart} alt="Profit by strategy and the 50% forward sale minus doing nothing, each harvest year" className="h-auto w-full border-b border-line" />
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className={cn(th, "pl-5")}>Strategy</TableHead>
                    <TableHead className={cn(th, "text-right")}>Mean profit</TableHead>
                    <TableHead className={cn(th, "text-right")}>Worst year</TableHead>
                    <TableHead className={cn(th, "text-right")}>Hedge cost a year</TableHead>
                    <TableHead className={cn(th, "text-right")}>Gain vs nothing (95% CI)</TableHead>
                    <TableHead className={cn(th, "pr-5")}>Years it lost money</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bench.hedge.summary.map((s) => (
                    <TableRow key={s.strategy} className={cn("border-line text-[13px] tabular", s.strategy === "forward_50" && "font-medium")}>
                      <TableCell className="py-2 pl-5">{s.label}</TableCell>
                      <TableCell className="py-2 text-right">{gbp(s.meanProfit)}</TableCell>
                      <TableCell className="py-2 text-right">{gbp(s.worstYear)} ({s.worstYearHarvest})</TableCell>
                      <TableCell className="py-2 text-right">{gbp(s.hedgeCostPerYear)}</TableCell>
                      <TableCell className={cn("py-2 text-right", s.meanGainVsNothing < 0 && "text-bad")}>
                        {s.strategy === "do_nothing" ? "—" : `${gbp(s.meanGainVsNothing)} (${gbp(s.meanGainVsNothingCI[0])} to ${gbp(s.meanGainVsNothingCI[1])})`}
                      </TableCell>
                      <TableCell className="py-2 pr-5">{s.strategy === "do_nothing" ? "—" : `${s.yearsWorseThanNothing.length} of ${s.n}: ${s.yearsWorseThanNothing.join(", ")}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <CardBody className="border-t border-line text-[13px] text-sub">
              Plainly: over these years the forward sale cost money on average and made the worst year (2020: poor yield, rising price) worse. It paid off only when prices fell by more than the £3/t cost.
              This is one price path, not proof the hedge fails to narrow the simulated 1-in-20 year, and it is why the agent presents selling forward as an option to discuss, not advice.
            </CardBody>
          </Card>
          <Card label="Forecast against baselines">
            <Image src={forecastChart} alt="Whole-farm forecast bands against realised profit, ours and two baselines, harvest years 2018–2026" className="h-auto w-full border-b border-line" />
            <p className="px-5 py-3 text-[12.5px] text-sub">
              Whole farm, {bench.forecast.summary[0].n} harvests: all inside our P5–P95, which may mean the band is too wide. Pinball loss at P5 is about a tie with the normal baseline and better than historical simulation, which missed 2023. Only 2025 and 2026 are strictly held out.
            </p>
          </Card>
        </Section>

        <Section
          n={4}
          eyebrow="Bad and manipulative inputs"
          title="Does the input screen catch injected instructions?"
          intro={
            <>
              Documents and messages are screened before any agent reads them. Jev ({screen.screenModel}) flags text at p ≥ {screen.threshold}, a threshold fixed
              before the run. Photos are read word for word by {screen.readerModel}, then screened. 95% Wilson intervals.
            </>
          }
        >
          <div className="grid gap-5 md:grid-cols-3">
            <ScreenCard title="Public test set" origin="deepset/prompt-injections test split · Apache-2.0" s={screen.deepset} />
            <ScreenCard title="Farm messages" origin="Synthetic, written by an AI that never saw the screen code" s={screen.farm} />
            <ScreenCard title="Farm photos" origin="Synthetic document images made by the team" s={screen.image} />
          </div>
          <Card label="Misses and false alarms">
            <Disclosure title={`Every miss (${screen.all.misses.length})`} description="Mostly role-play or harmful-content requests and debatable labels; none tells software to change data. Text cut at 160 characters.">
              <ItemList items={screen.all.misses} empty="None." />
            </Disclosure>
            <div className="border-t border-line">
              <Disclosure title={`Every false alarm (${falseAlarms.length})`} description="Clean text the screen wrongly flagged, across all three sets.">
                <ItemList items={falseAlarms} empty="None in any set." />
              </Disclosure>
            </div>
          </Card>
          <p className="max-w-[76ch] text-[14px] leading-relaxed text-sub">
            Small farm sets mean wide intervals: 100% caught on {screen.image.injections} photos has a lower bound of {pct(screen.image.catchCI[0])}. The screen is one
            layer. The control that matters is that no agent can write the farm profile: every change waits for the farmer.
          </p>
        </Section>

        <Section n={5} eyebrow="Roles and limits" title="Who does what, and what this evidence doesn't show" intro="Every number comes from code. Models read, judge and explain.">
          <div className="grid gap-5 min-[1000px]:grid-cols-2">
            <Card label="Models">
              <CardHeader title="Models and what they may do" leading={<SourceTag>Permissions in code</SourceTag>} />
              <CardBody className="py-5">
                <dl className="flex flex-col gap-4 text-[14px] leading-relaxed">
                  {[
                    ["gemini-4-argon", "Judge", "May call our code tools and propose profile changes for the farmer to approve. May not compute or change a figure, or write the profile."],
                    ["gemini-3.8-flash", "Reader", "May read documents and photos and quote them. A field survives only if its quote is verbatim; it changes nothing."],
                    ["jev-latest", "Screen", "May quarantine text that looks like an injected instruction, or hold it for review. May not approve anything."],
                    ["Claude", "Chat", "May answer the farmer with figures read from the engine. May not change the profile."],
                  ].map(([model, role, text]) => (
                    <div key={model} className="flex flex-col gap-0.5">
                      <dt className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-[13px] font-medium text-ink">{model}</span>
                        <span className="text-[12.5px] text-sub">{role}</span>
                      </dt>
                      <dd className="text-sub">{text}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            <Card label="Limits">
              <CardHeader title="What this evidence does not show" />
              <CardBody className="py-5">
                <ul className="flex list-disc flex-col gap-2.5 pl-5 text-[14px] leading-relaxed text-sub">
                  <li>The farm is synthetic; prices, costs, yields and rates are real public data.</li>
                  <li>The monthly test checks each series&apos; tails, not how the series move together.</li>
                  <li>The fat-tail setting was chosen knowing 2022 happened.</li>
                  <li>Regulation risk is an assumption, not backtested.</li>
                  <li>Option costs (forward sale, buying fertiliser now, fixing the rate) are stated assumptions.</li>
                  <li>The photo set is {screen.image.n} team-made document images, not real phone photos.</li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
