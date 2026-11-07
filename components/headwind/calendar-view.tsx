"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { longDate, shortDate } from "@/lib/format";
import type { CalendarItem, CalendarLane } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CERTAINTY_LABEL } from "./coming-up";
import { LANES, Marker, Timeline, TimelineLegend } from "./timeline";

export interface RelatedAction {
  riskId: string;
  title: string;
}

type View = "agenda" | "timeline";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function when(item: CalendarItem) {
  return item.end ? `${longDate(item.start)} to ${longDate(item.end)}` : longDate(item.start);
}

function EventDetails({
  item,
  riskNames,
  actions,
}: {
  item: CalendarItem;
  riskNames: Record<string, string>;
  actions: RelatedAction[];
}) {
  return (
    <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-sub">When</dt>
        <dd>{when(item)}</dd>
        <dt className="text-sub">Status</dt>
        <dd>{CERTAINTY_LABEL[item.certainty]}</dd>
        <dt className="text-sub">Source</dt>
        <dd>{item.source}</dd>
        <dt className="text-sub">Why it matters</dt>
        <dd>{item.why}</dd>
      </dl>
      {item.riskId || actions.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {item.riskId ? (
            <li>
              <Link href={`/risks/${item.riskId}`} className="inline-flex min-h-9 items-center gap-1 rounded-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {riskNames[item.riskId]} risk <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ) : null}
          {actions.map((a) => (
            <li key={a.title}>
              <Link href={`/risks/${a.riskId}#options`} className="inline-flex min-h-9 items-center gap-1 rounded-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Option: {a.title} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AgendaItem({
  item,
  riskNames,
  actions,
  defaultOpen = false,
}: {
  item: CalendarItem;
  riskNames: Record<string, string>;
  actions: RelatedAction[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const isKey = item.kind === "key";
  return (
    <li className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("w-14 shrink-0 pt-0.5 font-mono text-[12px] font-medium uppercase tabular", isKey ? "text-brand" : "text-ink")}>
          {shortDate(item.start)}
        </span>
        <span className="mt-[5px]">
          <Marker kind={item.kind} certainty={item.certainty} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[14px]", isKey && "font-semibold text-brand")}>
            {item.label}
            {isKey ? <span className="font-normal"> · next key decision</span> : null}
          </span>
          <span className="block text-[12.5px] text-sub">
            {item.lane} · {CERTAINTY_LABEL[item.certainty]}
            {item.end ? ` · until ${shortDate(item.end)}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-sub transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={panelId} hidden={!open} className="pb-2 pl-2 pr-2 sm:pl-[5.25rem]">
        <EventDetails item={item} riskNames={riskNames} actions={actions} />
      </div>
    </li>
  );
}

export function CalendarView({
  items,
  today,
  timelineStart,
  riskNames,
  actionsByItem,
}: {
  items: CalendarItem[];
  today: string;
  timelineStart: string;
  riskNames: Record<string, string>;
  actionsByItem: Record<string, RelatedAction[]>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [lanes, setLanes] = useState<CalendarLane[]>(LANES);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setView((v) => v ?? (window.matchMedia("(min-width: 768px)").matches ? "timeline" : "agenda"));
  }, []);

  const shown = items.filter((i) => lanes.includes(i.lane));
  const next = shown.find((i) => i.kind === "key" && i.start >= today) ?? shown.find((i) => i.kind !== "period" && i.start >= today);
  const ongoing = shown.filter((i) => i.kind === "period" && i.start < today && (i.end ?? i.start) >= today);
  const future = shown.filter((i) => i.start >= today && i.id !== next?.id);
  const months = future.reduce<{ key: string; label: string; items: CalendarItem[] }[]>((acc, item) => {
    const key = item.start.slice(0, 7);
    const group = acc.find((g) => g.key === key);
    if (group) group.items.push(item);
    else acc.push({ key, label: MONTH.format(new Date(item.start)), items: [item] });
    return acc;
  }, []);
  const selected = shown.find((i) => i.id === selectedId) ?? null;
  const toggleLane = (lane: CalendarLane) =>
    setLanes((cur) => (cur.includes(lane) ? (cur.length === 1 ? cur : cur.filter((l) => l !== lane)) : LANES.filter((l) => cur.includes(l) || l === lane)));

  const viewButton = (v: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={cn(
        "inline-flex h-9 items-center rounded-md border px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
        view === v ? "border-line-strong bg-white text-ink" : "border-transparent text-sub hover:text-ink"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="View" className="inline-flex rounded-lg bg-hover p-1">
          {viewButton("agenda", "Agenda")}
          {viewButton("timeline", "Timeline")}
        </div>
        <div role="group" aria-labelledby="lanes-label" className="flex flex-wrap items-center gap-1.5">
          <span id="lanes-label" className="mr-1 text-[13px] text-sub">
            Show lanes
          </span>
          {LANES.map((lane) => {
            const on = lanes.includes(lane);
            return (
              <button
                key={lane}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLane(lane)}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                  on ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-sub hover:text-ink"
                )}
              >
                {lane}
              </button>
            );
          })}
        </div>
      </div>
      <p className="-mt-2 text-[12.5px] text-sub" aria-live="polite">
        {lanes.length === LANES.length ? "Showing all lanes." : `Showing ${lanes.join(", ").toLowerCase()}.`} Confirmed dates, expected dates and market
        events are labelled in words as well as with different markers.
      </p>

      <section aria-label="Agenda" className={cn("flex flex-col gap-5", view === null ? "md:hidden" : view === "agenda" ? "" : "hidden")}>
        {next ? (
          <div className="rounded-card border border-brand-border bg-brand-surface p-3 sm:p-4">
            <h2 className="px-2 text-[12px] font-medium text-brand-label">Next decision</h2>
            <ul>
              <AgendaItem item={next} riskNames={riskNames} actions={actionsByItem[next.id] ?? []} defaultOpen />
            </ul>
          </div>
        ) : null}
        {ongoing.length ? (
          <div className="rounded-card border border-line bg-white p-3 sm:p-4">
            <h2 className="px-2 text-[13px] font-semibold">Under way now</h2>
            <ul className="divide-y divide-line">
              {ongoing.map((i) => (
                <AgendaItem key={i.id} item={i} riskNames={riskNames} actions={actionsByItem[i.id] ?? []} />
              ))}
            </ul>
          </div>
        ) : null}
        {months.map((m) => (
          <div key={m.key} className="rounded-card border border-line bg-white p-3 sm:p-4">
            <h2 className="px-2 text-[13px] font-semibold">{m.label}</h2>
            <ul className="divide-y divide-line">
              {m.items.map((i) => (
                <AgendaItem key={i.id} item={i} riskNames={riskNames} actions={actionsByItem[i.id] ?? []} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Timeline" className={cn("flex-col gap-4", view === null ? "hidden md:flex" : view === "timeline" ? "flex" : "hidden")}>
        <div className="rounded-card border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-6">
            <h2 className="text-[15px] font-semibold tracking-tight">12-month timeline</h2>
            <span className="text-[12.5px] text-sub">
              Today {longDate(today)} · <span className="lg:hidden">scroll sideways · </span>select an item for details
            </span>
          </div>
          <div className="px-4 pb-6 pt-4 sm:px-6">
            <Timeline items={shown} start={timelineStart} today={today} selectedId={selectedId} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} />
            <div className="mt-5">
              <TimelineLegend />
            </div>
          </div>
        </div>
        <div aria-live="polite" className="rounded-card border border-line bg-white px-4 py-4 sm:px-6">
          {selected ? (
            <>
              <h3 className="mb-2 text-[15px] font-semibold tracking-tight">{selected.label}</h3>
              <EventDetails item={selected} riskNames={riskNames} actions={actionsByItem[selected.id] ?? []} />
            </>
          ) : (
            <p className="text-[13px] text-sub">Select any period or date on the timeline to see why it matters and what it relates to.</p>
          )}
        </div>
      </section>
    </div>
  );
}
