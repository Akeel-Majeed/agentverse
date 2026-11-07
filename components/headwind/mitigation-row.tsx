"use client";

import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mitigationDetail } from "@/lib/figures";
import { longDate } from "@/lib/format";
import type { CalendarItem, Mitigation, RiskResult, TopMitigation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceTag } from "./card";
import { MoneyFigure } from "./money-figure";

export function scoreChange(before: number, after: number): string {
  return before === after ? `score ${before}, unchanged` : `score ${before} → ${after}`;
}

/** Names the benefit type so a bad-year reduction is never read as a yearly profit gain, or vice versa. */
export function Benefit({ risk, m, align = "right" }: { risk: RiskResult; m: Mitigation; align?: "left" | "right" }) {
  const profit = m.benefitKind === "profit";
  return (
    <div className={align === "right" ? "sm:text-right" : undefined}>
      <div className="text-[11.5px] font-medium text-sub">{profit ? "Profit gain" : "Risk reduction"}</div>
      <MoneyFigure detail={mitigationDetail(risk, m)} className="text-[15px] font-semibold text-good" />
      <div className="mt-0.5 text-[12px] text-sub">{profit ? "to expected profit, each year" : "off this risk's bad-year hit"}</div>
    </div>
  );
}

const CERTAINTY_WORD: Record<CalendarItem["certainty"], string> = { confirmed: "confirmed", expected: "expected", market: "scheduled" };

export function DeadlineText({ item }: { item: CalendarItem }) {
  return (
    <>
      By {longDate(item.start)} <span className="text-sub">({CERTAINTY_WORD[item.certainty]})</span>
    </>
  );
}

export function MitigationRow({
  risk,
  mitigation,
  deadline,
  active,
  onToggle,
}: {
  risk: RiskResult;
  mitigation: Mitigation;
  deadline?: CalendarItem;
  active: boolean;
  onToggle: () => void;
}) {
  const m = mitigation;
  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold tracking-tight">{m.title}</h3>
          {m.status === "planned" || m.status === "done" ? <SourceTag>{m.status}</SourceTag> : null}
        </div>
        <p className="mt-0.5 text-[13px] text-sub">{m.description}</p>
        <p className="mt-1 text-[12.5px] text-sub">
          <span className="text-ink">Cost or trade-off:</span> {m.cost} · {scoreChange(risk.score, m.scoreAfter)}
        </p>
        {deadline ? (
          <p className="mt-0.5 text-[12.5px]">
            <DeadlineText item={deadline} />: {deadline.label.toLowerCase()}
          </p>
        ) : null}
      </div>
      <Benefit risk={risk} m={m} />
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={active}
        onClick={onToggle}
        className={cn("w-[10.5rem]", active && "border-ink bg-hover")}
      >
        {active ? <Check aria-hidden /> : <Plus aria-hidden />}
        {active ? "In comparison" : "Add to comparison"}
      </Button>
    </li>
  );
}

export function TopMitigationItem({ item, risk }: { item: TopMitigation; risk: RiskResult }) {
  const m = item.mitigation;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center">
      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong font-mono text-[12px] font-semibold">
        {item.rank}
      </span>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight">
          <span className="sr-only">{item.rank}. </span>
          {m.title}
        </h3>
        <p className="mt-0.5 text-[12.5px] text-sub">
          {item.riskName} · {scoreChange(item.scoreBefore, m.scoreAfter)} · {m.cost}
        </p>
        {item.deadline ? (
          <p className="mt-0.5 text-[12.5px]">
            <DeadlineText item={item.deadline} />
          </p>
        ) : null}
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <Benefit risk={risk} m={m} />
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/risks/${m.riskId}#options`}>
            {m.actionLabel ?? "Review"} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </li>
  );
}

export function MitigationList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-line", className)}>{children}</ul>;
}
