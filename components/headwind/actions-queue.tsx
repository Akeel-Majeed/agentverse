"use client";

import Link from "next/link";
import { ApprovalQueue, PendingCounter, PendingSummary, useApprovals } from "./approvals";
import { Card, CardBody, CardHeader } from "./card";
import { RerunButton } from "./rerun-button";

export function ActionsQueue() {
  const { items, assessment } = useApprovals();
  const approved = items.filter((i) => i.status === "approved").length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3 sm:px-5">
        <p className="text-[13.5px]" aria-live="polite">
          <span className="font-medium">
            <PendingSummary />
          </span>
          {approved > 0 ? (
            <span className="text-sub">
              {" "}
              · {approved} approved,{" "}
              {assessment.state === "running"
                ? "reassessment running"
                : assessment.state === "updated" && items.every((i) => i.status !== "approved" || assessment.includedIds.has(i.id))
                  ? `included in the re-run at ${assessment.ranAt}`
                  : "waiting for the next assessment"}
            </span>
          ) : null}
        </p>
        <RerunButton />
      </div>
      <p className="-mt-3 text-[12.5px] text-sub">
        Demo: approvals are kept only in this browser tab and reset when you reload. Re-running is simulated and the sample figures stay the same.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Freshness checks">
          <CardHeader
            title="Freshness checks"
            leading={<PendingCounter kind="freshness" />}
            description="Values on record that are getting old. Confirm they're still right, or update them."
          />
          <CardBody>
            <ApprovalQueue kind="freshness" emptyText="No freshness checks." />
          </CardBody>
        </Card>
        <Card label="Proposed updates">
          <CardHeader
            title="Proposed updates"
            leading={<PendingCounter kind="proposal" />}
            description="New values found in documents, messages, your adviser's connected service and Companies House."
          />
          <CardBody>
            <ApprovalQueue kind="proposal" emptyText="No proposed updates." />
          </CardBody>
        </Card>
      </div>
      <p className="text-[13px] text-sub">
        Looking for a value that isn&apos;t here? Edit it in{" "}
        <Link href="/profile" className="font-medium text-brand underline-offset-2 hover:underline">
          Farm setup
        </Link>
        .
      </p>
    </div>
  );
}
