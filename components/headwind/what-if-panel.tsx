"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { gbpK, gbpPerT, num, signed } from "@/lib/format";
import { whatIf } from "@/lib/sim";
import type { WhatIfInputs, WhatIfPreset, WhatIfSlider } from "@/lib/types";
import { cn } from "@/lib/utils";
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

function validate(slider: WhatIfSlider, raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim().replace(/^£/, "").replace(/,/g, "");
  if (trimmed === "") return { error: "Enter a number." };
  const v = Number(trimmed);
  if (!Number.isFinite(v)) return { error: "Enter a number, for example " + num(slider.min) + "." };
  if (v < slider.min || v > slider.max) {
    return { error: `Enter a value from ${formatValue(slider.key, slider.min)} to ${formatValue(slider.key, slider.max)}.` };
  }
  return { value: v };
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
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const shown = formatValue(slider.key, value);

  useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)));
    setError(null);
  }, [value]);

  const commit = () => {
    const r = validate(slider, draft);
    setError(r.error ?? null);
    if (r.value !== undefined) {
      onChange(r.value);
      setDraft(String(r.value));
    }
  };

  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <label id={labelId} htmlFor={inputId} className="text-[14px] font-medium">
            {slider.label}
          </label>
          <p id={hintId} className="text-[12px] text-sub">
            {formatValue(slider.key, slider.min)} to {formatValue(slider.key, slider.max)} · today {formatValue(slider.key, baseline)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            onChange={(e) => {
              setDraft(e.target.value);
              const r = validate(slider, e.target.value);
              if (r.value !== undefined) {
                setError(null);
                onChange(r.value);
              }
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            className={cn(
              "h-10 w-[5.5rem] rounded-lg border bg-white px-2.5 text-right font-mono text-[14px] tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11",
              error ? "border-bad" : "border-line-strong"
            )}
          />
          <span className="w-8 text-[12.5px] text-sub">{slider.unit}</span>
        </div>
      </div>
      <Slider
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={[Math.min(Math.max(value, slider.min), slider.max)]}
        onValueChange={([v]) => onChange(v)}
        thumbLabelledBy={labelId}
        valueText={shown}
        className="coarse:py-3"
      />
      <div aria-live="polite">
        {error ? (
          <p id={errorId} className="text-[12.5px] font-medium text-bad">
            {error} The scenario still uses {shown}.
          </p>
        ) : null}
      </div>
      <p className="text-[12px] text-sub">Source: {slider.source}</p>
    </div>
  );
}

const same = (a: WhatIfInputs, b: WhatIfInputs) =>
  a.wheatPrice === b.wheatPrice && a.fertiliserPrice === b.fertiliserPrice && a.yieldPct === b.yieldPct && a.rateChange === b.rateChange;

const tone = (v: number) => (Math.round(v) === 0 ? "text-sub" : v > 0 ? "text-good" : "text-bad");

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
  const [presetId, setPresetId] = useState<string | null>(null);
  const [stripVisible, setStripVisible] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const base = whatIf(baseline);
  const result = whatIf(inputs);
  const isBaseline = same(inputs, baseline);
  const preset = presets.find((p) => p.id === presetId);
  const scenarioName = isBaseline ? "Today's baseline" : preset ? preset.label : "Your custom scenario";

  useEffect(() => {
    const el = resultRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStripVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingBottom = stripVisible ? "5rem" : "";
    return () => {
      root.style.scrollPaddingBottom = "";
    };
  }, [stripVisible]);

  const setManual = (key: keyof WhatIfInputs, v: number) => {
    setInputs((prev) => ({ ...prev, [key]: v }));
    setPresetId(null);
  };

  return (
    <div className="flex flex-col gap-6 pb-16 sm:gap-8">
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr]">
          <section ref={resultRef} aria-labelledby="result-heading" className="min-w-0 rounded-card border border-brand-border bg-brand-surface lg:col-start-2 lg:row-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-brand-border px-4 py-3.5 sm:px-6">
              <h2 id="result-heading" className="text-[13px] font-semibold text-brand-label">
                Farm profit · {harvestYear} harvest year
              </h2>
              <p className="text-[12.5px] font-medium text-brand-label">{scenarioName}</p>
            </div>
            <div className="px-4 py-4 sm:px-6" aria-live="polite">
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-[12px] text-sub">Baseline</dt>
                  <dd className="font-mono text-[20px] font-semibold tabular sm:text-[24px]">{gbpK(base.profitK)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-sub">Scenario</dt>
                  <dd className={cn("font-mono text-[20px] font-semibold tabular sm:text-[24px]", result.profitK < 0 && "text-bad")}>{gbpK(result.profitK)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-sub">Difference</dt>
                  <dd className={cn("font-mono text-[20px] font-semibold tabular sm:text-[24px]", tone(result.deltaK))}>{gbpK(result.deltaK, { sign: true })}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-brand-border pt-3 text-[13px]">
                The farm makes a loss if wheat is below <span className="font-mono font-semibold">{gbpPerT(result.lossPrice)}</span>
                {Math.round(result.lossPrice) !== Math.round(base.lossPrice) ? <span className="text-sub"> (baseline {gbpPerT(base.lossPrice)})</span> : null}.
              </p>
            </div>
          </section>

        <div className="flex min-w-0 flex-col gap-6 sm:gap-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="presets-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="presets-heading" className="text-[15px] font-semibold tracking-tight">
                Start from a preset
              </h2>
              <Button variant="secondary" onClick={() => {
                  setInputs(baseline);
                  setPresetId(null);
                }} disabled={isBaseline}>
                <RotateCcw aria-hidden />
                Reset to today
              </Button>
            </div>
            <div role="group" aria-label="Scenario presets" className="grid grid-cols-2 gap-2">
              {presets.map((p) => {
                const pressed = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => {
                      setInputs(p.inputs);
                      setPresetId(p.id);
                    }}
                    className={cn(
                      "flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pressed ? "border-ink bg-hover" : "border-line-strong bg-white hover:bg-hover"
                    )}
                  >
                    <span className="text-[13.5px] font-medium">{p.label}</span>
                    <span className="text-[12px] text-sub">{p.changes}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12.5px] leading-relaxed text-sub">
              Each preset starts from today&apos;s baseline and changes one input. Choosing another preset replaces it; presets don&apos;t combine.
              Editing any input afterwards turns it into your custom scenario.
            </p>
          </section>

          <Card label="Assumptions">
            <CardHeader title="Assumptions" description="Drag a slider or type a value." />
            <CardBody className="divide-y divide-line">
              {sliders.map((s) => (
                <SliderField key={s.key} slider={s} value={inputs[s.key]} baseline={baseline[s.key]} onChange={(v) => setManual(s.key, v)} />
              ))}
            </CardBody>
          </Card>
          <p className="text-[12.5px] text-sub">
            Scenarios aren&apos;t saved. Leaving this page discards your changes, and you&apos;ll come back to today&apos;s baseline. A scenario never
            changes your farm data or approves any proposed update.
          </p>
        </div>

        <Card label="What moved your profit" className="lg:col-start-2 lg:row-start-2 lg:self-start">
          <CardHeader title="What moved your profit" description="Change from the baseline, by driver. Scale ±£150k." />
          <CardBody>
            <ImpactBars items={result.impacts} />
          </CardBody>
        </Card>
      </div>

      <div
        aria-hidden={!stripVisible}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 lg:left-60 border-t border-brand-border bg-brand-surface px-4 py-2.5 transition-transform sm:px-6 lg:px-10",
          stripVisible ? "translate-y-0" : "pointer-events-none translate-y-full"
        )}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate font-medium text-brand-label">{scenarioName}</span>
          <span className="shrink-0 font-mono tabular">
            <span className={cn("font-semibold", result.profitK < 0 && "text-bad")}>{gbpK(result.profitK)}</span>{" "}
            <span className={tone(result.deltaK)}>{gbpK(result.deltaK, { sign: true })}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
