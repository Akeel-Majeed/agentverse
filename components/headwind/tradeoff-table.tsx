import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tradeoffDetail } from "@/lib/figures";
import { amount } from "@/lib/format";
import { tradeoffRows } from "@/lib/sim";
import type { RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyFigure } from "./money-figure";

const th = "h-10 text-label font-normal text-sub";

export function TradeoffTable({ risk }: { risk: RiskResult }) {
  const rows = tradeoffRows(risk.model);
  const { model } = risk;
  return (
    <div>
      <div className="overflow-x-auto">
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(th, "pl-5")}>{model.tradeoff.actionLabel}</TableHead>
              <TableHead className={cn(th, "text-right")}>{model.exposureLabel}</TableHead>
              <TableHead className={cn(th, "text-right")}>Bad-year hit</TableHead>
              <TableHead className={cn(th, "text-right")}>Profit, bad year</TableHead>
              <TableHead className={cn(th, "text-right")}>Loss years</TableHead>
              <TableHead className={cn(th, "pr-5 text-right")}>Upside given up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.share} className="border-line text-[13px] tabular hover:bg-panel">
                <TableCell className="py-3 pl-5 font-semibold">
                  {Math.round(row.share * 100)}%
                  {row.share === 0 ? <span className="ml-2 font-normal text-sub">today</span> : null}
                </TableCell>
                <TableCell className="py-3 text-right">{amount(row.exposure, model.unit)}</TableCell>
                <TableCell className="py-3 text-right">
                  <MoneyFigure detail={tradeoffDetail(risk, row, "hitK")} />
                </TableCell>
                <TableCell className={cn("py-3 text-right", row.badYearProfitK < 0 ? "text-bad" : "text-good")}>
                  <MoneyFigure detail={tradeoffDetail(risk, row, "badYearProfitK")} />
                </TableCell>
                <TableCell className="py-3 text-right">{row.lossYears} in 20</TableCell>
                <TableCell className="py-3 pr-5 text-right text-sub">
                  <MoneyFigure detail={tradeoffDetail(risk, row, "upsideGivenUpK")} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-sub">{model.tradeoff.note}</p>
    </div>
  );
}
