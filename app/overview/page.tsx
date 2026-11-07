import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { PendingCountText, PendingSummary } from "@/components/headwind/approvals";
import { BreakEvenList } from "@/components/headwind/break-even-list";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { ComingUp, CERTAINTY_LABEL } from "@/components/headwind/coming-up";
import { DataStatus } from "@/components/headwind/data-status";
import { MitigationList, TopMitigationItem } from "@/components/headwind/mitigation-row";
import { MoneyFigure } from "@/components/headwind/money-figure";
import { NeedsAttention } from "@/components/headwind/needs-attention";
import { PageShell } from "@/components/headwind/page-header";
import { RerunButton } from "@/components/headwind/rerun-button";
import { RiskSummary } from "@/components/headwind/risk-summary";
import { RiskTable } from "@/components/headwind/risk-table";
import { Button } from "@/components/ui/button";
import {
  ACTION_RANKING_BASIS,
  getAssessmentMeta,
  getBreakEvens,
  getFarm,
  getOverallRisk,
  getPendingChanges,
  getProfitSummary,
  getRisks,
  getTopMitigations,
  getUpcoming,
} from "@/lib/data";
import { profitDetail } from "@/lib/figures";
import { gbp, longDate, shortDate } from "@/lib/format";
import { bandFor } from "@/lib/score";

export const metadata: Metadata = { title: "Dashboard" };

const tile = "flex min-w-0 flex-col gap-1 rounded-card border border-line bg-white p-3.5 sm:p-4";
const tileLabel = "text-[12px] font-medium text-sub";

