import Link from "next/link";
import type { RiskInputs } from "@/lib/types";
import { Card, CardBody, CardHeader, SectionLabel } from "./card";
import { NewsImpactList } from "./news-impacts";
import { snapshotLabel } from "./risk-profile-card";
import { WorkingPanel } from "./working";

/** Where this risk's figures come from in the farm profile, and the news measured against it. */
export function RiskInputsCard({ inputs }: { inputs: RiskInputs }) {
  return (
    <Card label="Based on your farm profile">
      <CardHeader
        title="Based on your farm profile"
        description={`${snapshotLabel(inputs.snapshot)}. Change a figure in your profile, then update the risk profile.`}
        action={
          <Link href="/profile#risk-profile" className="rounded-sm text-[13px] font-medium text-sub hover:text-ink hover:underline">
            Risk profile
          </Link>
        }
      />
      <CardBody className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <SectionLabel as="h3" className="mb-2">At stake in the snapshot</SectionLabel>
          {inputs.exposure ? (
            <>
              <p className="mb-3 text-[13px] leading-relaxed">{inputs.exposure.summary}</p>
              <WorkingPanel steps={inputs.exposure.working} />
            </>
          ) : (
            <p className="text-[13px] text-sub">Not worked out yet.</p>
          )}
        </div>
        <div className="min-w-0">
          <SectionLabel as="h3" className="mb-2">Your profile now</SectionLabel>
          <ul className="divide-y divide-line text-[12.5px]">
            {inputs.fields.map((f) => (
              <li key={f.key} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0">
                <Link href={`/profile?section=${f.sectionId}#field-${f.key}`} className="min-w-0 text-sub hover:text-ink hover:underline">
                  {f.label}
                </Link>
                <span className="shrink-0 text-right font-medium tabular">
                  {f.value}
                  {f.snapshotValue !== undefined ? (
                    <span className="block text-[11.5px] font-normal text-warn">{f.snapshotValue} in the snapshot · update to use</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
      <CardBody className="border-t border-line">
        <SectionLabel as="h3" className="mb-3">News since the snapshot</SectionLabel>
        <NewsImpactList impacts={inputs.impacts} showRisk={false} emptyText="No news for this risk since the snapshot." />
      </CardBody>
    </Card>
  );
}
