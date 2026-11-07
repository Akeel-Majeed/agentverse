import Link from "next/link";
import { gbp } from "@/lib/format";
import type { ProfileStatus, RiskProfileRow, SignalImpact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, SectionLabel } from "./card";
import { NewsImpactList } from "./news-impacts";
import { ScoreChip } from "./score";
import { UpdateRiskProfileButton } from "./update-risk-profile-button";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function snapshotLabel(s: { version: number; takenAt: string }) {
  return `Snapshot v${s.version} · ${WHEN.format(new Date(s.takenAt))}`;
}

/**
 * The risk profile: a frozen snapshot of the farm, what each risk has at stake in it, and how
 * news since then moves expected profit. Shows profile edits not yet in the snapshot.
 */
export function RiskProfileCard({
  status,
  rows,
  impacts,
}: {
  status: ProfileStatus;
  rows: RiskProfileRow[];
  impacts: SignalImpact[];
}) {
  const pending = status.changes.length;
  const total = impacts.reduce((s, i) => s + (i.delta ?? 0), 0);
  return (
    <Card label="Risk profile">
      <CardHeader
        title="Risk profile"
        description={`${snapshotLabel(status.snapshot)}. News is measured against this snapshot until you update it.`}
        action={<UpdateRiskProfileButton reason={pending ? `${pending} profile change${pending > 1 ? "s" : ""}` : "Refreshed to today's prices"} variant={pending ? "default" : "secondary"} />}
      />
      {pending ? (
        <div className="border-b border-line bg-[#FFFBEB] px-5 py-3 text-[13px] text-[#92400E]" role="status">
          <p className="font-medium">
            {pending} change{pending > 1 ? "s" : ""} since this snapshot, not in your risk figures yet.
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px]">
            {status.changes.slice(0, 4).map((c) => (
              <li key={c.key}>
                {c.label}: <span className="line-through decoration-[#D97706]/60">{c.before}</span> → <span className="font-medium">{c.after}</span>
              </li>
            ))}
            {pending > 4 ? <li>and {pending - 4} more</li> : null}
          </ul>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="h-10 pl-5 text-label font-normal text-sub">Risk</th>
              <th className="h-10 text-label font-normal text-sub">What the farm has at stake</th>
              <th className="h-10 text-right text-label font-normal text-sub">Bad year</th>
              <th className="h-10 pr-5 text-right text-label font-normal text-sub">News since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.riskId} className="border-b border-line align-top last:border-0 hover:bg-panel">
                <td className="py-3.5 pl-5">
                  <Link href={`/risks/${r.riskId}`} className="flex items-center gap-2.5 rounded-sm text-[14px] font-semibold tracking-tight hover:underline">
                    <ScoreChip score={r.score} />
                    {r.name}
                  </Link>
                </td>
                <td className="max-w-[420px] py-3.5 pr-4 text-[12.5px] leading-relaxed text-sub">
                  <span className="font-semibold text-ink tabular">{gbp(r.exposure.total)}</span> · {r.exposure.summary}
                </td>
                <td className="py-3.5 text-right text-[13px] font-medium tabular">{gbp(r.badYear)}</td>
                <td className={cn("py-3.5 pr-5 text-right text-[13px] tabular", r.newsDelta < 0 ? "text-bad" : r.newsDelta > 0 ? "text-good" : "text-sub")}>
                  {r.newsMeasured ? gbp(r.newsDelta, { sign: true }) : r.newsCount ? "No £ figure" : "—"}
                  <span className="block text-[11px] text-sub">
                    {r.newsCount} item{r.newsCount === 1 ? "" : "s"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardBody className="border-t border-line">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel as="h3">News since the snapshot</SectionLabel>
          {impacts.length ? (
            <span className="text-[12.5px] text-sub">
              Together: <span className={cn("font-semibold tabular", total < 0 ? "text-bad" : "text-good")}>{gbp(total, { sign: true })}</span> on expected profit
            </span>
          ) : null}
        </div>
        <NewsImpactList impacts={impacts} />
      </CardBody>
    </Card>
  );
}
