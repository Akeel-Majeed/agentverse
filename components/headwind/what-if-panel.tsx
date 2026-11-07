"use client";

import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { gbpK, gbpPerT, signed } from "@/lib/format";
import { whatIf } from "@/lib/sim";
import type { WhatIfInputs, WhatIfPreset, WhatIfSlider } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";
import { ImpactBars } from "./impact-bars";

function formatValue(key: keyof WhatIfInputs, v: number): string {
  switch (key) {
    case "wheatPrice":
    case "fertiliserPrice":
      return gbpPerT(v);
    case "yieldPct":
      return `${v}%`;
    case "rateChange":
      return v === 0 ? "0 pts" : `${signed(v, 2)} pts`;
  }
}

function SliderField({
  slider,
  value,
  baseline,
  onChange,
}: {
  slider: WhatIfSlider;
  value: number;
  baseline: number;
  onChange: (v: number) => void;
}) {
  const labelId = useId();
  const shown = formatValue(slider.key, value);
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span id={labelId} className="text-[14px] font-medium">
          {slider.label}
        </span>
        <span className="font-mono text-[15px] font-semibold tabular">
          {shown}
          {value !== baseline ? (
            <span className="ml-2 text-[12px] font-normal text-sub">today {formatValue(slider.key, baseline)}</span>
          ) : null}
        </span>
      </div>
      <Slider
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        thumbLabelledBy={labelId}
        valueText={shown}
      />
      <div className="flex justify-between font-mono text-[11px] text-sub">
        <span>{formatValue(slider.key, slider.min)}</span>
        <span>{formatValue(slider.key, slider.max)}</span>
      </div>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-sub">{slider.source}</p>
    </div>
  );
}

const same = (a: WhatIfInputs, b: WhatIfInputs) =>
  a.wheatPrice === b.wheatPrice && a.fertiliserPrice === b.fertiliserPrice && a.yieldPct === b.yieldPct && a.rateChange === b.rateChange;

export function WhatIfPanel({
  baseline,
  presets,
  sliders,
  harvestYear,
}: {
  baseline: WhatIfInputs;
  presets: WhatIfPreset[];
  sliders: WhatIfSlider[];
  harvestYear: number;
}) {
  const [inputs, setInputs] = useState<WhatIfInputs>(baseline);
  const result = whatIf(inputs);
  const deltaRounded = Math.round(result.deltaK);

  return (
    <div className="flex flex-col gap-8">
      <div role="group" aria-label="Scenario presets" className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button key={p.id} variant="secondary" aria-pressed={same(inputs, p.inputs)} onClick={() => setInputs(p.inputs)} className="aria-pressed:border-ink aria-pressed:bg-hover">
            {p.label}
          </Button>
        ))}
        <Button onClick={() => setInputs(baseline)}>
          <RotateCcw aria-hidden />
          Reset to today
        </Button>
      </div>

      <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card label="Assumptions">
          <CardHeader title="Assumptions" description="Drag to change one thing at a time, or start from a preset." />
          <CardBody className="divide-y divide-line">
            {sliders.map((s) => (
              <SliderField
                key={s.key}
                slider={s}
                value={inputs[s.key]}
                baseline={baseline[s.key]}
                onChange={(v) => setInputs((prev) => ({ ...prev, [s.key]: v }))}
              />
            ))}
          </CardBody>
        </Card>

        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="What-if result" className="rounded-card border border-brand-border bg-brand-surface">
            <div className="border-b border-brand-border px-6 py-4">
              <h2 className="font-mono text-label font-medium uppercase text-brand-label">
                Farm profit · {harvestYear} harvest year
              </h2>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className={`font-mono text-[46px] font-semibold leading-none tracking-tight tabular ${result.profitK < 0 ? "text-bad" : "text-ink"}`}>
                  {gbpK(result.profitK)}
                </p>
                <p
                  className={`font-mono text-[14px] font-medium tabular ${deltaRounded === 0 ? "text-sub" : deltaRounded > 0 ? "text-good" : "text-bad"}`}
                >
                  {gbpK(result.deltaK, { sign: true })} vs today
                </p>
              </div>
              <p className="border-t border-brand-border pt-4 font-mono text-label font-medium uppercase text-brand-label">
                Loss if wheat below {gbpPerT(result.lossPrice)}
              </p>
            </div>
          </section>

          <Card label="What moved your profit">
            <CardHeader title="What moved your profit" description="Change from today, by driver. Scale ±£150k." />
            <CardBody>
              <ImpactBars items={result.impacts} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
