import { ChevronDown } from "lucide-react";
import type { Source, WorkingStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceTag } from "./card";

export function WorkingPanel({ steps, className }: { steps: WorkingStep[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-[13px]", className)}>
      {steps.map((step) => (
        <div key={step.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="min-w-0 break-words text-sub">{step.label}</dt>
          <dd className="shrink-0 text-right font-mono font-medium text-ink tabular">
            {step.value}
            {step.unit ? <span className="text-sub"> {step.unit}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Optional methodology view: the model variable or formula behind each plain-language step. */
export function FormulaDetails({ steps, className }: { steps: WorkingStep[]; className?: string }) {
  const withFormula = steps.filter((s) => s.formula);
  if (withFormula.length === 0) return null;
  return (
    <details className={cn("group rounded-xl border border-line", className)}>
      <summary className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 py-2 text-[12.5px] font-medium hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Show formulas
        <ChevronDown className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="divide-y divide-line border-t border-line px-3 py-2 font-mono text-[11.5px]">
        {withFormula.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="min-w-0 break-words text-sub">{s.formula}</dt>
            <dd className="shrink-0 text-right text-ink tabular">{s.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function SourcesList({ sources, className }: { sources: Source[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {sources.map((s) => (
        <li key={s.label} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
          <span className="text-[13px] text-ink">{s.label}</span>
          <span className="flex flex-wrap items-center gap-2">
            <SourceTag>{s.origin}</SourceTag>
            {s.date ? <span className="font-mono text-[11px] text-sub">{s.date}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-[12px] leading-relaxed text-sub", className)}>
      Options to discuss with your merchant, adviser or bank. Not financial advice.
    </p>
  );
}
