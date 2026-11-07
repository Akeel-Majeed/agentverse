import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { CalendarView, type RelatedAction } from "@/components/headwind/calendar-view";
import { SourceTag } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { getAssessmentMeta, getCalendar, getReminders, getRisks } from "@/lib/data";
import { longDate } from "@/lib/format";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [meta, items, reminders, risks] = await Promise.all([getAssessmentMeta(), getCalendar(), getReminders(), getRisks()]);
  const key = items.find((i) => i.kind === "key" && i.start >= meta.date);
  const riskNames = Object.fromEntries(risks.map((r) => [r.id, r.name]));
  const actionsByItem: Record<string, RelatedAction[]> = {};
  for (const r of risks) {
    for (const m of r.mitigations) {
      if (m.deadlineId) (actionsByItem[m.deadlineId] ??= []).push({ riskId: r.id, title: m.title });
    }
  }

  return (
    <PageShell className="gap-6 sm:gap-8">
      <PageHeader
        title="Calendar: the year ahead"
        subtitle={
          key
            ? `Selling windows, input purchases, finance and scheme deadlines for Nov 2026 to Oct 2027. Next key decision: ${longDate(key.start)}, ${key.label.toLowerCase()}.`
            : "Selling windows, input purchases, finance and scheme deadlines for Nov 2026 to Oct 2027."
        }
      />
      <CalendarView items={items} today={meta.date} timelineStart="2026-11-01" riskNames={riskNames} actionsByItem={actionsByItem} />

      <section aria-labelledby="reminders-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="reminders-heading" className="text-[18px] font-semibold tracking-tight">
            Example reminders
          </h2>
          <p className="mt-1 max-w-3xl text-[13.5px] text-sub">
            Examples of the iMessage reminders Headwind could send before these dates. In this demo nothing is scheduled or sent, and there is no
            delivery status to show.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 min-[1200px]:grid-cols-4">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
                  Example for {r.sendAt}
                </span>
                <SourceTag>{r.relatesTo}</SourceTag>
              </div>
              <p className="rounded-2xl rounded-bl-md bg-brand px-4 py-3 text-[13.5px] leading-relaxed text-white">{r.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
