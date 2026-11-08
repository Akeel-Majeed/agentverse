"use client";

import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mitigationDetail } from "@/lib/figures";
import type { Mitigation, RiskResult, TopMitigation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceTag } from "./card";
import { MoneyFigure } from "./money-figure";

export function scoreChange(before: number, after: number): string {
  return before === after ? `score ${before}, unchanged` : `score ${before} → ${after}`;
}

function Benefit({ risk, m }: { risk: RiskResult; m: Mitigation }) {
  return (
    <div className="text-right">
      <MoneyFigure detail={mitigationDetail(risk, m)} className="text-[15px] font-semibold text-good" />
      <div className="mt-0.5 text-[11px] text-sub">
        {m.benefitKind === "profit" ? "profit a year" : "bad-year hit"}
      </div>
    </div>
  );
}

export function MitigationRow({
  risk,
  mitigation,
  active,
  onToggle,
}: {
  risk: RiskResult;
  mitigation: Mitigation;
  active: boolean;
  onToggle: () => void;
}) {
  const m = mitigation;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-[16rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-medium tracking-[-0.03em]">{m.title}</h3>
          {m.status === "planned" || m.status === "done" ? <SourceTag>{m.status}</SourceTag> : null}
        </div>
        <p className="mt-0.5 text-[13px] text-sub">{m.description}</p>
        <p className="mt-1 text-[12.5px] text-sub">
          {m.cost} · {scoreChange(risk.score, m.scoreAfter)}
        </p>
      </div>
      <Benefit risk={risk} m={m} />
      <Button
        variant={active ? "default" : "secondary"}
        size="sm"
        aria-pressed={active}
        onClick={onToggle}
        className="w-[9.5rem]"
      >
        {active ? <Check aria-hidden /> : <Plus aria-hidden />}
        {active ? "Added" : "Add to simulation"}
      </Button>
    </li>
  );
}

export function TopMitigationItem({ item, risk }: { item: TopMitigation; risk: RiskResult }) {
  const m = item.mitigation;
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hover text-[12px] font-semibold text-ink tabular"
      >
        {item.rank}
      </span>
      <div className="min-w-[14rem] flex-1">
        <h3 className="text-[14px] font-medium tracking-[-0.03em]">
          <span className="sr-only">{item.rank}. </span>
          {m.title}
        </h3>
        <p className="mt-0.5 text-[12px] text-sub">
          {item.riskName} · {scoreChange(item.scoreBefore, m.scoreAfter)} · {m.cost}
        </p>
      </div>
      <Benefit risk={risk} m={m} />
      <Button asChild variant="secondary" size="sm">
        <Link href={`/risks/${m.riskId}`} aria-label={`Review: ${m.title}`}>
          Review
        </Link>
      </Button>
    </li>
  );
}

export function MitigationList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-line", className)}>{children}</ul>;
}
