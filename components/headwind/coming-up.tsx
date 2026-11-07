import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { shortDate } from "@/lib/format";
import type { CalendarItem } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";

export function ComingUp({ items }: { items: CalendarItem[] }) {
  return (
    <Card label="Coming up">
      <CardHeader
        title="Coming up"
        action={
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Calendar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />
      <CardBody>
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline gap-4 py-3 first:pt-0 last:pb-0">
              <span
                className={`w-14 shrink-0 font-mono text-[12px] font-medium uppercase tabular ${item.kind === "key" ? "text-brand" : "text-ink"}`}
              >
                {shortDate(item.start)}
              </span>
              <span className="text-[13.5px]">
                {item.label}
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-sub"> · {item.lane}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
