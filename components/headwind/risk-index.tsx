"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { gbp, trendTone } from "@/lib/format";
import { bandFor } from "@/lib/score";
import type { RiskGroup, RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MiniScore, QUALITY_TEXT } from "./risk-summary";

const GROUPS: (RiskGroup | "All")[] = ["All", "Prices", "Weather", "Schemes", "Finance"];
const SORTS = { severity: "Most severe first", change: "Biggest change this week", name: "Name, A to Z" } as const;
type Sort = keyof typeof SORTS;

const TREND = { good: "text-good", bad: "text-bad", neutral: "text-sub" } as const;

export function RiskIndex({ risks }: { risks: RiskResult[] }) {
  const [group, setGroup] = useState<RiskGroup | "All">("All");
  const [sort, setSort] = useState<Sort>("severity");
  const visible = risks
    .filter((r) => group === "All" || r.group === group)
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "change"
          ? Math.abs(b.trend7d) - Math.abs(a.trend7d) || b.score - a.score
          : b.score - a.score || b.badYear - a.badYear
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const count = g === "All" ? risks.length : risks.filter((r) => r.group === g).length;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                  group === g ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink hover:bg-hover"
                )}
              >
                {g}
                <span className={cn("font-mono text-[11px]", group === g ? "text-white/80" : "text-sub")}>{count}</span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-sub">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-lg border border-line-strong bg-white px-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[12.5px] text-sub" aria-live="polite">
        Showing {visible.length} of {risks.length} risks{group === "All" ? "" : ` in ${group.toLowerCase()}`}.
      </p>

      <ul className="flex flex-col gap-3">
        {visible.map((risk) => {
          const band = bandFor(risk.score);
          const tone = trendTone(risk.trend7d);
          return (
            <li key={risk.id}>
              <Link
                href={`/risks/${risk.id}`}
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 rounded-card border border-line bg-white p-4 transition-colors hover:border-line-strong hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
              >
                <MiniScore score={risk.score} size={48} />
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 text-[16px] font-semibold tracking-tight group-hover:underline">
                    {risk.name}
                    <span className="text-[13px] font-medium" style={{ color: band.text }}>
                      {risk.score}/10 {band.level}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-[13.5px] text-sub">{risk.summary}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                    <div>
                      <dt className="inline text-sub">Bad year on its own: </dt>
                      <dd className="inline font-mono font-medium">{gbp(risk.badYear)}</dd>
                      <span className="text-sub"> ({risk.pctOfProfit}% of typical profit)</span>
                    </div>
                    <div>
                      <dt className="inline text-sub">This week: </dt>
                      <dd className={cn("inline font-mono font-medium", TREND[tone])}>
                        {gbp(risk.trend7d, { sign: true })}
                        <span className="font-sans font-normal text-sub">{tone === "bad" ? " worse" : tone === "good" ? " better" : " no change"}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-sub">Category: </dt>
                      <dd className="inline">{risk.group}</dd>
                    </div>
                    <div>
                      <dt className="inline text-sub">Inputs: </dt>
                      <dd className={cn("inline", risk.dataQuality.quality === "confirmed" ? "text-ink" : "text-[#92400E]")}>
                        {QUALITY_TEXT[risk.dataQuality.quality]}
                      </dd>
                    </div>
                  </dl>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-sub" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-sub">Category bad years don&apos;t add up: risks rarely all peak in the same year. See the dashboard for the whole-farm view.</p>
    </div>
  );
}
