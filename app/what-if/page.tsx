import type { Metadata } from "next";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { WhatIfPanel } from "@/components/headwind/what-if-panel";
import { getAssessmentMeta, getWhatIfConfig } from "@/lib/data";
import { longDate } from "@/lib/format";

export const metadata: Metadata = { title: "Scenarios" };

export default async function WhatIfPage() {
  const [meta, config] = await Promise.all([getAssessmentMeta(), getWhatIfConfig()]);
  return (
    <PageShell className="gap-6 sm:gap-8">
      <PageHeader
        title="Scenarios: what if things change?"
        subtitle={`Change wheat and fertiliser prices, yield and interest rates to see farm profit for the ${meta.harvestYear} harvest year. Baseline prices as of ${longDate(meta.marketDataDate)}.`}
      />
      <WhatIfPanel {...config} harvestYear={meta.harvestYear} />
    </PageShell>
  );
}
