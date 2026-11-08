import { gbp } from "@/lib/format";
import { profitDetail } from "@/lib/figures";
import type { ProfitSummary } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";
import { MoneyFigure } from "./money-figure";
import { RangeBar } from "./range-bar";

export function ExpectedProfitCard({ summary, harvestYear }: { summary: ProfitSummary; harvestYear: number }) {
  const deltaTone = summary.deltaWeek < 0 ? "text-bad" : summary.deltaWeek > 0 ? "text-good" : "text-sub";
  return (
    <Card label="Expected profit">
      <CardHeader title="Expected profit" description={`${harvestYear} harvest year`} />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <MoneyFigure detail={profitDetail(summary, "expected")} className="text-[40px] font-medium leading-none tracking-[-0.03em] text-ink">
            {gbp(summary.expected)}
          </MoneyFigure>
          <p className={`text-[13px] font-medium tabular ${deltaTone}`}>
            <MoneyFigure detail={profitDetail(summary, "deltaWeek")}>{gbp(summary.deltaWeek, { sign: true })}</MoneyFigure> vs last week
          </p>
        </div>
        <RangeBar low={summary.badYear} high={summary.goodYear} marker={summary.expected} />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <div className="bg-panel px-4 py-3">
            <dt className="text-label text-sub">Chance of a loss</dt>
            <dd className="mt-1 text-[20px] font-semibold tabular">{Math.round(summary.lossChance * 100)}%</dd>
          </div>
          <div className="bg-panel px-4 py-3">
            <dt className="text-label text-sub">Loss-making years</dt>
            <dd className="mt-1 text-[20px] font-semibold tabular">{summary.lossYearsOf20} in 20</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}
