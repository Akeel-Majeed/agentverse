"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApprovals } from "./approvals";

/** Secondary action: re-running is simulated in the demo and returns the same sample figures. */
export function RerunButton() {
  const { assessment, rerun } = useApprovals();
  const running = assessment.state === "running";
  return (
    <>
      <Button variant="secondary" disabled={running} onClick={() => void rerun()}>
        {running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {running ? "Re-running…" : "Re-run assessment"}
      </Button>
      <span role="status" className="sr-only">
        {running ? "Re-running assessment" : assessment.state === "updated" ? `Assessment re-run at ${assessment.ranAt}` : ""}
      </span>
    </>
  );
}

/** Last-run time and whether approved changes are waiting to be included. */
export function AssessmentStatus() {
  const { assessment } = useApprovals();
  const label =
    assessment.state === "running"
      ? "running now"
      : assessment.state === "pending"
        ? `${assessment.ranAt} · approved changes not yet included`
        : `${assessment.ranAt}${assessment.state === "updated" ? " (simulated re-run)" : ""}`;
  return <>{label}</>;
}
