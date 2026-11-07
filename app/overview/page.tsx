import Link from "next/link";
import { ApprovalQueue, PendingCounter } from "@/components/headwind/approvals";
import { BreakEvenList } from "@/components/headwind/break-even-list";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { ComingUp } from "@/components/headwind/coming-up";
import { ExpectedProfitCard } from "@/components/headwind/expected-profit-card";
import { MitigationList, TopMitigationItem } from "@/components/headwind/mitigation-row";
import { NewsImpactList } from "@/components/headwind/news-impacts";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { RerunButton } from "@/components/headwind/rerun-button";
import { RiskExposureHero } from "@/components/headwind/risk-exposure-hero";
import { RiskTable } from "@/components/headwind/risk-table";
import { Button } from "@/components/ui/button";
import {
  getAssessmentMeta,
  getBreakEvens,
  getCalendar,
  getFarm,
  getProfitSummary,
  getRiskProfile,
  getRisks,
  getTopMitigations,
} from "@/lib/data";
import { longDate } from "@/lib/format";

export default async function OverviewPage() {
  const [farm, meta, risks, top, profit, breakEvens, calendar, riskProfile] = await Promise.all([
    getFarm(),
    getAssessmentMeta(),
    getRisks(),
    getTopMitigations(),
    getProfitSummary(),
    getBreakEvens(),
    getCalendar(),
    getRiskProfile(),
  ]);
  const upcoming = calendar
    .filter((c) => c.kind !== "period" && c.start >= meta.date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);

  return (
    <PageShell>
      <PageHeader
        title={farm.name}
        meta={`Assessed ${longDate(meta.date)}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/what-if">Run a what-if</Link>
            </Button>
            <RerunButton />
          </>
        }
      />

      <RiskExposureHero risks={risks} />

      <div className="grid gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Card label="Top 3 mitigations">
            <CardHeader title="Top 3 mitigations" description="The biggest cut in risk for the money, across every risk." />
            <CardBody>
              <MitigationList>
                {top.map((item) => (
                  <TopMitigationItem key={item.mitigation.id} item={item} risk={risks.find((r) => r.id === item.mitigation.riskId)!} />
                ))}
              </MitigationList>
            </CardBody>
          </Card>

          <Card label="All risks">
            <CardHeader title="All risks" description="Bad year = what a 1-in-20 bad year for this risk would take off profit." />
            <div className="overflow-x-auto">
              <RiskTable risks={risks} />
            </div>
            <p className="border-t border-line px-5 py-3 text-[12.5px] text-sub">
              Bad years don&apos;t add up: risks rarely all peak in the same year.
            </p>
          </Card>
        </div>

        <aside aria-label="Profit and actions" className="flex min-w-0 flex-col gap-8">
          <ExpectedProfitCard summary={profit} harvestYear={meta.harvestYear} />
          <Card label="News since your risk profile">
            <CardHeader
              title="News since your risk profile"
              description={`Measured against snapshot v${riskProfile.snapshot.version}.`}
              action={
                <Link href="/profile#risk-profile" className="rounded-sm text-[13px] font-medium text-sub hover:text-ink hover:underline">
                  See all
                </Link>
              }
            />
            <CardBody>
              <NewsImpactList impacts={riskProfile.impacts.filter((i) => i.delta !== null)} limit={3} />
            </CardBody>
          </Card>
          <BreakEvenList items={breakEvens} />
          <Card label="Needs your input">
            <CardHeader
              title="Needs your input"
              leading={<PendingCounter />}
              action={
                <Link href="/profile#approvals" className="rounded-sm text-[13px] font-medium text-sub hover:text-ink hover:underline">
                  See all
                </Link>
              }
            />
            <CardBody>
              <ApprovalQueue limit={3} />
            </CardBody>
          </Card>
          <ComingUp items={upcoming} />
        </aside>
      </div>
    </PageShell>
  );
}
