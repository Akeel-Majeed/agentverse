import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Image from "next/image";
import backtest from "@/docs/eval/backtest.json";
import bench from "@/docs/eval/benchmark.json";
import benchChart from "@/docs/eval/benchmark-chart.png";
import forecastChart from "@/docs/eval/forecast-chart.png";
import screen from "@/docs/eval/screen-eval.json";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Evidence · Farm risk agent" };

const SERIES: Record<string, string> = { wheat: "Feed wheat", barley: "Feed barley", osr: "Oilseed rape", an: "Nitrogen fertiliser", fuel: "Motor fuel" };
const MODELS = ["mc", "normal_refit", "hist_sim"] as const;
const MODEL_NAME: Record<string, string> = { mc: "Our model (Student-t Monte Carlo)", normal_refit: "Benchmark: normal, refitted", hist_sim: "Benchmark: historical simulation" };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ci = ([lo, hi]: number[]) => `${pct(lo)}–${pct(hi)}`;
const th = "h-10 text-label font-normal text-sub";

type Summary = (typeof backtest.summary)[number];
const row = (series: string, model: string, period: string) =>
  backtest.summary.find((s) => s.series === series && s.model === model && s.period === period) as Summary;

function BacktestTable({ series }: { series: string }) {
  const heldMc = row(series, "mc", "held_out"), heldNr = row(series, "normal_refit", "held_out");
  // Compared at the precision shown, so the sentence never contradicts the printed figures.
  const [ours, bench] = [heldMc.pinballMean, heldNr.pinballMean].map((x) => Number(x.toFixed(4)));
  const mcMonths = row(series, "mc", "all").breachMonths;
  return (
    <div className="border-t border-line first:border-t-0">
      <div className="px-5 pt-4">
        <h3 className="text-[14px] font-semibold tracking-tight">{SERIES[series] ?? series}</h3>
        <p className="mt-0.5 text-[12.5px] text-sub">
          Held out, pinball loss (lower is better): our model {ours.toFixed(4)} vs normal benchmark {bench.toFixed(4)}.{" "}
          {ours < bench ? "Ours is lower." : ours > bench ? "Ours does not beat the benchmark." : "A tie: ours does not beat the benchmark."}
        </p>
      </div>
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead className={cn(th, "pl-5")}>Model</TableHead>
            <TableHead className={th}>Period</TableHead>
            <TableHead className={cn(th, "text-right")}>n</TableHead>
            <TableHead className={cn(th, "text-right")}>Low breaches (95% CI)</TableHead>
            <TableHead className={cn(th, "text-right")}>Kupiec p</TableHead>
            <TableHead className={cn(th, "text-right")}>Christoffersen p</TableHead>
            <TableHead className={cn(th, "text-right")}>High breaches</TableHead>
            <TableHead className={cn(th, "pr-5 text-right")}>Pinball</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODELS.flatMap((m) =>
            ["held_out", "all"].map((p) => {
              const s = row(series, m, p);
              return (
                <TableRow key={m + p} className={cn("border-line text-[13px] tabular", m === "mc" && "font-medium")}>
                  <TableCell className="py-2 pl-5">{MODEL_NAME[m]}</TableCell>
                  <TableCell className="py-2">{p === "held_out" ? "Held out (2024 on)" : "All"}</TableCell>
                  <TableCell className="py-2 text-right">{s.n}</TableCell>
                  <TableCell className="py-2 text-right">{pct(s.breachLowRate)} ({ci(s.breachLowCI)})</TableCell>
                  <TableCell className={cn("py-2 text-right", s.kupiecLowP < 0.05 && "text-bad")}>{s.kupiecLowP.toFixed(2)}</TableCell>
                  <TableCell className={cn("py-2 text-right", s.christoffersenLowP < 0.05 && "text-bad")}>{s.christoffersenLowP.toFixed(2)}</TableCell>
                  <TableCell className={cn("py-2 text-right", s.breachHighRate > 0.05 && "text-bad")}>{pct(s.breachHighRate)}</TableCell>
                  <TableCell className="py-2 pr-5 text-right">{s.pinballMean.toFixed(4)}</TableCell>
                </TableRow>
              );
            }),
          )}
        </TableBody>
      </Table>
      <p className="px-5 pb-4 pt-2 text-[12.5px] text-sub">
        Months outside our model&apos;s P5–P95 band ({mcMonths.length}): {mcMonths.join(", ") || "none"}
      </p>
    </div>
  );
}

