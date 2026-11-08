"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { gbpK } from "@/lib/format";

const config = {
  after: { label: "With options", color: "#121611" },
  before: { label: "Today", color: "#8E9386" },
} satisfies ChartConfig;

/** 20 simulated years of farm profit (£k), worst to best: "with options" over a "today" ghost series. */
export function SimulationBars({ bars, ghost, height = 260 }: { bars: number[]; ghost: number[]; height?: number }) {
  const data = bars.map((after, i) => ({ year: i + 1, after, before: ghost[i] }));
  const all = [...bars, ...ghost, 0];
  const lo = Math.floor(Math.min(...all) / 25) * 25;
  const hi = Math.ceil(Math.max(...all) / 25) * 25;
  const losses = bars.filter((b) => b < 0).length;
  const ghostLosses = ghost.filter((b) => b < 0).length;

  return (
    <figure
      role="img"
      aria-label={`20 simulated years of farm profit. ${losses} loss-making years (today ${ghostLosses}). Worst ${gbpK(bars[0])}, best ${gbpK(bars[bars.length - 1])}.`}
    >
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
          <defs>
            <linearGradient id="fillAfter" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-after)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-after)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="fillBefore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-before)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-before)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E6E5DA" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={(v: number) => `Year ${v}`}
          />
          <YAxis hide domain={[lo, hi]} />
          <ReferenceLine y={0} stroke="#121611" strokeWidth={1} strokeDasharray="3 3" />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_, payload) => `Year ${payload[0]?.payload?.year} of 20`}
                valueFormatter={(v) => gbpK(Number(v))}
              />
            }
          />
          <Area
            dataKey="before"
            type="natural"
            fill="url(#fillBefore)"
            stroke="var(--color-before)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="after"
            type="natural"
            fill="url(#fillAfter)"
            stroke="var(--color-after)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </figure>
  );
}
