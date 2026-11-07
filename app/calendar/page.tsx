import { MessageCircle } from "lucide-react";
import { Card, CardBody, CardHeader, SectionLabel, SourceTag } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { Timeline, TimelineLegend } from "@/components/headwind/timeline";
import { getAssessmentMeta, getCalendar, getReminders } from "@/lib/data";
import { longDate } from "@/lib/format";

export default async function CalendarPage() {
  const [meta, items, reminders] = await Promise.all([getAssessmentMeta(), getCalendar(), getReminders()]);
  const key = items.find((i) => i.kind === "key");
  return (
    <PageShell>
      <PageHeader
        label={`Calendar · Nov 2026 – Oct 2027 · Demo data`}
        title="The year ahead"
        subtitle={
          key
            ? `Selling windows, input purchases, finance and scheme deadlines in one view. Next key decision: ${longDate(key.start)}, ${key.label.toLowerCase()}.`
            : "Selling windows, input purchases, finance and scheme deadlines in one view."
        }
      />
      <Card label="Timeline">
        <CardHeader title="12-month timeline" action={<span className="font-mono text-[12px] text-sub">Today {longDate(meta.date)}</span>} />
        <CardBody className="px-4 pb-6 pt-4 sm:px-6">
          <Timeline items={items} start="2026-11-01" today={meta.date} />
          <div className="mt-5">
            <TimelineLegend />
          </div>
        </CardBody>
      </Card>

      <section aria-labelledby="reminders-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="reminders-heading" className="text-[18px] font-semibold tracking-tight">
            Scheduled iMessage reminders
          </h2>
          <SectionLabel>{reminders.length} scheduled</SectionLabel>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 min-[1200px]:grid-cols-4">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink">
                  <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
                  {r.sendAt}
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
