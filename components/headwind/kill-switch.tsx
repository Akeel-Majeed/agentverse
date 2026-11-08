"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPaused } from "@/lib/data";
import { cn } from "@/lib/utils";

/** The farmer's kill switch. Enforced in code: the judge checks it before every turn and function call, and every 2 s mid-call. */
export function KillSwitch({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-card border px-5 py-3.5 shadow-card",
        paused ? "border-bad/40 bg-bad/5" : "border-line bg-white"
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-[14.5px] font-semibold tracking-tight", paused ? "text-bad" : "text-ink")}>
          {paused ? "Agent stopped by the farmer" : "Agent running normally"}
        </p>
        <p className="mt-0.5 text-[12.5px] text-sub">
          Kill switch. Checked in code before every Gemini turn and function call, and every 2 s during a call; a stopped run ends <span className="font-mono">killed</span>.
        </p>
      </div>
      <Button
        disabled={pending}
        className={paused ? undefined : "bg-bad hover:bg-bad/90"}
        onClick={() =>
          start(async () => {
            await setPaused(!paused);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {paused ? "Restart the agent" : "Stop the agent"}
      </Button>
    </div>
  );
}
