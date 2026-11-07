import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/headwind/page-header";
import { RiskDetail } from "@/components/headwind/risk-detail";
import { ScoreChip } from "@/components/headwind/score";
import { getAssessmentMeta, getRisk, getRisks } from "@/lib/data";
import { longDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const risks = await getRisks();
  return risks.map((r) => ({ id: r.id }));
}

export default async function RiskPage({ params }: { params: { id: string } }) {
  const [risk, risks, meta] = await Promise.all([getRisk(params.id), getRisks(), getAssessmentMeta()]);
  if (!risk) notFound();

  return (
    <PageShell>
      <nav aria-label="Risks" className="-mb-3 overflow-x-auto">
        <ul className="flex items-center gap-2">
          {risks.map((r) => {
            const current = r.id === risk.id;
            return (
              <li key={r.id}>
                <Link
                  href={`/risks/${r.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border pl-1.5 pr-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      <RiskDetail key={risk.id} risk={risk} typicalProfit={meta.typicalProfit} dateLabel={longDate(meta.date)} />
    </PageShell>
  );
}
