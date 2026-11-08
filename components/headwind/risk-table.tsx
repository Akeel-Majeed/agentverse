import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { riskBadYearDetail } from "@/lib/figures";
import { gbp, trendTone } from "@/lib/format";
import type { RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyFigure } from "./money-figure";
import { ScoreChip } from "./score";

function mitigationStatus(risk: RiskResult): string {
  const count = (s: string) => risk.mitigations.filter((m) => m.status === s).length;
  const parts = [
    count("done") && `${count("done")} done`,
    count("planned") && `${count("planned")} planned`,
    count("suggested") && `${count("suggested")} option${count("suggested") > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "None yet";
}

const TREND_CLASS = { good: "text-good", bad: "text-bad", neutral: "text-sub" } as const;

const th = "h-10 text-label font-normal text-sub";

export function RiskTable({ risks }: { risks: RiskResult[] }) {
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow className="border-line hover:bg-transparent">
          <TableHead className={cn(th, "w-[64px] pl-5")}>Score</TableHead>
          <TableHead className={th}>Risk</TableHead>
          <TableHead className={cn(th, "text-right")}>Bad year</TableHead>
          <TableHead className={cn(th, "text-right")}>% of profit</TableHead>
          <TableHead className={cn(th, "whitespace-nowrap text-right")} title="Change in the bad-year hit over the last 7 days. Down (green) is better.">
            Bad year, 7 days
          </TableHead>
          <TableHead className={cn(th, "pr-5")}>Mitigation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {risks.map((risk) => {
          const tone = trendTone(risk.trend7d);
          return (
            <TableRow key={risk.id} className="border-line hover:bg-panel">
              <TableCell className="py-3.5 pl-5">
                <ScoreChip score={risk.score} />
              </TableCell>
              <TableCell className="py-3.5">
                <Link
                  href={`/risks/${risk.id}`}
                  className="rounded-sm text-[14px] font-medium tracking-[-0.03em] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {risk.name}
                </Link>
                <div className="mt-0.5 text-[12.5px] text-sub">{risk.driver}</div>
              </TableCell>
              <TableCell className="py-3.5 text-right text-[13.5px] font-medium">
                <MoneyFigure detail={riskBadYearDetail(risk)} />
              </TableCell>
              <TableCell className="py-3.5 text-right text-[13px] tabular">{risk.pctOfProfit}%</TableCell>
              <TableCell className={cn("py-3.5 text-right text-[13px] tabular", TREND_CLASS[tone])}>
                {gbp(risk.trend7d, { sign: true })}
                <span className="sr-only">{tone === "bad" ? " worse" : tone === "good" ? " better" : " no change"}</span>
              </TableCell>
              <TableCell className="py-3.5 pr-5 text-[12px] text-sub">{mitigationStatus(risk)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
