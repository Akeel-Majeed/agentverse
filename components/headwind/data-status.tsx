import type { OverallRisk } from "@/lib/overall";
import { longDate } from "@/lib/format";
import type { AssessmentMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AssessmentStatus } from "./rerun-button";

/** Separates the three freshness signals: market data, the assessment run and farm-input confirmation. */
export function DataStatus({ meta, overall, className }: { meta: AssessmentMeta; overall?: OverallRisk; className?: string }) {
  const n = overall?.issues.length ?? 0;
  const issueText = n ? `${n} risk${n === 1 ? "" : "s"} use stale, unconfirmed or missing inputs` : "";
  return (
    <dl className={cn("flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-sub", className)}>
      <div>
        <dt className="inline">Market prices:</dt>
        <dd className="ml-1 inline text-ink">to {longDate(meta.marketDataDate)}</dd>
      </div>
      <div>
        <dt className="inline">Last assessment:</dt>
        <dd className="ml-1 inline text-ink">
          {longDate(meta.date)}, <AssessmentStatus /> <span className="text-sub">(simulated)</span>
        </dd>
      </div>
      <div>
        <dt className="inline">Farm inputs:</dt>
        <dd className="ml-1 inline text-ink">
          last confirmed {longDate(meta.farmInputsConfirmed)}
          {issueText ? <span className="text-[#92400E]"> · {issueText}</span> : null}
        </dd>
      </div>
    </dl>
  );
}
