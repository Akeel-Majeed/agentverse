import { gbpK } from "@/lib/format";

const GRID_STEP = 75;

function rect(v: number, lo: number, span: number) {
  const top = ((lo + span - Math.max(v, 0)) / span) * 100;
  const bottom = ((Math.min(v, 0) - lo) / span) * 100;
  return { top: `${top}%`, bottom: `${bottom}%` };
}

/** 20 simulated years of farm profit (£k), worst to best, with "today" as dashed ghost bars. */
export function SimulationBars({ bars, ghost, height = 260 }: { bars: number[]; ghost: number[]; height?: number }) {
  const all = [...bars, ...ghost, 0];
  const lo = Math.floor(Math.min(...all) / GRID_STEP) * GRID_STEP;
  const hi = Math.ceil(Math.max(...all) / GRID_STEP) * GRID_STEP;
  const span = hi - lo;
  const grid: number[] = [];
  for (let v = lo; v <= hi; v += GRID_STEP) grid.push(v);
  const losses = bars.filter((b) => b < 0).length;
  const ghostLosses = ghost.filter((b) => b < 0).length;

  return (
    <div className="flex flex-col gap-4">
      <figure
        role="img"
        aria-label={`20 simulated years of farm profit. ${losses} loss-making years (today ${ghostLosses}). Worst ${gbpK(bars[0])}, best ${gbpK(bars[bars.length - 1])}.`}
        className="flex gap-3"
      >
        <div aria-hidden className="relative w-12 shrink-0" style={{ height }}>
          {grid.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2 font-mono text-[11px] text-sub tabular"
              style={{ top: `${((hi - v) / span) * 100}%` }}
            >
              {gbpK(v)}
            </span>
          ))}
        </div>
        <div aria-hidden className="relative flex-1" style={{ height }}>
          {grid.map((v) => (
            <div
              key={v}
              className={v === 0 ? "absolute inset-x-0 h-px bg-ink/60" : "absolute inset-x-0 h-px bg-line"}
              style={{ top: `${((hi - v) / span) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex gap-[5px] px-1">
            {bars.map((v, i) => (
              <div key={i} className="relative flex-1" title={`Year ${i + 1}: ${gbpK(v)} (today ${gbpK(ghost[i])})`}>
                <div
                  className="absolute inset-x-0 rounded-[3px] border border-dashed border-[#9CA3AF]"
                  style={rect(ghost[i], lo, span)}
                />
                <div
                  className="absolute inset-x-[2px] rounded-[2px] transition-[top,bottom,background-color] duration-500 ease-out"
                  style={{ ...rect(v, lo, span), backgroundColor: v >= 0 ? "#16A34A" : "#DC2626" }}
                />
              </div>
            ))}
          </div>
        </div>
      </figure>
      <div aria-hidden className="-mt-1 flex justify-between pl-[60px] font-mono text-[11px] uppercase tracking-[0.06em] text-sub">
        <span>← Worst year</span>
        <span>Best year →</span>
      </div>
      <div className="border-t border-line pt-4">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-sub">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#16A34A]" /> Profit year
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#DC2626]" /> Loss year
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-[#6B7280]" /> Today, before options
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-px w-4 bg-line-strong" /> Gridlines every £75k
          </li>
        </ul>
      </div>
    </div>
  );
}
