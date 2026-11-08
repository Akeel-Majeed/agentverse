"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/headwind/card";
import { Button } from "@/components/ui/button";
import { recordHedgeDecision } from "@/lib/data";
import { gbp, londonTime } from "@/lib/format";
import type { HedgeChoice, HedgeDecision } from "@/lib/trace/decision";

const CHOICE: Record<HedgeChoice, string> = { discuss: "I'll discuss this with my merchant", not_now: "Not now" };

const Fig = ({ id, children }: { id: string; children: ReactNode }) => (
  <a href={`#${id}`} className="text-brand underline-offset-4 hover:underline">
    {children}
  </a>
);
const Cites = ({ ids }: { ids: string[] }) => (
  <span className="text-[12px] text-sub">
    cites{" "}
    {ids.map((id, i) => (
      <span key={id}>
        {i > 0 ? ", " : ""}
        <Fig id={id}><span className="font-mono text-[11.5px]">{id}</span></Fig>
      </span>
    ))}
  </span>
);

/**
 * The run's hedge: the judge ranks, code checks it protects the 1-in-20 year (p5_gain > 0) and works
 * out the bad year after it. The farmer's answer is logged on the chain; nothing moves money.
 */
export function HedgeDecisionCard({ runId, decision, canDecide, model }: { runId: string; decision: HedgeDecision; canDecide: boolean; model: string }) {
  const { hedge, badYearBefore, badYearAfter, ruledOut, changeMyMind, farmerDecision } = decision;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (choice: HedgeChoice) =>
    startTransition(async () => {
      setError(null);
      try {
        await recordHedgeDecision(runId, hedge!.optionId, choice);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <Card label="Decision">
      <CardHeader
        title="Hedge to discuss with your merchant"
        description="Options to discuss with your merchant, adviser or bank, not advice."
      />
      <CardBody className="space-y-5">
        {hedge ? (
          <div className="space-y-3">
            <p className="text-[22px] font-medium leading-tight tracking-[-0.03em] text-ink">{hedge.label}</p>
            <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2">
              <div>
                <SectionLabel as="dt">Bad year (1 in 20)</SectionLabel>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[18px] font-medium tabular">
                  <Fig id={badYearBefore.id}>{badYearBefore.display}</Fig>
                  <ArrowRight aria-label="to" className="h-4 w-4 self-center text-sub" />
                  <span className="text-ink">{badYearAfter}</span>
                  <span className="text-[13px] text-good">
                    (<Fig id={hedge.p5Gain.id}>{gbp(hedge.p5Gain.value, { sign: true })}</Fig>)
                  </span>
                </dd>
              </div>
              <div>
                <SectionLabel as="dt">Cost a year</SectionLabel>
                <dd className="mt-1 text-[18px] font-medium tabular">
                  <Fig id={hedge.cost.id}>{hedge.cost.display}</Fig>
                </dd>
              </div>
            </dl>
            <p className="text-[13.5px] leading-relaxed">
              {hedge.reason} <Cites ids={hedge.cites} />
            </p>
          </div>
        ) : (
          <p className="text-[15px] font-medium text-ink">
            No option improves the bad year (<Fig id={badYearBefore.id}>{badYearBefore.display}</Fig>), so there is no hedge to discuss.
          </p>
        )}

        {changeMyMind.length ? (
          <div>
            <SectionLabel>What would change it</SectionLabel>
            <ul className="mt-1.5 divide-y divide-line text-[13px]">
              {changeMyMind.map((c) => (
                <li key={c.thresholdId} className="py-1.5">
                  {c.statement}{" "}
                  <span className="text-sub">
                    (<Fig id={c.thresholdId}>{c.display ?? c.thresholdId}</Fig>)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ruledOut.length ? (
          <div>
            <SectionLabel>Ruled out</SectionLabel>
            <ul className="mt-1.5 divide-y divide-line text-[13px]">
              {ruledOut.map((o) => (
                <li key={o.optionId} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <span className="font-medium text-ink">{o.label}</span>
                  <span className="text-bad tabular">
                    <Fig id={o.p5Gain.id}>{o.p5Gain.display}</Fig> on the bad year: makes the bad year worse
                  </span>
                  <span className="text-sub tabular">
                    · costs <Fig id={o.cost.id}>{o.cost.display}</Fig> a year
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hedge ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {canDecide ? (
              <>
                <Button disabled={pending} onClick={() => decide("discuss")}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {CHOICE.discuss}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={() => decide("not_now")}>
                  {CHOICE.not_now}
                </Button>
              </>
            ) : null}
            <span role="status" className="text-[13px]">
              {farmerDecision ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <Check aria-hidden className="h-4 w-4 text-good" />
                  You chose: {CHOICE[farmerDecision.choice]} at {londonTime(new Date(farmerDecision.at))}
                </span>
              ) : canDecide ? (
                <span className="text-sub">Logged on this run&apos;s trace. Nothing is bought, sold or changed.</span>
              ) : (
                <span className="text-sub">Only a published run can be decided.</span>
              )}
            </span>
            {error ? <span role="alert" className="text-[13px] text-bad">{error}</span> : null}
          </div>
        ) : null}

        <p className="text-[12px] text-sub">Ranked by {model} · protection checked in code</p>
      </CardBody>
    </Card>
  );
}