type ScreenSet = typeof screen.deepset;
function ScreenRow({ name, s }: { name: string; s: ScreenSet }) {
  return (
    <TableRow className="border-line text-[13px] tabular">
      <TableCell className="py-2.5 pl-5">{name}</TableCell>
      <TableCell className="py-2.5 text-right">{s.n}</TableCell>
      <TableCell className="py-2.5 text-right">
        {s.caught} / {s.injections} = {pct(s.catchRate)} ({ci(s.catchCI)})
      </TableCell>
      <TableCell className="py-2.5 pr-5 text-right">
        {s.falseAlarmCount} / {s.clean} = {pct(s.falseAlarmRate)} ({ci(s.falseAlarmCI)})
      </TableCell>
    </TableRow>
  );
}

function ItemList({ items, empty }: { items: { id: string; p: number | null; text: string }[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-sub">{empty}</p>;
  return (
    <ul className="divide-y divide-line text-[13px]">
      {items.map((m) => (
        <li key={m.id} className="flex gap-3 py-2">
          <span className="w-[92px] shrink-0 font-medium">{m.id}</span>
          <span className="w-[64px] shrink-0 tabular text-sub">p = {m.p === null ? "n/a" : m.p.toFixed(2)}</span>
          <span className="min-w-0 text-sub">{m.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EvidencePage() {
  const series = Array.from(new Set(backtest.summary.map((s) => s.series)));
  const outside = backtest.wholeFarm.filter((w) => w.breachLow || w.breachHigh).length;
  const allFalseAlarms = [...screen.deepset.falseAlarms, ...screen.farm.falseAlarms, ...screen.image.falseAlarms];
  return (
    <PageShell>
      <PageHeader
        title="Evidence"
        subtitle="How the model and the input screen did on data they were not fitted on. Misses and false alarms are listed in full. Every number on this page comes from code; the files behind it are docs/eval/backtest.json and docs/eval/screen-eval.json."
        meta={`Backtest config ${backtest.configHash}, held out from ${backtest.heldOutFrom} · Screen run ${screen.generatedAt.slice(0, 10)}`}
      />

      <Card label="Backtest">
        <CardHeader
          title="Price and cost backtest"
          description="Real Defra monthly indices. One-month-ahead P5 and P95, fitted only on data up to each month. A good band is breached about 5% of the time on each side. Red: Kupiec or Christoffersen p below 0.05, or high breaches above 5%."
        />
        <CardBody className="text-[13px] text-sub">
          Our model is not rejected by the Kupiec test for any series, but it does not beat the plain normal benchmark: pinball loss is about equal. It beats historical simulation on pinball everywhere.
          Fertiliser breaches cluster in 2021–23 (Christoffersen), and high-side breaches run above 5% for barley, rape and fuel.
        </CardBody>
        {series.map((s) => (
          <BacktestTable key={s} series={s} />
        ))}
      </Card>

      <Card label="Whole farm">
        <CardHeader
          title="Whole farm, harvest years 2019–2025"
          description="n = 7, descriptive only. Forecast from August of the year before, farm held fixed and unhedged. 2022 has no East Midlands yield, so that row is price-only."
        />
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(th, "pl-5")}>Harvest</TableHead>
              <TableHead className={th}>Forecast made</TableHead>
              <TableHead className={cn(th, "text-right")}>P5</TableHead>
              <TableHead className={cn(th, "text-right")}>P50</TableHead>
              <TableHead className={cn(th, "text-right")}>P95</TableHead>
              <TableHead className={cn(th, "text-right")}>Realised</TableHead>
              <TableHead className={cn(th, "pr-5")}>Outside band?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backtest.wholeFarm.map((w) => (
              <TableRow key={w.harvestYear} className="border-line text-[13px] tabular">
                <TableCell className="py-2 pl-5">{w.harvestYear}</TableCell>
                <TableCell className="py-2">{w.asOf}</TableCell>
                <TableCell className="py-2 text-right">{gbp(w.p5)}</TableCell>
                <TableCell className="py-2 text-right">{gbp(w.p50)}</TableCell>
                <TableCell className="py-2 text-right">{gbp(w.p95)}</TableCell>
                <TableCell className="py-2 text-right font-medium">{gbp(w.realised)}</TableCell>
                <TableCell className={cn("py-2 pr-5", (w.breachLow || w.breachHigh) && "text-bad")}>
                  {w.breachLow ? "below" : w.breachHigh ? "above" : "no"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-sub">
          {outside} of {backtest.wholeFarm.length} years outside P5–P95. Seven years cannot confirm or reject a 90% band.
        </p>
      </Card>

      <Card label="Benchmarks">
        <CardHeader
          title="The forward-sale decision against benchmarks, with costs"
          description={`Harvest years ${bench.hedge.rows[0].harvestYear}–${bench.hedge.rows.at(-1)!.harvestYear}, n = ${bench.hedge.rows.length}, descriptive. The fictional farm sells 50% of its wheat at the August price (our proxy for a forward price: no historical forward curve), pays £3/t, and sells the rest at the next August's price. Real Defra prices and East Midlands yields. Full method: docs/eval/benchmark.md.`}
        />
        <Image src={benchChart} alt="Profit by strategy and the 50% forward sale minus doing nothing, each harvest year" className="h-auto w-full border-y border-line" />
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
        <CardBody className="border-t border-line text-[13px] text-sub">
          Plainly: over these years the forward sale cost money on average and made the worst year (2020: poor yield, rising price) worse. It paid off only when prices fell by more than the £3/t cost.
          This is one price path, not proof the hedge fails to narrow the simulated 1-in-20 year, and it is why the agent presents selling forward as an option to discuss, not advice.
        </CardBody>
        <Image src={forecastChart} alt="Whole-farm forecast bands against realised profit, ours and two baselines, harvest years 2018–2026" className="h-auto w-full border-t border-line" />
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-sub">
          Whole farm, {bench.forecast.summary[0].n} harvests: all inside our P5–P95, which may mean the band is too wide. Pinball loss at P5 is about a tie with the normal baseline and better than historical simulation, which missed 2023. Only 2025 and 2026 are strictly held out.
        </p>
      </Card>

      <Card label="Input screen">
        <CardHeader
          title="Input screen: injected instructions"
          description={`Jev (${screen.screenModel}) flags text at p ≥ ${screen.threshold}, fixed before the run. Photos: ${screen.readerModel} reads every word, then Jev screens that text. 95% Wilson intervals.`}
        />
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(th, "pl-5")}>Set</TableHead>
              <TableHead className={cn(th, "text-right")}>n</TableHead>
              <TableHead className={cn(th, "text-right")}>Injections caught</TableHead>
              <TableHead className={cn(th, "pr-5 text-right")}>False alarms on clean text</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <ScreenRow name="Public: deepset/prompt-injections test split (Apache-2.0)" s={screen.deepset} />
            <ScreenRow name="Farm text (synthetic, written by an AI subagent that did not see the screen code)" s={screen.farm} />
            <ScreenRow name="Farm photos (synthetic, made by the team)" s={screen.image} />
          </TableBody>
        </Table>
        <CardBody className="border-t border-line">
          <h3 className="text-[13.5px] font-semibold">Every miss ({screen.all.misses.length})</h3>
          <p className="mb-2 mt-0.5 text-[12.5px] text-sub">Mostly role-play or harmful-content requests and debatable labels; none tells software to change data. Text cut at 160 characters.</p>
          <ItemList items={screen.all.misses} empty="None." />
          <h3 className="mt-5 text-[13.5px] font-semibold">Every false alarm ({allFalseAlarms.length})</h3>
          <ItemList items={allFalseAlarms} empty="None in any set." />
          <p className="mt-4 text-[12.5px] text-sub">
            Small farm sets mean wide intervals: 100% caught on 5 photos has a lower bound of {pct(screen.image.catchCI[0])}. Jev is one layer; the control that matters is that no agent can write the profile.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-8 min-[1000px]:grid-cols-2">
        <Card label="Models">
          <CardHeader title="Models" description="Every number comes from code. Models read, judge and explain." />
          <CardBody>
            <ul className="space-y-2.5 text-[13px]">
              <li><span className="font-medium">gemini-4-argon</span> <span className="text-sub">(judge, thinking medium): may call our code tools and propose profile changes for the farmer to approve. May not compute or change a figure, or write the profile.</span></li>
              <li><span className="font-medium">gemini-3.8-flash</span> <span className="text-sub">(reader): may read documents and photos and quote what they say. Fields survive only if the quote is verbatim; it changes nothing.</span></li>
              <li><span className="font-medium">jev-latest</span> <span className="text-sub">(screen): may quarantine text that looks like an injected instruction or hold it for review. May not approve anything.</span></li>
              <li><span className="font-medium">Claude</span> <span className="text-sub">(iMessage chat only): may answer the farmer with figures read from the engine. May not change the profile.</span></li>
            </ul>
          </CardBody>
        </Card>
        <Card label="Limits">
          <CardHeader title="Limits" description="What this evidence does not show." />
          <CardBody>
            <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-sub">
              <li>The farm is synthetic; prices, costs, yields and rates are real public data.</li>
              <li>The monthly test checks each series&apos; tails, not how the series move together.</li>
              <li>Student-t tails were chosen knowing 2022 happened.</li>
              <li>Regulation risk is an assumption, not backtested.</li>
              <li>Option costs (forward sale, buying fertiliser now, fixing the rate) are stated assumptions.</li>
              <li>The image set is 10 team-made document images, not real phone photos.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  );
}
