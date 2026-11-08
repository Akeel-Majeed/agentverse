"use client";

import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { gbpK, gbpPerT, signed } from "@/lib/format";
import { whatIf, type WhatIfBase, type WhatIfResult } from "@/lib/sim";
import type { FigureDetail, WhatIfInputs, WhatIfPreset, WhatIfSlider } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";
import { ImpactBars } from "./impact-bars";
import { MoneyFigure } from "./money-figure";

function resultDetail(result: WhatIfResult, harvestYear: number, title = "Farm profit in this scenario", valueK = result.profitK): FigureDetail {
  return {
    title,
    value: gbpK(valueK, { sign: title !== "Farm profit in this scenario" }),
    description: `${harvestYear} harvest year. Worked out from the tonnes, prices and debt in your risk profile snapshot; one scenario, not a forecast.`,
    working: result.working,
    sources: [{ label: "Tonnes, prices and debt", origin: "Risk profile snapshot · your farm profile" }],
  };
}

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
        <span className="text-[15px] font-semibold tabular">
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
      <div className="flex justify-between text-[11px] text-sub">
        <span>{formatValue(slider.key, slider.min)}</span>
        <span>{formatValue(slider.key, slider.max)}</span>
      </div>
      <p className="text-[12px] text-sub">{slider.source}</p>
    </div>
  );
}

const same = (a: WhatIfInputs, b: WhatIfInputs) =>
  a.wheatPrice === b.wheatPrice && a.fertiliserPrice === b.fertiliserPrice && a.yieldPct === b.yieldPct && a.rateChange === b.rateChange;

export function WhatIfPanel({
  base,
  baseline,
  presets,
  sliders,
  harvestYear,
}: {
  base: WhatIfBase;
  baseline: WhatIfInputs;
  presets: WhatIfPreset[];
  sliders: WhatIfSlider[];
  harvestYear: number;
}) {
  const [inputs, setInputs] = useState<WhatIfInputs>(baseline);
  const result = whatIf(inputs, base);
  const deltaRounded = Math.round(result.deltaK);
  const changed = !same(inputs, baseline);
  const deltaTone = deltaRounded === 0 ? "text-sub" : deltaRounded > 0 ? "text-good" : "text-bad";
  const scaleK = Math.max(150, ...result.impacts.map((i) => Math.ceil(Math.abs(i.valueK) / 50) * 50));

  return (
    <div className="flex flex-col gap-8">
      <div role="group" aria-label="Scenario presets" className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button key={p.id} variant="secondary" aria-pressed={same(inputs, p.inputs)} onClick={() => setInputs(p.inputs)} className="aria-pressed:border-ink aria-pressed:bg-hover">
            {p.label}
          </Button>
        ))}
        <Button variant={changed ? "default" : "ghost"} disabled={!changed} onClick={() => setInputs(baseline)}>
          <RotateCcw aria-hidden />
          Reset to today
        </Button>
      </div>

      {/* Phones: keep the result in view while dragging the sliders below it. */}
      <div aria-hidden className="sticky top-[92px] z-20 -my-4 flex lg:top-2 items-baseline justify-between gap-3 rounded-full border border-line bg-card px-5 py-3 shadow-btn min-[1100px]:hidden">
        <span className="text-[13px] text-sub">Farm profit</span>
        <span className="tabular">
          <span className={`text-[18px] font-semibold ${result.profitK < 0 ? "text-bad" : "text-ink"}`}>{gbpK(result.profitK)}</span>
          <span className={`ml-2 text-[13px] font-medium ${deltaTone}`}>{gbpK(result.deltaK, { sign: true })}</span>
        </span>
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
          <Card label="What-if result">
            <CardHeader title="Farm profit" description={`${harvestYear} harvest year`} />
            <CardBody className="flex flex-col gap-4" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <MoneyFigure
                  detail={resultDetail(result, harvestYear)}
                  className={`text-[40px] font-medium leading-none tracking-[-0.03em] tabular ${result.profitK < 0 ? "text-bad" : "text-ink"}`}
                >
                  {gbpK(result.profitK)}
                </MoneyFigure>
                <p className={`text-[14px] font-medium tabular ${deltaTone}`}>
                  <MoneyFigure detail={resultDetail(result, harvestYear, "Change from today", result.deltaK)}>{gbpK(result.deltaK, { sign: true })}</MoneyFigure>{" "}
                  vs today
                </p>
              </div>
              <p className="border-t border-line pt-4 text-[13px] text-sub">
                {result.lossPrice === null ? (
                  "No wheat is exposed to the price in this scenario."
                ) : (
                  <>
                    Loss if wheat falls below <span className="font-medium text-ink tabular">{gbpPerT(Math.max(0, result.lossPrice))}</span>, on{" "}
                    {Math.round(result.wheatExposedT).toLocaleString("en-GB")} t of wheat still exposed to the price (2026 in store and the unsold 2027 crop).
                  </>
                )}
              </p>
            </CardBody>
          </Card>

          <Card label="What moved your profit">
            <CardHeader title="What moved your profit" description={`Change from today, by driver. Scale ±${gbpK(scaleK)}.`} />
            <CardBody>
              <ImpactBars items={result.impacts} scaleK={scaleK} />
              {result.impacts.every((i) => Math.round(i.valueK) === 0) ? (
                <p className="mt-2 text-[12.5px] text-sub">Nothing has changed yet. Move a slider or pick a preset to see the drivers.</p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
