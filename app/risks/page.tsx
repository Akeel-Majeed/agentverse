import type { Metadata } from "next";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { RiskIndex } from "@/components/headwind/risk-index";
import { getAssessmentMeta, getRisks } from "@/lib/data";

export const metadata: Metadata = { title: "Risks" };

export default async function RisksIndexPage() {
  const [risks, meta] = await Promise.all([getRisks(), getAssessmentMeta()]);
  return (
    <PageShell>
      <PageHeader
        title="Risks"
        subtitle={`All five risk categories for the ${meta.harvestYear} harvest year, most severe first. Each score is 1–10 from how much an estimated 1-in-20 bad year for that risk alone would take off a typical year's profit.`}
      />
      <RiskIndex risks={risks} />
    </PageShell>
  );
}
