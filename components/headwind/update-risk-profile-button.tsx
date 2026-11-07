"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { updateRiskProfile } from "@/lib/data";

/** Freezes the current profile into a new snapshot and rebuilds the risk profile from it. */
export function UpdateRiskProfileButton({ reason, variant }: { reason: string; variant?: ButtonProps["variant"] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("Couldn't update. Try again.");
  return (
    <>
      <Button
        variant={variant}
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          try {
            const result = await updateRiskProfile(reason);
            if (!result.ok) {
              setError(result.error);
              setState("error");
              return;
            }
            setState("done");
            router.refresh();
          } catch {
            setError("Couldn't update. Try again.");
            setState("error");
          }
        }}
      >
        {state === "running" ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
        {state === "running" ? "Updating…" : "Update risk profile"}
      </Button>
      <span role="status" className={state === "error" ? "text-[12.5px] text-bad" : "sr-only"}>
        {state === "running" ? "Updating risk profile" : state === "done" ? "Risk profile updated" : state === "error" ? error : ""}
      </span>
    </>
  );
}
