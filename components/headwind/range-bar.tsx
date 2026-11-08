import { gbp } from "@/lib/format";

/** Horizontal profit range: red loss zone below £0, green profit zone above, black marker at expected. */
export function RangeBar({ low, high, marker }: { low: number; high: number; marker: number }) {
  const lo = Math.min(low, 0);
  const hi = Math.max(high, 0);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = pos(0);
  const mark = pos(marker);
  return (
    <div
      role="img"
      aria-label={`Profit range from ${gbp(low)} in a bad year to ${gbp(high)} in a good year, expected ${gbp(marker)}`}
    >
      <div className="relative h-14">
        <div
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink"
          style={{ left: `${mark}%` }}
        >
          Expected
        </div>
        <div className="absolute inset-x-0 top-[26px] flex h-3 overflow-hidden rounded-full">
          <div className="h-full bg-[#E9B3A6]" style={{ width: `${zero}%` }} />
          <div className="h-full flex-1 bg-[#B8CC6E]" />
        </div>
        <div className="absolute top-[20px] h-6 w-px bg-ink/50" style={{ left: `${zero}%` }} />
        <div
          className="absolute top-[42px] -translate-x-1/2 text-[11px] text-sub"
          style={{ left: `${zero}%` }}
        >
          £0
        </div>
        <div
          className="absolute top-[18px] h-7 w-[4px] -translate-x-1/2 rounded-full border-2 border-white bg-ink"
          style={{ left: `${mark}%`, transition: "left 400ms ease" }}
        />
      </div>
      <div className="mt-2 flex items-start justify-between gap-4 text-[12px]">
        <div>
          <div className="text-sub">Bad year</div>
          <div className="font-semibold text-bad">{gbp(low)}</div>
        </div>
        <div className="text-right">
          <div className="text-sub">Good year</div>
          <div className="font-semibold text-good">{gbp(high)}</div>
        </div>
      </div>
    </div>
  );
}
