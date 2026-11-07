"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { simDetail } from "@/lib/figures";
import { amount, gbpK } from "@/lib/format";
import { scoreFromBadYear, bandFor } from "@/lib/score";
import { riskWorking, simulateRisk, type RiskSim } from "@/lib/sim";
import type { CalendarItem, RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "./card";
import { MitigationList, MitigationRow } from "./mitigation-row";
import { MoneyFigure } from "./money-figure";
import { QUALITY_TEXT } from "./risk-summary";
import { LevelLabel, ScoreRing } from "./score";
import { SimulationBars } from "./simulation-bars";
import { TradeoffTable } from "./tradeoff-table";
import { Disclaimer, FormulaDetails, SourcesList, WorkingPanel } from "./working";

function Change({ before, after, format, higherIsBetter }: { before: number; after: number; format: (v: number) => string; higherIsBetter: boolean }) {
  const diff = after - before;
  if (Math.abs(diff) < 0.05) return <span className="text-sub">no change</span>;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  return (
    <span className={better ? "text-good" : "text-bad"}>
      {format(diff)}
      <span className="sr-only">{better ? " better" : " worse"}</span>
    </span>
  );
}

const signedK = (v: number) => gbpK(v, { sign: true });
const signedN = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;

function ComparisonSummary({
  risk,
  today,
  sim,
  scoreToday,
  score,
  costs,
  onReset,
}: {
  risk: RiskResult;
  today: RiskSim;
  sim: RiskSim;
  scoreToday: number;
  score: number;
  costs: string[];
  onReset: () => void;
}) {
  const changed = costs.length > 0;
  const td = "py-2 pr-3 align-top";
  const num = "py-2 pr-3 text-right align-top font-mono tabular";
  return (
    <section aria-labelledby="comparison-heading" className="min-w-0 rounded-card border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <h2 id="comparison-heading" className="text-[15px] font-semibold tracking-tight">
            {changed ? `Comparison with ${costs.length} option${costs.length > 1 ? "s" : ""}` : "Where you stand today"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-sub">
            {changed
              ? "Today against the options you've added. This only changes the comparison: nothing is sold, bought or signed."
              : "Add options below to compare. Bad years are estimated 1-in-20 outcomes under the model's assumptions."}
          </p>
        </div>
        {changed ? (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden />
            Reset comparison
          </Button>
        ) : null}
      </div>
      <div className="relative overflow-x-auto px-4 py-3 sm:px-6">
        <table className="w-full min-w-[300px] text-[13px]">
          <caption className="sr-only">{changed ? "Today compared with the selected options" : "Today"}</caption>
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-sub">
              <th scope="col" className="py-2 pr-3 font-medium">
                Measure
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Today
              </th>
              {changed ? (
                <>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    With options
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Change
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="rowgroup" colSpan={changed ? 4 : 2} className="pt-3 text-left text-[12px] font-semibold text-brand-label">
                This category: {risk.name}
              </th>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className={cn(td, "text-left font-normal")}>
                Risk score
              </th>
              <td className={num}>
                {scoreToday}/10 <span className="font-sans text-[12px] text-sub">{bandFor(scoreToday).level}</span>
              </td>
              {changed ? (
                <>
                  <td className={num}>
                    {score}/10 <span className="font-sans text-[12px] text-sub">{bandFor(score).level}</span>
                  </td>
                  <td className="py-2 text-right font-mono">
                    <Change before={scoreToday} after={score} format={signedN} higherIsBetter={false} />
                  </td>
                </>
              ) : null}
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className={cn(td, "text-left font-normal")}>
                Bad-year hit from this risk
              </th>
              <td className={num}>
                <MoneyFigure detail={simDetail(risk, today, `${risk.name}: bad-year hit today`, today.hitK)} />
              </td>
              {changed ? (
                <>
                  <td className={num}>
                    <MoneyFigure detail={simDetail(risk, sim, `${risk.name}: bad-year hit with options`, sim.hitK)} />
                  </td>
                  <td className="py-2 text-right font-mono">
                    <Change before={today.hitK} after={sim.hitK} format={signedK} higherIsBetter={false} />
                  </td>
                </>
              ) : null}
            </tr>
            <tr>
              <th scope="rowgroup" colSpan={changed ? 4 : 2} className="pt-4 text-left text-[12px] font-semibold text-brand-label">
                Whole farm, all risks
              </th>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className={cn(td, "text-left font-normal")}>
                Expected profit
              </th>
              <td className={num}>{gbpK(today.meanK)}</td>
              {changed ? (
                <>
                  <td className={num}>{gbpK(sim.meanK)}</td>
                  <td className="py-2 text-right font-mono">
                    <Change before={today.meanK} after={sim.meanK} format={signedK} higherIsBetter />
                  </td>
                </>
              ) : null}
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className={cn(td, "text-left font-normal")}>
                Profit in a bad year
              </th>
              <td className={cn(num, today.badYearProfitK < 0 && "text-bad")}>
                <MoneyFigure
                  detail={simDetail(risk, today, "Whole-farm profit in a bad year, today", today.badYearProfitK, "Whole farm, all risks, in an estimated 1-in-20 bad year.")}
                />
              </td>
              {changed ? (
                <>
                  <td className={cn(num, sim.badYearProfitK < 0 && "text-bad")}>
                    <MoneyFigure
                      detail={simDetail(risk, sim, "Whole-farm profit in a bad year, with options", sim.badYearProfitK, "Whole farm, all risks, in an estimated 1-in-20 bad year.")}
                    />
                  </td>
                  <td className="py-2 text-right font-mono">
                    <Change before={today.badYearProfitK} after={sim.badYearProfitK} format={signedK} higherIsBetter />
                  </td>
                </>
              ) : null}
            </tr>
            <tr className={changed ? "border-b border-line" : undefined}>
              <th scope="row" className={cn(td, "text-left font-normal")}>
                Loss-making years (modelled)
              </th>
              <td className={num}>{today.lossYears} in 20</td>
              {changed ? (
                <>
                  <td className={num}>{sim.lossYears} in 20</td>
                  <td className="py-2 text-right font-mono">
                    <Change before={today.lossYears} after={sim.lossYears} format={signedN} higherIsBetter={false} />
                  </td>
                </>
              ) : null}
            </tr>
          </tbody>
        </table>
        {changed ? (
          <div className="mt-3 text-[13px]">
            <p className="font-medium">Cost and trade-offs</p>
            <ul className="mt-1 list-disc pl-5 text-sub">
              {costs.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-[12.5px] text-sub">
          {risk.model.exposureLabel}: {amount(today.exposure, risk.model.unit)}
          {changed ? ` today, ${amount(sim.exposure, risk.model.unit)} with options` : " today"}. Bad-year figures are about the 5th percentile of outcomes, not a forecast.
        </p>
      </div>
    </section>
  );
}

export function RiskDetail({
  risk,
  typicalProfit,
  dateLabel,
  deadlines,
}: {
  risk: RiskResult;
  typicalProfit: number;
  dateLabel: string;
  deadlines: Record<string, CalendarItem>;
}) {
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const active = useMemo(() => risk.mitigations.filter((m) => activeIds.includes(m.id)), [risk, activeIds]);

  const today = useMemo(() => simulateRisk(risk.model), [risk]);
  const sim = useMemo(() => simulateRisk(risk.model, active), [risk, active]);
  const scoreToday = scoreFromBadYear(today.hitK * 1000, typicalProfit);
  const score = scoreFromBadYear(sim.hitK * 1000, typicalProfit);
  const changed = active.length > 0;

  const toggle = (id: string) => setActiveIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const reset = () => setActiveIds([]);
  const quality = risk.dataQuality;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex items-start gap-4 sm:items-center sm:gap-6">
        <ScoreRing score={score} size={72} name={risk.name} className="sm:hidden" />
        <ScoreRing score={score} size={88} name={risk.name} className="hidden sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-sub">
            Risk · {risk.group} · {dateLabel}
          </p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[26px] font-bold leading-tight tracking-[-0.025em] sm:text-[30px]">
            {risk.name}
            <LevelLabel score={score} className="text-[15px]" />
          </h1>
          <p className="mt-1.5 max-w-3xl text-[14.5px] text-sub">{risk.summary}</p>
          <p className={cn("mt-1.5 text-[13px]", quality.quality === "confirmed" ? "text-sub" : "text-[#78350F]")}>
            <span className="font-medium">Inputs: {QUALITY_TEXT[quality.quality]}.</span> {quality.note}
          </p>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {changed
          ? `With ${active.length} option${active.length > 1 ? "s" : ""}: score ${score} out of 10. Bad-year hit ${gbpK(sim.hitK)}. Whole-farm profit in a bad year ${gbpK(sim.badYearProfitK)}.`
          : `Comparison reset. Score ${scoreToday} out of 10.`}
      </p>

      <div className="grid gap-6 sm:gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
          <ComparisonSummary risk={risk} today={today} sim={sim} scoreToday={scoreToday} score={score} costs={active.map((m) => `${m.title}: ${m.cost}`)} onReset={reset} />

          <section id="options" aria-labelledby="options-heading" className="min-w-0 rounded-card border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-6">
              <div>
                <h2 id="options-heading" className="text-[15px] font-semibold tracking-tight">
                  Options to compare
                </h2>
                <p className="mt-0.5 text-[12.5px] text-sub">
                  Adding an option changes the comparison above and the chart below. It doesn&apos;t place any trade or order.
                </p>
              </div>
              {changed ? (
                <p className="text-[12.5px] font-medium" aria-hidden>
                  {active.length} added · score {score}/10 · hit {gbpK(sim.hitK)}
                </p>
              ) : null}
            </div>
            <CardBody>
              <MitigationList>
                {risk.mitigations.map((m) => (
                  <MitigationRow
                    key={m.id}
                    risk={risk}
                    mitigation={m}
                    deadline={deadlines[m.id]}
                    active={activeIds.includes(m.id)}
                    onToggle={() => toggle(m.id)}
                  />
                ))}
              </MitigationList>
            </CardBody>
          </section>

          <Card label="20 simulated years">
            <CardHeader
              title="20 simulated years, worst to best"
              description={changed ? "Whole-farm profit each simulated year: with your options (solid) against today (dashed)." : "Whole-farm profit in each simulated year, today."}
            />
            <CardBody className="pt-6">
              <SimulationBars bars={sim.bars} ghost={today.bars} />
              <details className="group mt-4 rounded-xl border border-line">
                <summary className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Show the 20 years as a table
                  <ChevronDown className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="relative overflow-x-auto border-t border-line px-4 py-3">
                  <table className="w-full min-w-[260px] font-mono text-[12.5px] tabular">
                    <caption className="sr-only">Whole-farm profit in 20 simulated years, worst to best</caption>
                    <thead>
                      <tr className="border-b border-line text-left font-sans text-[12px] text-sub">
                        <th scope="col" className="py-1.5 pr-3 font-medium">Year (worst to best)</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">Today</th>
                        {changed ? <th scope="col" className="py-1.5 text-right font-medium">With options</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {today.bars.map((v, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="py-1 pr-3">{i + 1}</td>
                          <td className={cn("py-1 pr-3 text-right", v < 0 && "text-bad")}>{gbpK(v)}</td>
                          {changed ? <td className={cn("py-1 text-right", sim.bars[i] < 0 && "text-bad")}>{gbpK(sim.bars[i])}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardBody>
          </Card>

          <Card label={risk.model.tradeoff.title}>
            <CardHeader title={risk.model.tradeoff.title} description="Less risk in a bad year against less upside in a good one. Before any options above." />
            <TradeoffTable risk={risk} />
          </Card>
        </div>

        <aside aria-label="Reasoning and sources" className="flex min-w-0 flex-col gap-6 sm:gap-8">
          <Card label="Why this score">
            <CardHeader title="Why this score" />
            <CardBody>
              <ul className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
                {risk.reasoning.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-sub" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card label="The working">
            <CardHeader title="The working" description={changed ? "With your options added." : "Today, before any options."} />
            <CardBody className="flex flex-col gap-4">
              <WorkingPanel steps={riskWorking(risk.model, sim)} />
              <FormulaDetails steps={riskWorking(risk.model, sim)} />
            </CardBody>
          </Card>
          <Card label="Inputs and sources">
            <CardHeader title="Inputs and sources" />
            <CardBody>
              <SourcesList sources={risk.sources} />
            </CardBody>
          </Card>
          <Disclaimer className="px-1" />
        </aside>
      </div>
    </div>
  );
}
