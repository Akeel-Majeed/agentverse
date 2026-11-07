import { gbp } from "@/lib/format";
import { profitDetail } from "@/lib/figures";
import type { ProfitSummary } from "@/lib/types";
import { MoneyFigure } from "./money-figure";
import { RangeBar } from "./range-bar";

export function ExpectedProfitCard({ summary, harvestYear }: { summary: ProfitSummary; harvestYear: number }) {
  const deltaTone = summary.deltaWeek < 0 ? "text-bad" : summary.deltaWeek > 0 ? "text-good" : "text-sub";
  return (
    <section aria-label="Expected profit" className="rounded-card border border-brand-border bg-brand-surface">
      <div className="border-b border-brand-border px-6 py-4">
        <h2 className="font-mono text-label font-medium uppercase text-brand-label">
          Expected profit · {harvestYear} harvest year
        </h2>
      </div>
      <div className="flex flex-col gap-6 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <MoneyFigure detail={profitDetail(summary, "expected")} className="text-[46px] font-semibold leading-none tracking-tight text-ink">
            {gbp(summary.expected)}
          </MoneyFigure>
          <p className={`font-mono text-[13px] font-medium ${deltaTone}`}>
            <MoneyFigure detail={profitDetail(summary, "deltaWeek")}>{gbp(summary.deltaWeek, { sign: true })}</MoneyFigure> vs last
            week
          </p>
        </div>
        <RangeBar low={summary.badYear} high={summary.goodYear} marker={summary.expected} />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-brand-border bg-brand-border">
          <div className="bg-brand-surface px-4 py-3">
            <dt className="font-mono text-label uppercase text-brand-label">Chance of a loss</dt>
            <dd className="mt-1 font-mono text-[22px] font-semibold tabular">{Math.round(summary.lossChance * 100)}%</dd>
          </div>
          <div className="bg-brand-surface px-4 py-3">
            <dt className="font-mono text-label uppercase text-brand-label">Loss-making years</dt>
            <dd className="mt-1 font-mono text-[22px] font-semibold tabular">{summary.lossYearsOf20} in 20</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
