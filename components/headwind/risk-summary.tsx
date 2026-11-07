"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { OverallRiskSummary } from "@/lib/data";
import { gbp, gbpK } from "@/lib/format";
import type { CategoryExposure } from "@/lib/overall";
import { bandFor, ringGeometry } from "@/lib/score";
import type { InputQuality, RiskResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OverallMethodology } from "./overall-methodology";

const SIZE = 240;
const STROKE = 10;
const STEP = 14;
const GAP_DEG = 18;
const TRACK = "#EFEFEF";

const POSITION = ["ring 1 (outer)", "ring 2", "ring 3", "ring 4", "ring 5 (inner)"];

export const QUALITY_TEXT: Record<InputQuality, string> = {
  confirmed: "Confirmed",
  unconfirmed: "Unconfirmed input",
  stale: "Stale input",
  missing: "Missing data",
};

function levelText(score: number | null) {
  return score === null ? "No data" : bandFor(score).level;
}

function categoryLabel(c: CategoryExposure, i: number) {
  return `${c.name}, ${POSITION[i]}: ${c.score === null ? "no data" : `${c.score} out of 10, ${bandFor(c.score).level}`}`;
}

/** One circle with a concentric progress ring per category and the overall score in the centre. */
export function CombinedRiskCircle({
  summary,
  selectedId,
  onSelect,
  className,
}: {
  summary: OverallRiskSummary;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const { overall, categories } = summary;
  const c = SIZE / 2;
  const centreBand = overall.score === null ? null : bandFor(overall.score);
  const stateWord = overall.state === "provisional" ? "provisional" : overall.state === "incomplete" ? "incomplete" : null;
  const label = `Overall farm risk ${overall.score === null ? "not available, data incomplete" : `${overall.score} out of 10, ${overall.level}`}${
    stateWord && overall.score !== null ? `, ${stateWord}` : ""
  }. Rings from outside in: ${categories.map(categoryLabel).join("; ")}.`;

  return (
    <div role="img" aria-label={label} className={cn("relative aspect-square w-[220px] shrink-0 sm:w-[240px]", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" aria-hidden>
        {categories.map((cat, i) => {
          const r = c - STROKE / 2 - 1 - i * STEP;
          const g = ringGeometry(cat.score, r, GAP_DEG);
          const dim = selectedId && selectedId !== cat.id;
          const selected = selectedId === cat.id;
          const color = cat.score === null ? TRACK : bandFor(cat.score).color;
          return (
            <g key={cat.id} onClick={onSelect ? () => onSelect(cat.id) : undefined} className={onSelect ? "cursor-pointer" : undefined}>
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={selected ? "#D4D4D4" : TRACK}
                strokeWidth={STROKE}
                strokeDasharray={cat.score === null ? "3 3" : `${g.trackLength} ${g.circumference}`}
                transform={`rotate(${g.rotation} ${c} ${c})`}
              />
              {g.fillLength > 0 ? (
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${g.fillLength} ${g.circumference}`}
                  transform={`rotate(${g.rotation} ${c} ${c})`}
                  opacity={dim ? 0.28 : 1}
                  style={{ transition: "stroke-dasharray 500ms ease, opacity 200ms ease" }}
                />
              ) : null}
              <text
                x={c}
                y={c - r}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={selected ? 800 : 600}
                className="font-mono"
                fill={dim ? "#9A9A9A" : "#0A0A0A"}
              >
                {i + 1}
              </text>
            </g>
          );
        })}
        <text x={c} y={c - 27} textAnchor="middle" fontSize={9} letterSpacing="0.08em" fill="#6B6B6B" className="font-mono">
          OVERALL
        </text>
        <text x={c} y={c + 4} textAnchor="middle" dominantBaseline="central" className="font-mono" fill="#0A0A0A">
          <tspan fontSize={38} fontWeight={700}>
            {overall.score ?? "—"}
          </tspan>
          <tspan fontSize={12} fill="#6B6B6B" dx={2}>
            /10
          </tspan>
        </text>
        <text x={c} y={c + 31} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={centreBand?.text ?? "#6B6B6B"}>
          {overall.level ?? "Incomplete"}
        </text>
        {overall.state === "provisional" ? (
          <text x={c} y={c + 45} textAnchor="middle" fontSize={9.5} fill="#92400E">
            Provisional
          </text>
        ) : null}
      </svg>
    </div>
  );
}

/** Small 44px category circle used beneath the main graphic. */
export function MiniScore({ score, size = 44 }: { score: number | null; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const g = ringGeometry(score, r);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} strokeDasharray={score === null ? "2 2" : undefined} />
      {g.fillLength > 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bandFor(score!).color}
          strokeWidth={stroke}
          strokeDasharray={`${g.fillLength} ${g.circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} className="font-mono" fill="#0A0A0A">
        {score ?? "—"}
      </text>
    </svg>
  );
}

export function RiskSummary({
  summary,
  risks,
  harvestYear,
}: {
  summary: OverallRiskSummary;
  risks: RiskResult[];
  harvestYear: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { overall, categories } = summary;
  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id));
  const selectedIndex = categories.findIndex((c) => c.id === selectedId);
  const selected = selectedIndex >= 0 ? categories[selectedIndex] : null;
  const risk = selected ? risks.find((r) => r.id === selected.id) : null;
  const highestRisk = risks.find((r) => r.id === overall.highest?.id);

  return (
    <section aria-labelledby="risk-summary-heading" className="min-w-0 rounded-card border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-6">
        <h2 id="risk-summary-heading" className="text-[15px] font-semibold tracking-tight">
          Overall risk and the five categories
        </h2>
        <p className="text-[12.5px] text-sub">{harvestYear} harvest year · score 1–10, higher is more severe</p>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <CombinedRiskCircle summary={summary} selectedId={selectedId} onSelect={toggle} />
          <div aria-live="polite" className="w-full min-w-0 flex-1 text-[13.5px] leading-relaxed">
            {selected && risk ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-sub">Selected: {POSITION[selectedIndex]}</p>
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-[16px] font-semibold tracking-tight">
                  {risk.name}
                  <span className="font-mono text-[14px]" style={{ color: bandFor(risk.score).text }}>
                    {risk.score}/10 {bandFor(risk.score).level}
                  </span>
                </h3>
                <p>{risk.summary}</p>
                <p className="text-sub">
                  On its own, an estimated 1-in-20 bad year for this risk takes {gbp(risk.badYear)} off profit ({risk.pctOfProfit}% of a
                  typical year).
                </p>
                <p className="text-sub">
                  Inputs: <span className="text-ink">{QUALITY_TEXT[risk.dataQuality.quality]}</span>
                  {risk.dataQuality.quality !== "confirmed" ? ` · ${risk.dataQuality.note}` : null}
                </p>
                <p className="text-[12.5px] text-sub">Overall risk stays at {overall.score ?? "—"}/10: it describes the whole farm, not this category.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`/risks/${risk.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-white hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                  >
                    View risk details <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-ink hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <h3 className="text-[16px] font-semibold tracking-tight">
                  Overall risk:{" "}
                  {overall.score === null ? (
                    <span>incomplete</span>
                  ) : (
                    <span style={{ color: bandFor(overall.score).text }}>
                      {overall.score}/10 {overall.level}
                    </span>
                  )}
                  {overall.state === "provisional" ? <span className="text-[13px] font-medium text-[#92400E]"> · provisional</span> : null}
                </h3>
                {overall.score === null ? (
                  <p>
                    Some category data is missing, so there is no overall number yet. From the categories with data it is at least {overall.floorScore}/10.
                  </p>
                ) : (
                  <p>
                    In an estimated 1-in-20 bad year the whole farm makes {overall.badYearProfitK < 0 ? "a loss of" : "a profit of"}{" "}
                    {gbpK(Math.abs(overall.badYearProfitK))}
                    {overall.badYearProfitK < 0 ? `, ${Math.round(overall.lossPct)}% of a typical year's profit` : ""}.
                  </p>
                )}
                {highestRisk ? (
                  <p className="text-sub">
                    Highest category: <span className="font-medium text-ink">{highestRisk.name}</span>, {highestRisk.score}/10 {bandFor(highestRisk.score).level}. The overall score is
                    {overall.score !== null && overall.score < highestRisk.score ? " lower" : " different"} because risks rarely all peak in the same year.
                  </p>
                ) : null}
                {overall.issues.length > 0 ? (
                  <p className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[13px] text-[#78350F]">
                    {overall.state === "incomplete" ? "Incomplete" : "Provisional"}:{" "}
                    {overall.issues.map((i) => `${i.name} (${QUALITY_TEXT[i.quality].toLowerCase()})`).join(", ")}.{" "}
                    <Link href="/actions" className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Review inputs
                    </Link>
                  </p>
                ) : null}
                <p className="text-[12.5px] text-sub">Select a category below or a ring to see what drives it.</p>
              </div>
            )}
          </div>
        </div>

        <CategoryBreakdown categories={categories} risks={risks} selectedId={selectedId} onSelect={toggle} />

        <OverallMethodology summary={summary} harvestYear={harvestYear} />
      </div>
    </section>
  );
}

function CategoryBreakdown({
  categories,
  risks,
  selectedId,
  onSelect,
}: {
  categories: CategoryExposure[];
  risks: RiskResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-medium text-sub">Categories, outer ring to inner ring</h3>
      <ul className="grid gap-2 sm:grid-cols-3 min-[1200px]:grid-cols-5">
        {categories.map((cat, i) => {
          const risk = risks.find((r) => r.id === cat.id);
          const selected = selectedId === cat.id;
          const band = cat.score === null ? null : bandFor(cat.score);
          return (
            <li key={cat.id} className="flex min-w-0 items-stretch gap-1">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${categoryLabel(cat, i)}${risk ? `, ${gbp(risk.badYear)} bad year` : ""}`}
                onClick={() => onSelect(cat.id)}
                className={cn(
                  "flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[1200px]:flex-col min-[1200px]:items-center min-[1200px]:gap-1.5 min-[1200px]:px-2 min-[1200px]:py-3 min-[1200px]:text-center",
                  selected ? "border-ink bg-panel" : "border-line hover:border-line-strong hover:bg-panel"
                )}
              >
                <MiniScore score={cat.score} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13.5px] font-semibold leading-snug tracking-tight">
                    <span className="mr-1 font-mono text-[11px] font-medium text-sub">{i + 1}</span>
                    {cat.name}
                  </span>
                  <span className="text-[12.5px]">
                    <span className="font-medium" style={{ color: band?.text ?? "#6B6B6B" }}>
                      {levelText(cat.score)}
                    </span>
                    {risk ? <span className="font-mono text-sub"> · {gbp(risk.badYear)}</span> : null}
                  </span>
                </span>
              </button>
              <Link
                href={`/risks/${cat.id}`}
                aria-label={`${cat.name} details`}
                className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-line text-sub hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-sub">£ = this category&apos;s own 1-in-20 bad-year hit. Category hits don&apos;t add up to the whole-farm result.</p>
    </div>
  );
}
