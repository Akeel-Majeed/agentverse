import { gbpPerT } from "@/lib/format";
import type { BreakEven } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";

export function BreakEvenList({ items }: { items: BreakEven[] }) {
  return (
    <Card label="Price vs break-even">
      <CardHeader title="Price vs break-even" description="Today's price against what each crop needs to cover its costs." />
      <CardBody>
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const diff = item.price - item.breakEven;
            return (
              <li key={item.crop} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-[14px] font-medium">{item.crop}</p>
                  <p className="mt-0.5 text-[12px] text-sub">
                    {gbpPerT(item.price)} vs {gbpPerT(item.breakEven)} break-even
                  </p>
                </div>
                <span className={` text-[14px] font-semibold tabular ${diff < 0 ? "text-bad" : "text-good"}`}>
                  {gbpPerT(diff, { sign: true })}
                  <span className="sr-only">{diff < 0 ? " below break-even" : " above break-even"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
