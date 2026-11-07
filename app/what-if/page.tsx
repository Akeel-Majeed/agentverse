import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { WhatIfPanel } from "@/components/headwind/what-if-panel";
import { getAssessmentMeta, getWhatIfConfig } from "@/lib/data";
import { longDate } from "@/lib/format";

export default async function WhatIfPage() {
  const [meta, config] = await Promise.all([getAssessmentMeta(), getWhatIfConfig()]);
  return (
    <PageShell>
      <PageHeader
        label={`What-if · ${longDate(meta.date)} · Demo data`}
        title="What if things change?"
        subtitle={`Move prices, yield and interest rates to see what happens to farm profit for the ${meta.harvestYear} harvest year.`}
      />
      <WhatIfPanel {...config} harvestYear={meta.harvestYear} />
    </PageShell>
  );
}
