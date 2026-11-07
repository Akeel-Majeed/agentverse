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
      <nav aria-label="Risks" className="-mb-2 overflow-x-auto border-b border-line">
        <ul className="flex items-center gap-1">
          {risks.map((r) => {
            const current = r.id === risk.id;
            return (
              <li key={r.id}>
                <Link
                  href={`/risks/${r.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-2 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current ? "border-ink text-ink" : "border-transparent text-sub hover:text-ink"
                  )}
                >
                  <ScoreChip score={r.score} className="h-6 min-w-0 bg-transparent px-1" />
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
