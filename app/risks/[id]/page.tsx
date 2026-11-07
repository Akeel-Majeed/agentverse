import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/headwind/page-header";
import { RiskDetail } from "@/components/headwind/risk-detail";
import { ScoreChip } from "@/components/headwind/score";
import { getAssessmentMeta, getCalendar, getRisk, getRisks } from "@/lib/data";
import { longDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const risks = await getRisks();
  return risks.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const risk = await getRisk(params.id);
  return { title: risk ? `${risk.name} risk` : "Risk not found" };
}

export default async function RiskPage({ params }: { params: { id: string } }) {
  const [risk, risks, meta, calendar] = await Promise.all([getRisk(params.id), getRisks(), getAssessmentMeta(), getCalendar()]);
  if (!risk) notFound();
  const deadlines = Object.fromEntries(
    risk.mitigations.flatMap((m) => {
      const item = calendar.find((c) => c.id === m.deadlineId);
      return item ? [[m.id, item]] : [];
    })
  );

  return (
    <PageShell className="gap-6 sm:gap-8">
      <div className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-sub">
            <li>
              <Link href="/risks" className="inline-flex min-h-9 items-center gap-1 rounded-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                All risks
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {risk.name}
            </li>
          </ol>
        </nav>
        <nav aria-label="Switch risk" className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max items-center gap-2 pb-1">
            {risks.map((r) => {
              const current = r.id === risk.id;
              return (
                <li key={r.id}>
                  <Link
                    href={`/risks/${r.id}`}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "relative flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border pl-1.5 pr-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11",
                      current ? "border-ink bg-white text-ink" : "border-line text-sub hover:border-line-strong hover:text-ink"
                    )}
                  >
                    <ScoreChip score={r.score} className="h-7 border-0 bg-panel" />
                    {r.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <RiskDetail key={risk.id} risk={risk} typicalProfit={meta.typicalProfit} dateLabel={longDate(meta.date)} deadlines={deadlines} />
    </PageShell>
  );
}
