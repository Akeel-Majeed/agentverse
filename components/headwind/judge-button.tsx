"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Starts phase 2 for a queued run (Task 10's route), then re-renders the page from the store. */
export function JudgeButton({ runId, running }: { runId: string; running: boolean }) {
  const router = useRouter();
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = judging || running;

  // While the judge works, pull new trace rows so each turn (and a kill) shows as it happens.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function judge() {
    setJudging(true);
    setError(null);
    try {
      const res = await fetch(`/api/judge/${runId}`, { method: "POST" });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Judgement failed (HTTP ${res.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJudging(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={busy} onClick={judge}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Scale aria-hidden />}
        {busy ? "Judging… usually 30–90 s" : "Run judgement (Gemini 4 Argon)"}
      </Button>
      {error ? <span role="alert" className="text-[13px] text-bad">{error}</span> : null}
    </div>
  );
}
