"use client";

import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { gbpK } from "@/lib/format";

const SCALE_K = 150;
const ROW_H = 36;
const GOOD = "#556F06";
const BAD = "#C8361C";

const config = { valueK: { label: "Change" } } satisfies ChartConfig;

/** Diverging bars around a centre line: gains to the right in green, losses to the left in red. */
export function ImpactBars({ items }: { items: { id: string; label: string; valueK: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: items.length * ROW_H + 8 }}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
        <XAxis type="number" domain={[-SCALE_K, SCALE_K]} allowDataOverflow hide />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 13, fill: "#121611" }}
        />
        <ReferenceLine x={0} stroke="#121611" strokeWidth={1} strokeDasharray="3 3" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(label) => label}
              valueFormatter={(v) => gbpK(Number(v), { sign: true })}
            />
          }
        />
        <Bar dataKey="valueK" barSize={12} radius={4} isAnimationActive={false}>
          {items.map((item) => (
            <Cell key={item.id} fill={item.valueK >= 0 ? GOOD : BAD} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
