import type { CalendarItem, CalendarLane } from "@/lib/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const LANES: CalendarLane[] = ["Selling", "Inputs", "Finance", "Schemes", "Markets"];
/** Narrowest track width (px) the label-packing estimate assumes; the track scrolls below this. */
const MIN_TRACK_PX = 860;
const PERIOD_ROW = 30;
const MARKER_ROW = 26;

interface Placed<T> {
  item: T;
  row: number;
}

function pack<T>(items: T[], extent: (item: T) => [number, number]): { placed: Placed<T>[]; rows: number } {
  const rowEnds: number[] = [];
  const placed = items.map((item) => {
    const [a, b] = extent(item);
    let row = rowEnds.findIndex((end) => end <= a);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = b + 0.6;
    return { item, row };
  });
  return { placed, rows: rowEnds.length };
}

function Diamond({ kind }: { kind: CalendarItem["kind"] }) {
  return (
    <span
      aria-hidden
      className={cn("block h-[10px] w-[10px] shrink-0 rotate-45 rounded-[1.5px]", kind === "key" ? "bg-brand" : "bg-ink")}
    />
  );
}

export function Timeline({ items, start, months = 12, today }: { items: CalendarItem[]; start: string; months?: number; today: string }) {
  const startMs = Date.parse(start);
  const startDate = new Date(startMs);
  const endMs = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, 1);
  const x = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - startMs) / (endMs - startMs)) * 100));
  const monthStarts = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 1));
    return {
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
      year: i === 0 || d.getUTCMonth() === 0 ? String(d.getUTCFullYear()).slice(2) : null,
    };
  });
  const todayX = x(today);

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[980px]">
        <div className="grid grid-cols-[120px_1fr]">
          <div className="border-b border-line" />
          <div className="relative h-12 border-b border-line">
            {monthStarts.map((m) => (
              <span
                key={m.iso}
                className="absolute bottom-2 pl-1.5 text-[11px] text-sub"
                style={{ left: `${x(m.iso)}%` }}
              >
                {m.label}
                {m.year ? <span className="text-ink"> ’{m.year}</span> : null}
              </span>
            ))}
          </div>

          {LANES.map((lane) => {
            const laneItems = items.filter((i) => i.lane === lane);
            const periods = pack(
              laneItems.filter((i) => i.kind === "period").sort((a, b) => a.start.localeCompare(b.start)),
              (i) => [x(i.start), x(i.end ?? i.start)]
            );
            const markers = pack(
              laneItems.filter((i) => i.kind !== "period").sort((a, b) => a.start.localeCompare(b.start)),
              (i) => {
                const pos = x(i.start);
                const w = ((i.label.length * 6.6 + 64) / MIN_TRACK_PX) * 100;
                return pos + w > 100 ? [pos - w, pos] : [pos, pos + w];
              }
            );
            const height = 20 + periods.rows * PERIOD_ROW + markers.rows * MARKER_ROW;
            return (
              <div key={lane} className="contents">
                <div className="flex items-start border-b border-line py-4 pr-3">
                  <h3 className="text-label text-ink">{lane}</h3>
                </div>
                <ul aria-label={`${lane} timeline`} className="relative border-b border-line" style={{ height }}>
                  {periods.placed.map(({ item, row }) => {
                    const left = x(item.start);
                    const width = Math.max(x(item.end ?? item.start) - left, 1);
                    const warn = item.tone === "warning";
                    return (
                      <li
                        key={item.id}
                        title={`${item.label}: ${shortDate(item.start)} – ${shortDate(item.end ?? item.start)}`}
                        className={cn(
                          "absolute flex h-6 items-center overflow-hidden rounded-md border px-2 text-[12px] font-medium",
                          warn ? "border-[#FCA5A5] bg-[#FEE2E2] text-bad" : "border-[#E2E2E2] bg-[#F0F0F0] text-ink"
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, top: 10 + row * PERIOD_ROW }}
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="sr-only">
                          , {shortDate(item.start)} to {shortDate(item.end ?? item.start)}
                        </span>
                      </li>
                    );
                  })}
                  {markers.placed.map(({ item, row }) => {
                    const pos = x(item.start);
                    const w = ((item.label.length * 6.6 + 64) / MIN_TRACK_PX) * 100;
                    const flip = pos + w > 100;
                    const isKey = item.kind === "key";
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "absolute flex items-center gap-2 whitespace-nowrap text-[12px]",
                          flip ? "-translate-x-full flex-row-reverse" : "",
                          isKey ? "font-semibold text-brand" : "text-ink"
                        )}
                        style={{
                          left: `calc(${pos}% ${flip ? "+ 5px" : "- 5px"})`,
                          top: 10 + periods.rows * PERIOD_ROW + row * MARKER_ROW + 4,
                        }}
                      >
                        <Diamond kind={item.kind} />
                        <span>
                          <span className={cn("text-[11px]", isKey ? "text-brand" : "text-sub")}>
                            {shortDate(item.start)}
                          </span>{" "}
                          {item.label}
                          <span className="sr-only">{isKey ? " (next key decision)" : " (deadline)"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div aria-hidden className="pointer-events-none absolute bottom-0 left-[120px] right-0 top-0">
          {monthStarts.slice(1).map((m) => (
            <div key={m.iso} className="absolute bottom-0 top-12 w-px bg-line/70" style={{ left: `${x(m.iso)}%` }} />
          ))}
          <div className="absolute bottom-0 top-0 border-l-[1.5px] border-dashed border-ink/70" style={{ left: `${todayX}%` }} />
          <span
            className="absolute top-0 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white"
            style={{ left: `${todayX}%` }}
          >
            Today
          </span>
        </div>
      </div>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-sub">
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-6 rounded-[4px] border border-[#E2E2E2] bg-[#F0F0F0]" /> Period
      </li>
      <li className="flex items-center gap-2">
        <Diamond kind="deadline" /> Deadline
      </li>
      <li className="flex items-center gap-2">
        <Diamond kind="key" /> Next key decision
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-4 border-l-[1.5px] border-dashed border-ink/70" /> Today
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-6 rounded-[4px] border border-[#FCA5A5] bg-[#FEE2E2]" /> Overdraft peak
      </li>
    </ul>
  );
}
