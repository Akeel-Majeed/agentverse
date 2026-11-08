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
  // Round £k steps that include £0, at most about five ticks.
  const span = Math.max(...all) - Math.min(...all);
  const step = [25, 50, 100, 150, 200, 250, 500, 1000].find((s) => span / s <= 5) ?? 2000;
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const losses = bars.filter((b) => b < 0).length;
  const ghostLosses = ghost.filter((b) => b < 0).length;

  return (
    <figure
      role="img"
      aria-label={`20 simulated years of farm profit. ${losses} loss-making years (today ${ghostLosses}). Worst ${gbpK(bars[0])}, best ${gbpK(bars[bars.length - 1])}.`}
    >
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
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
            ticks={[1, 10, 20]}
            interval={0}
            tickFormatter={(v: number) => (v === 1 ? "Worst year" : v === 20 ? "Best year" : "Middle")}
          />
          <YAxis
            domain={[lo, hi]}
            width={52}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => gbpK(v)}
            tick={{ fontSize: 11.5, fill: "#565C50" }}
          />
          <ReferenceLine
            y={0}
            stroke="#121611"
            strokeWidth={1}
            strokeDasharray="3 3"
            label={{ value: "£0: break-even", position: "insideTopLeft", fontSize: 11.5, fill: "#565C50" }}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_, payload) => `Simulated year ${payload[0]?.payload?.year} of 20, sorted worst to best`}
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
