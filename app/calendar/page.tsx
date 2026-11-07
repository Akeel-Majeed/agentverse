import { MessageCircle } from "lucide-react";
import { Card, CardBody, CardHeader, Disclosure, SourceTag } from "@/components/headwind/card";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { Timeline, TimelineLegend } from "@/components/headwind/timeline";
import { getAssessmentMeta, getCalendar, getReminders } from "@/lib/data";
import { longDate, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function CalendarPage() {
  const [meta, items, reminders] = await Promise.all([getAssessmentMeta(), getCalendar(), getReminders()]);
  const key = items.find((i) => i.kind === "key");
  const nextUp = items
    .filter((i) => i.start >= meta.date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 6);
  return (
    <PageShell>
      <PageHeader
        title="The year ahead"
        subtitle={
          key
            ? `Selling windows, input purchases, finance and scheme deadlines in one view. Next key decision: ${longDate(key.start)}, ${key.label.toLowerCase()}.`
            : "Selling windows, input purchases, finance and scheme deadlines in one view."
        }
        meta="November 2026 to October 2027"
      />

      <Card label="Next up">
        <CardHeader title="Next up" description={`From today, ${longDate(meta.date)}.`} />
        <CardBody className="py-2">
          <ol className="divide-y divide-line">
            {nextUp.map((i) => {
              const isKey = i.kind === "key";
              return (
                <li key={i.id} className="flex items-baseline gap-4 py-2.5 text-[13.5px]">
                  <span className={cn("w-14 shrink-0 text-[12.5px] tabular", isKey ? "font-semibold text-brand" : "text-sub")}>
                    {shortDate(i.start)}
                  </span>
                  <span className={cn("min-w-0 flex-1", isKey && "font-semibold text-brand")}>
                    {i.label}
                    {i.kind === "period" && i.end ? <span className="text-sub"> starts, to {shortDate(i.end)}</span> : null}
                    {isKey ? <span className="sr-only"> (next key decision)</span> : null}
                  </span>
                  <SourceTag>{i.lane}</SourceTag>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <Card label="Timeline">
        <CardHeader title="12-month timeline" action={<TimelineLegend />} />
        <CardBody className="px-4 pb-5 pt-4 sm:px-5">
          <Timeline items={items} start="2026-11-01" today={meta.date} />
        </CardBody>
      </Card>

      <Card label="Scheduled iMessage reminders">
        <Disclosure
          title={
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand" aria-hidden />
              Scheduled iMessage reminders
            </span>
          }
          description={`${reminders.length} scheduled, sent at 07:00 on the day.`}
        >
          <CardBody className="py-2">
            <ul className="divide-y divide-line">
              {reminders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-[13.5px]">
                  <span className="w-28 shrink-0 text-[12.5px] text-sub tabular">{r.sendAt}</span>
                  <p className="min-w-0 flex-1 leading-relaxed">{r.message}</p>
                  <SourceTag>{r.relatesTo}</SourceTag>
                </li>
              ))}
            </ul>
          </CardBody>
        </Disclosure>
      </Card>
    </PageShell>
  );
}
