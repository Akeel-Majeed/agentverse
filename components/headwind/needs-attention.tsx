"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ApprovalQueue, PendingCounter, PendingSummary } from "./approvals";

/** The one or two highest-impact pending inputs, with a route to the full queue. */
export function NeedsAttention({ ids }: { ids: string[] }) {
  return (
    <section aria-labelledby="attention-heading" className="min-w-0 rounded-card border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <PendingCounter />
          <div>
            <h2 id="attention-heading" className="text-[15px] font-semibold tracking-tight">
              Needs your input
            </h2>
            <p className="text-[12.5px] text-sub">
              <PendingSummary />. Not in the figures until approved.
            </p>
          </div>
        </div>
        <Link
          href="/actions"
          className="inline-flex min-h-9 items-center gap-1 rounded-sm text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all actions <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="px-4 py-5 sm:px-6">
        <ApprovalQueue ids={ids} emptyText="Nothing waiting for you." />
      </div>
    </section>
  );
}
