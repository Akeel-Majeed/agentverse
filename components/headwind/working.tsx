import type { Source, WorkingStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceTag } from "./card";

export function WorkingPanel({ steps, className }: { steps: WorkingStep[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line font-mono text-[12px]", className)}>
      {steps.map((step) => (
        <div key={step.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="min-w-0 break-words text-sub">{step.label}</dt>
          <dd className="shrink-0 text-right font-medium text-ink tabular">
            {step.value}
            {step.unit ? <span className="text-sub"> {step.unit}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
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
