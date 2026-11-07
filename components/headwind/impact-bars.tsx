import { gbpK } from "@/lib/format";

const SCALE_K = 150;
const TICKS = [-150, -75, 0, 75, 150];

/** Diverging bars around a centre line: gains to the right in green, losses to the left in red. */
export function ImpactBars({ items }: { items: { id: string; label: string; valueK: number }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {items.map((item) => {
          const clipped = Math.abs(item.valueK) > SCALE_K;
          const width = (Math.min(Math.abs(item.valueK), SCALE_K) / SCALE_K) * 50;
          const positive = item.valueK >= 0;
          const rounded = Math.round(item.valueK);
          return (
            <li key={item.id} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-4 py-2.5">
              <span className="text-[13.5px] font-medium">{item.label}</span>
              <div aria-hidden className="relative h-6">
                <div className="absolute inset-y-[-6px] left-1/2 w-px bg-ink/60" />
                {rounded !== 0 ? (
                  <div
                    className="absolute top-1 h-4 transition-all duration-300 ease-out"
                    style={{
                      left: positive ? "50%" : `${50 - width}%`,
                      width: `${width}%`,
                      backgroundColor: positive ? "#16A34A" : "#DC2626",
                      borderRadius: positive ? "0 3px 3px 0" : "3px 0 0 3px",
                    }}
                  />
                ) : null}
              </div>
              <span
                className={`text-right font-mono text-[13px] font-semibold tabular ${
                  rounded === 0 ? "text-sub" : positive ? "text-good" : "text-bad"
                }`}
              >
                {gbpK(item.valueK, { sign: true })}
                {clipped ? <span className="sr-only"> (beyond chart scale)</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="grid grid-cols-[8.5rem_1fr_4.5rem] gap-4">
        <span />
        <div className="relative h-4">
          {TICKS.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] text-sub tabular"
              style={{ left: `${50 + (t / SCALE_K) * 50}%` }}
            >
              {gbpK(t, { sign: t > 0 })}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
