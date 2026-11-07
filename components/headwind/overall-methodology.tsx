import { ChevronDown } from "lucide-react";
import type { OverallRiskSummary } from "@/lib/data";
import { gbpK } from "@/lib/format";
import { Z95 } from "@/lib/sim";
import { cn } from "@/lib/utils";

const BAND_ROWS = [
  ["Loss of 10% of typical profit or less, or no loss", "1"],
  ["Up to 15%", "2"],
  ["Up to 25%", "3"],
  ["Up to 35% / 45%", "4 / 5"],
  ["Up to 60% / 75%", "6 / 7"],
  ["Up to 90% / 100%", "8 / 9"],
  ["More than a typical year's profit", "10"],
];

/** Plain-language method for the overall score. Numbers come from the same summary the circle uses. */
export function OverallMethodology({ summary, harvestYear, className }: { summary: OverallRiskSummary; harvestYear: number; className?: string }) {
  const { overall, input, categories } = summary;
  return (
    <details className={cn("group rounded-xl border border-line", className)}>
      <summary className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-[13.5px] font-medium hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        How the overall score works
        <ChevronDown className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-4 text-[13.5px] leading-relaxed">
        <div>
          <h4 className="font-semibold">What it measures</h4>
          <p className="mt-1">
            How deep a loss the whole farm could make in an estimated 1-in-20 bad year for the {harvestYear} harvest year, compared with a typical
            year&apos;s profit of {gbpK(input.typicalProfitK)}. It uses the same 1–10 bands as the category scores. If a bad year would still leave a
            profit, the score is 1 (Low). It is never 0, because some risk always remains.
          </p>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[280px] text-left text-[12.5px]">
            <caption className="sr-only">Score bands</caption>
            <thead>
              <tr className="border-b border-line text-sub">
                <th scope="col" className="py-1.5 pr-3 font-medium">Whole-farm bad-year loss</th>
                <th scope="col" className="py-1.5 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {BAND_ROWS.map(([range, score]) => (
                <tr key={range} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3">{range}</td>
                  <td className="py-1.5 font-mono">{score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[12px] text-sub">1–3 Low, 4–5 Moderate, 6–7 High, 8–10 Severe.</p>
        </div>
        <div>
          <h4 className="font-semibold">How the five categories feed in</h4>
          <p className="mt-1">
            Each category&apos;s typical yearly swing in profit is combined with {gbpK(input.unattributedSdK)} of swing that isn&apos;t assigned to a
            category (other crop prices and costs). They are combined as independent risks, so they partly offset rather than all peaking together:
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 font-mono text-[12.5px] sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 border-b border-line py-1">
                <span className="font-sans">{c.name}</span>
                <span>{c.sdK === null ? "missing" : gbpK(c.sdK)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-b border-line py-1">
              <span className="font-sans">Not assigned to a category</span>
              <span>{gbpK(input.unattributedSdK)}</span>
            </li>
            <li className="flex justify-between gap-3 py-1 font-semibold">
              <span className="font-sans">Whole farm (square root of the sum of squares)</span>
              <span>{gbpK(overall.farmSdK)}</span>
            </li>
          </ul>
          <p className="mt-2">
            Bad-year profit = expected profit {gbpK(input.expectedProfitK)} − {Z95} × {gbpK(overall.farmSdK)} = {gbpK(overall.badYearProfitK)}.
            {overall.badYearProfitK < 0
              ? ` That loss is ${Math.round(overall.lossPct)}% of typical profit, so the score is ${overall.score ?? overall.floorScore}.`
              : " That is still a profit, so the score is 1."}{" "}
            The unassigned swing is set so this matches the whole-farm bad year shown on the dashboard.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Why it can differ from the highest category</h4>
          <p className="mt-1">
            A category score asks how much that one risk could take off profit on its own. The overall score asks how the whole farm comes out once
            the risks are combined and expected profit has absorbed part of the hit. So wheat price can be 10 while the farm overall is lower. More
            exposure in any category never lowers the overall score.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Severity is not probability</h4>
          <p className="mt-1">
            A 10/10 does not mean a loss is certain. The modelled chance of a loss is a separate figure ({Math.round(overall.lossChance * 100)}%, about{" "}
            {Math.round(overall.lossChance * 20)} years in 20), and expected profit is separate again.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Missing, stale and unconfirmed inputs</h4>
          <p className="mt-1">
            If any category has no data, there is no overall number: it shows as incomplete, with the lowest score the known categories already
            imply. Missing data is never treated as zero risk. If inputs are stale or unconfirmed, the score is marked provisional and the affected
            categories are listed. Proposed updates waiting for approval are not included until you approve them and the assessment re-runs.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Limitations</h4>
          <p className="mt-1">
            Profit swings are approximated with a normal distribution and the 1-in-20 year is its 5th percentile. Treating risks as independent may
            understate risk when they move together (a drought that cuts yield and raises prices) and overstate it when they offset. Options you only
            explore in a simulation don&apos;t change it. All figures here are sample data for a fictional farm.
          </p>
        </div>
      </div>
    </details>
  );
}
