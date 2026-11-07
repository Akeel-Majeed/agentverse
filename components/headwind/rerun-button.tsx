"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rerunAssessment } from "@/lib/data";

export function RerunButton() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  return (
    <>
      <Button
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          await rerunAssessment();
          setState("done");
        }}
      >
        {state === "running" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {state === "running" ? "Re-running…" : "Re-run assessment"}
      </Button>
      <span role="status" className="sr-only">
        {state === "running" ? "Re-running assessment" : state === "done" ? "Assessment updated" : ""}
      </span>
    </>
  );
}
