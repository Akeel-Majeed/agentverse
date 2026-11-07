import Link from "next/link";
import { BellRing } from "lucide-react";
import { gbp } from "@/lib/format";
import { riskName } from "@/lib/profile/catalogue";
import type { SignalImpact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceTag } from "./card";
import { WorkingPanel } from "./working";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** News measured against the risk profile snapshot, each with its £ effect and the working. */
export function NewsImpactList({
  impacts,
  limit,
  showRisk = true,
  emptyText = "No news since the snapshot.",
}: {
  impacts: SignalImpact[];
  limit?: number;
  showRisk?: boolean;
  emptyText?: string;
}) {
  const visible = limit ? impacts.slice(0, limit) : impacts;
  if (visible.length === 0) return <p className="text-[13px] text-sub">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line">
      {visible.map(({ signal, delta, working, alert, snapshotVersion }) => (
        <li key={signal.id} className="py-3.5 first:pt-0 last:pb-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-semibold tracking-tight">
                  {signal.title}
                  {alert ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[11px] font-medium text-[#92400E]">
                      <BellRing className="h-3 w-3" aria-hidden /> Alert
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-sub">{signal.summary}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-sub">
                  {showRisk ? (
                    <Link href={`/risks/${signal.riskId}`} className="font-medium text-ink hover:underline">
                      {riskName(signal.riskId)}
                    </Link>
                  ) : null}
                  <SourceTag>{signal.source}</SourceTag>
                  <span className="tabular">{WHEN.format(new Date(signal.publishedAt))}</span>
                  <span className="underline decoration-dotted underline-offset-2 group-open:hidden">Show working</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                {delta === null ? (
                  <span className="text-[12px] text-sub">No £ figure yet</span>
                ) : (
                  <>
                    <span className={cn("text-[14px] font-semibold tabular", delta < 0 ? "text-bad" : delta > 0 ? "text-good" : "text-ink")}>
                      {gbp(delta, { sign: true })}
                    </span>
                    <span className="block text-[11px] text-sub">vs snapshot v{snapshotVersion}</span>
                  </>
                )}
              </div>
            </summary>
            <div className="mt-3 rounded-lg bg-panel p-3">
              <WorkingPanel steps={working} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
