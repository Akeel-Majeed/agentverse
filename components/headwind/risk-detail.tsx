"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { simDetail } from "@/lib/figures";
import { amount, gbpK } from "@/lib/format";
import { scoreFromBadYear } from "@/lib/score";
import { riskWorking, simulateRisk } from "@/lib/sim";
import type { RiskResult } from "@/lib/types";
import { Card, CardBody, CardHeader, Counter, Disclosure } from "./card";
import { KpiCell, KpiStrip } from "./kpi-cell";
import { MitigationList, MitigationRow } from "./mitigation-row";
import { MoneyFigure } from "./money-figure";
import { PageHeader } from "./page-header";
import { LevelLabel, ScoreRing } from "./score";
import { SimulationBars } from "./simulation-bars";
import { TradeoffTable } from "./tradeoff-table";
import { Disclaimer, SourcesList, WorkingPanel } from "./working";

export function RiskDetail({
  risk,
  typicalProfit,
  dateLabel,
  profile,
}: {
  risk: RiskResult;
  typicalProfit: number;
  dateLabel: string;
  /** Where the figures come from in the farm profile, shown before the working. */
  profile?: ReactNode;
}) {
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const active = useMemo(() => risk.mitigations.filter((m) => activeIds.includes(m.id)), [risk, activeIds]);

  const today = useMemo(() => simulateRisk(risk.model), [risk]);
  const sim = useMemo(() => simulateRisk(risk.model, active), [risk, active]);
  const score = scoreFromBadYear(sim.hitK * 1000, typicalProfit);
  const changed = active.length > 0;
  const hitDelta = sim.hitK - today.hitK;
  const profitDelta = sim.badYearProfitK - today.badYearProfitK;
  const exposureDelta = sim.exposure - today.exposure;

  const toggle = (id: string) =>
    setActiveIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        leading={<ScoreRing score={score} size={96} name={risk.name} />}
        title={
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {risk.name}
            <LevelLabel score={score} className="text-[15px]" />
          </span>
        }
        subtitle={risk.summary}
        meta={`Assessed ${dateLabel}`}
      />
      <p role="status" aria-live="polite" className="sr-only">
        Score {score} out of 10. Bad-year hit {gbpK(sim.hitK)}. Farm profit in a bad year {gbpK(sim.badYearProfitK)}.
      </p>

      <KpiStrip>
        <KpiCell
          label="Bad-year hit"
          value={<MoneyFigure detail={simDetail(risk, sim, `${risk.name}: bad-year hit`, sim.hitK)} />}
          sub={
            changed && Math.round(hitDelta) !== 0 ? (
              <span className="text-good">{gbpK(hitDelta, { sign: true })} vs today</span>
            ) : (
              "1-in-20 year"
            )
          }
        />
        <KpiCell
          label="Farm profit in a bad year"
          value={
            <MoneyFigure
              detail={simDetail(risk, sim, "Farm profit in a bad year", sim.badYearProfitK, "Whole farm, all risks, in a 1-in-20 bad year.")}
              className={sim.badYearProfitK < 0 ? "text-bad" : "text-good"}
            />
          }
          sub={
            changed && Math.round(profitDelta) !== 0 ? (
              <span className={profitDelta > 0 ? "text-good" : "text-bad"}>{gbpK(profitDelta, { sign: true })} vs today</span>
            ) : (
              `Expected ${gbpK(sim.meanK)}`
            )
          }
        />
        <KpiCell
          label="Loss-making years"
          value={`${sim.lossYears} in 20`}
          sub={changed && sim.lossYears !== today.lossYears ? `${today.lossYears} in 20 today` : `${Math.round(sim.lossChance * 100)}% chance`}
        />
        <KpiCell
          label={risk.model.exposureLabel}
          value={amount(sim.exposure, risk.model.unit)}
          sub={
            changed && exposureDelta !== 0
              ? `${exposureDelta < 0 ? "−" : "+"}${amount(Math.abs(exposureDelta), risk.model.unit)} from options`
              : "Unhedged today"
          }
        />
      </KpiStrip>

      <Card label="20 simulated years">
        <CardHeader
          title="20 simulated years, worst to best"
          description="Whole-farm profit in each simulated year, with the options you've added."
        />
        <CardBody className="pt-6">
          <SimulationBars bars={sim.bars} ghost={today.bars} />
        </CardBody>
      </Card>

      <Card label="Mitigation options">
        <CardHeader
          title="Mitigation options"
          description="Add options to the simulation to see their effect above."
          action={
            changed ? (
              <>
                <Counter label={`${active.length} added`}>{active.length}</Counter>
                <Button variant="ghost" size="sm" onClick={() => setActiveIds([])}>
                  Clear
                </Button>
              </>
            ) : null
          }
        />
        <CardBody>
          <MitigationList>
            {risk.mitigations.map((m) => (
              <MitigationRow key={m.id} risk={risk} mitigation={m} active={activeIds.includes(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </MitigationList>
        </CardBody>
      </Card>

      {profile}

      <Card label="How this was worked out">
        <CardHeader
          title="How this was worked out"
          description="The agent's reasoning, the formula, the trade-off and the inputs behind these figures."
        />
        <div className="divide-y divide-line">
          <Disclosure title="Agent reasoning">
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
          </Disclosure>
          <Disclosure title="The working" description={changed ? "Live, with your options added." : "Today, before any options."}>
            <CardBody>
              <WorkingPanel steps={riskWorking(risk.model, sim)} />
            </CardBody>
          </Disclosure>
          <Disclosure title={risk.model.tradeoff.title} description="Less risk in a bad year against less upside in a good one.">
            <TradeoffTable risk={risk} />
          </Disclosure>
          <Disclosure title="Inputs and sources">
            <CardBody>
              <SourcesList sources={risk.sources} />
            </CardBody>
          </Disclosure>
        </div>
      </Card>
      <Disclaimer className="px-1" />
    </div>
  );
}
