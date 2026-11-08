import Link from "next/link";
import { Card } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { modelName, StatusBadge } from "@/components/headwind/trace-timeline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRuns } from "@/lib/data";
import { londonDay, londonTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const th = "h-10 whitespace-nowrap text-label font-normal text-sub";
const COLUMNS = ["Started", "Trigger", "Status", "Model", "Turns", "Cost", "Proposals", "Controls fired", "Checker", "Chain"];

export default async function AgentRunsPage() {
  const runs = await getRuns();
  return (
    <PageShell>
      <PageHeader
        title="Agent runs"
        subtitle={
          runs.length
            ? "Every run of the risk agent, newest first. Each row opens its full hash-chained trace."
            : "No agent runs yet. Update the risk profile or add a document, and every step the agent takes is logged here."
        }
      />
      {runs.length ? (
        <Card label="Agent runs">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow className="border-line hover:bg-transparent">
                {COLUMNS.map((c, i) => (
                  <TableHead key={c} className={cn(th, i === 0 && "pl-5")}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(({ run, proposals, controlsFired, checker, verify }) => {
                const started = new Date(run.startedAt);
                return (
                  <TableRow key={run.id} className="border-line text-[13px]">
                    <TableCell className="whitespace-nowrap pl-5">
                      <Link href={`/trace/${run.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                        {londonDay(started)} {londonTime(started)}
                      </Link>
                    </TableCell>
                    <TableCell>{run.trigger}</TableCell>
                    <TableCell><StatusBadge status={run.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{run.model ? modelName(run.model) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{run.turns ?? 0}</TableCell>
                    <TableCell className="tabular-nums">{run.totalCostUsd === null ? "—" : `US$${run.totalCostUsd.toFixed(3)}`}</TableCell>
                    <TableCell className="tabular-nums">{proposals}</TableCell>
                    <TableCell className={cn("tabular-nums", controlsFired > 0 && "font-medium text-warn")}>{controlsFired}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", checker && (checker.untraced ? "text-bad" : "text-good"))}>
                      {checker ? (checker.untraced ? `${checker.untraced} untraced` : "clean") : "—"}
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap font-mono text-[12px]", verify.ok ? "text-good" : "text-bad")}>
                      {verify.ok ? `✓ ${verify.head.slice(0, 8)}` : `broken at ${verify.brokenAt}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </PageShell>
  );
}