export default async function OverviewPage() {
  const [farm, meta, risks, top, profit, breakEvens, upcoming, summary, pending] = await Promise.all([
    getFarm(),
    getAssessmentMeta(),
    getRisks(),
    getTopMitigations(),
    getProfitSummary(),
    getBreakEvens(),
    getUpcoming("2026-11-07"),
    getOverallRisk(),
    getPendingChanges(),
  ]);
  const { overall } = summary;
  const highest = risks[0];
  const band = bandFor(highest.score);
  const nextKey = upcoming.find((c) => c.kind === "key") ?? upcoming[0];
  const nextForHighest = upcoming.find((c) => c.riskId === highest.id);
  const score = (id?: string) => risks.find((r) => r.id === id)?.score ?? 0;
  const attentionIds = pending
    .filter((p) => p.status === "pending")
    .sort((a, b) => score(b.riskId) - score(a.riskId))
    .slice(0, 2)
    .map((p) => p.id);
  const deltaTone = profit.deltaWeek < 0 ? "text-bad" : profit.deltaWeek > 0 ? "text-good" : "text-sub";

  return (
    <PageShell className="gap-6 sm:gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-sub">Dashboard · {meta.harvestYear} harvest year</p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.025em] sm:text-[30px]">{farm.name}</h1>
            <p className="mt-1 text-[14px] text-sub">
              {farm.hectares} ha arable near {farm.location.replace(/^Near /, "")} · {farm.crops.join(", ").toLowerCase()}
            </p>
          </div>
          <div className="hidden sm:block">
            <RerunButton />
          </div>
        </div>
        <DataStatus meta={meta} overall={overall} />
      </div>

      <div className="grid gap-6 sm:gap-8 min-[1200px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="sr-only">
              Decision summary
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:gap-3">
              <li className={tile}>
                <span className={tileLabel}>Expected profit</span>
                <MoneyFigure detail={profitDetail(profit, "expected")} className="self-start text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
                  {gbp(profit.expected)}
                </MoneyFigure>
                <span className={`font-mono text-[12.5px] font-medium ${deltaTone}`}>
                  {gbp(profit.deltaWeek, { sign: true })} <span className="font-sans font-normal text-sub">vs last week</span>
                </span>
              </li>
              <li className={tile}>
                <span className={tileLabel}>Highest risk</span>
                <Link
                  href={`/risks/${highest.id}`}
                  className="self-start rounded-sm text-[16px] font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[17px]"
                >
                  {highest.name}
                </Link>
                <span className="text-[12.5px]">
                  <span className="font-mono font-semibold" style={{ color: band.text }}>
                    {highest.score}/10 {band.level}
                  </span>
                  <span className="text-sub"> · {gbp(highest.badYear)} bad year</span>
                </span>
              </li>
              <li className={tile}>
                <span className={tileLabel}>Inputs to review</span>
                <Link
                  href="/actions"
                  className="self-start rounded-sm text-[16px] font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[17px]"
                >
                  <PendingCountText />
                </Link>
                <span className="text-[12.5px] text-sub">
                  <PendingSummary short />
                </span>
              </li>
              <li className={tile}>
                <span className={tileLabel}>Next key date</span>
                {nextKey ? (
                  <>
                    <Link
                      href="/calendar"
                      className="self-start rounded-sm text-[16px] font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[17px]"
                    >
                      {shortDate(nextKey.start)}
                    </Link>
                    <span className="text-[12.5px] leading-snug text-sub">{nextKey.label}</span>
                  </>
                ) : (
                  <span className="text-[13px] text-sub">Nothing scheduled</span>
                )}
              </li>
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-sub">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Underlined £ figures open their working.
            </p>
          </section>

          <section aria-labelledby="takeaway-heading" className="rounded-card border border-brand-border bg-brand-surface p-4 sm:p-5">
            <h2 id="takeaway-heading" className="text-[12px] font-medium text-brand-label">
              Main takeaway
            </h2>
            <p className="mt-1 text-[16px] font-semibold leading-snug tracking-tight">
              {highest.name} is your largest exposure.
              {nextForHighest ? ` Review the ${nextForHighest.lane.toLowerCase()} decision before ${shortDate(nextForHighest.start)}.` : ""}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed">
              On its own, an estimated 1-in-20 bad year for {highest.name.toLowerCase()} would take {gbp(highest.badYear)} off profit
              {highest.pctOfProfit > 100 ? ", more than a typical year's profit" : ""}.
              {nextForHighest ? ` ${longDate(nextForHighest.start)}: ${nextForHighest.label} (${CERTAINTY_LABEL[nextForHighest.certainty].toLowerCase()}).` : ""}
            </p>
            {highest.dataQuality.quality !== "confirmed" ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#78350F]">
                <span className="font-medium">Not settled yet:</span> {highest.dataQuality.note}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/risks/${highest.id}#options`}>
                  Review {highest.name.toLowerCase()} options <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/what-if">Try a scenario</Link>
              </Button>
            </div>
          </section>

          <NeedsAttention ids={attentionIds} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
          <RiskSummary summary={summary} risks={risks} harvestYear={meta.harvestYear} />
          <Card label="Recommended actions">
            <CardHeader title="Recommended actions" description={ACTION_RANKING_BASIS} />
            <CardBody>
              <MitigationList>
                {top.map((item) => (
                  <TopMitigationItem key={item.mitigation.id} item={item} risk={risks.find((r) => r.id === item.mitigation.riskId)!} />
                ))}
              </MitigationList>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
        <ComingUp items={upcoming.slice(0, 4)} />
        <BreakEvenList items={breakEvens} />
      </div>

      <Card label="All risks in detail">
        <CardHeader
          title="All risks in detail"
          description="Bad year = what an estimated 1-in-20 bad year for that risk alone would take off profit."
          action={
            <Link href="/risks" className="inline-flex min-h-9 items-center gap-1 rounded-sm text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              All risks <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="relative overflow-x-auto" role="region" aria-label="All risks table" tabIndex={0}>
          <RiskTable risks={risks} />
        </div>
        <details className="group border-t border-line">
          <summary className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-medium hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
            About these numbers
            <ChevronDown className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-col gap-2 px-4 pb-4 text-[13px] leading-relaxed text-sub sm:px-6">
            <p>
              A risk&apos;s bad year is the estimated 95th-percentile hit from that risk alone, under the model&apos;s assumptions. It is a
              downside estimate, not a forecast.
            </p>
            <p>
              Bad years don&apos;t add up: risks rarely all peak in the same year. Together the five categories add to {gbp(risks.reduce((s, r) => s + r.badYear, 0))}, but
              the whole-farm bad year is {gbp(profit.badYear)} from an expected {gbp(profit.expected)}, a fall of {gbp(profit.expected - profit.badYear)}.
            </p>
            <p>
              The modelled chance of a loss is {Math.round(profit.lossChance * 100)}%, roughly {profit.lossYearsOf20} years in 20 (rounded). Scores show
              severity, not likelihood.
            </p>
          </div>
        </details>
      </Card>
    </PageShell>
  );
}
