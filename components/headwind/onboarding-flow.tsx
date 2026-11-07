"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, CornerDownLeft, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finishOnboarding, saveSection, updateRiskProfile } from "@/lib/data";
import { gbp } from "@/lib/format";
import { FIELDS, RISKS } from "@/lib/profile/catalogue";
import { computeExposures } from "@/lib/profile/risk-profile";
import { parseValue } from "@/lib/profile/values";
import type { IMessageSetup, MarketBaseline, OnboardingField, OnboardingSection, ProfileValue, RiskId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

type Step = { kind: "welcome" } | { kind: "section"; section: OnboardingSection } | { kind: "review" } | { kind: "imessage" };

const pad = (n: number) => String(n).padStart(2, "0");
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const mono = "font-mono text-[11px] uppercase tracking-[0.08em]";

/** Unit shown inside the input; values are typed as plain numbers or with their unit. */
function unitOf(f: OnboardingField): string | null {
  if (f.type === "money" || f.type === "date" || f.type === "text") return null;
  return f.unit ?? null;
}

/** Number and money fields are edited as plain numbers, with the unit shown beside the input. */
function toInput(f: OnboardingField): string {
  if ((f.type !== "number" && f.type !== "money") || !f.value) return f.value;
  const p = parseValue({ type: f.type, unit: f.unit, label: f.label }, f.value);
  return p.ok && typeof p.value === "number" ? p.value.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : f.value;
}

const inputValues = (fields: OnboardingField[]) => Object.fromEntries(fields.map((f) => [f.id, toInput(f)]));

function parsedValues(values: Record<string, string>, fallback: Record<string, ProfileValue>): Record<string, ProfileValue> {
  return Object.fromEntries(
    FIELDS.map((def) => {
      const p = parseValue(def, values[def.key] ?? "");
      return [def.key, p.ok ? p.value : fallback[def.key] ?? null];
    })
  );
}

function FieldRow({ field, value, error, onChange }: { field: OnboardingField; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `ob-${field.id}`;
  const unit = unitOf(field);
  return (
    <div className="grid gap-x-6 gap-y-1.5 border-b border-line py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 text-[14px] font-medium text-ink">
          {field.label}
          {field.confidence === "check" ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-normal text-[#B45309]">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
              please check
            </span>
          ) : null}
        </label>
        <p className="mt-0.5 text-[12px] text-sub">
          {field.help ? `${field.help} ` : ""}
          <span className="font-mono text-[11px]">src: {field.source}</span>
        </p>
      </div>
      <div className="min-w-0">
        <div
          className={cn(
            "flex h-10 items-center rounded-md border bg-white transition-colors focus-within:border-ink",
            error ? "border-bad" : "border-line-strong"
          )}
        >
          {field.type === "money" ? <span className="pl-3 font-mono text-[13px] text-sub">£</span> : null}
          <input
            id={id}
            value={value}
            placeholder="not recorded"
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13.5px] tabular text-ink outline-none placeholder:text-sub/60"
          />
          {unit ? <span className="pr-3 font-mono text-[11px] text-sub">{unit}</span> : null}
        </div>
        {error ? (
          <p id={`${id}-err`} className="mt-1 text-[12px] font-medium text-bad">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Live view of what each risk has at stake, recomputed in code from the values on screen. */
function LivePanel({ exposures, highlight }: { exposures: ReturnType<typeof computeExposures>; highlight: RiskId[] }) {
  return (
    <aside aria-label="Live risk profile" className="rounded-xl border border-line bg-white p-5">
      <p className={cn(mono, "text-sub")}>Live · at stake</p>
      <ul className="mt-4 flex flex-col gap-3.5">
        {RISKS.map((r) => {
          const e = exposures.find((x) => x.riskId === r.id);
          const on = highlight.includes(r.id);
          return (
            <li key={r.id} className={cn("transition-opacity", highlight.length && !on ? "opacity-40" : "opacity-100")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-brand" : "bg-line-strong")} />
                  {r.name}
                </span>
                <span className="font-mono text-[13px] tabular text-ink">{e ? gbp(e.total) : "—"}</span>
              </div>
              {on && e ? <p className="mt-1 pl-3.5 text-[11.5px] leading-snug text-sub">{e.summary}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-5 border-t border-line pt-3 text-[11.5px] leading-relaxed text-sub">
        Worked out in code from your answers at the snapshot&apos;s market prices. No model is involved in these figures.
      </p>
    </aside>
  );
}

export function OnboardingFlow({
  farmName,
  sections: initialSections,
  market,
  imessage,
}: {
  farmName: string;
  sections: OnboardingSection[];
  market: MarketBaseline;
  imessage: IMessageSetup;
}) {
  const router = useRouter();
  const steps: Step[] = useMemo(
    () => [{ kind: "welcome" }, ...initialSections.map((section) => ({ kind: "section" as const, section })), { kind: "review" }, { kind: "imessage" }],
    [initialSections]
  );
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [values, setValues] = useState<Record<string, string>>(() => inputValues(initialSections.flatMap((s) => s.fields)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const initialParsed = useMemo(() => parsedValues(values, {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  const exposures = useMemo(() => computeExposures(parsedValues(values, initialParsed), market), [values, initialParsed, market]);

  const step = steps[index];
  const total = steps.length;
  const highlight: RiskId[] =
    step.kind === "section" ? Array.from(new Set(step.section.fields.flatMap((f) => (f.risks ?? []).map((r) => r.id)))) : [];

  useEffect(() => {
    headingRef.current?.focus();
    setMessage("");
  }, [index]);

  const go = (next: number) => {
    setErrors({});
    setIndex(Math.max(0, Math.min(total - 1, next)));
    window.scrollTo({ top: 0 });
  };
  const complete = (i: number) => setDone((d) => new Set(d).add(i));

  const finish = async () => {
    setBusy(true);
    await finishOnboarding();
    router.push("/overview");
    router.refresh();
  };

  const next = async () => {
    if (busy) return;
    if (step.kind === "welcome") {
      complete(index);
      return go(index + 1);
    }
    if (step.kind === "section") {
      setBusy(true);
      try {
        const result = await saveSection(step.section.id, Object.fromEntries(step.section.fields.map((f) => [f.id, values[f.id] ?? ""])));
        if (!result.ok) {
          setErrors(result.errors);
          setMessage("Fix the highlighted values to continue.");
          return;
        }
        setValues((v) => ({ ...v, ...inputValues(result.section.fields) }));
        complete(index);
        go(index + 1);
      } catch {
        setMessage("Couldn't save. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step.kind === "review") {
      setBusy(true);
      try {
        const result = await updateRiskProfile("Setup completed");
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setSnapshot(result.version);
        complete(index);
        go(index + 1);
      } catch {
        setMessage("Couldn't create the risk profile. Try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    complete(index);
    await finish();
  };

  // Enter continues from anywhere on the step (inputs already submit the form themselves).
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "Enter" || e.isComposing || e.metaKey || e.ctrlKey || ["INPUT", "TEXTAREA", "BUTTON", "A", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      void nextRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sectionsDone = steps.filter((s, i) => s.kind === "section" && done.has(i)).length;
  const cta =
    step.kind === "welcome" ? "Start" : step.kind === "section" ? "Confirm and continue" : step.kind === "review" ? "Create risk profile" : "Go to dashboard";

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      {/* Progress */}
      <div className="sticky top-0 z-10 h-[2px] w-full bg-line">
        <div className="h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-2px)] max-w-[1280px] lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_300px]">
        {/* Step rail */}
        <nav aria-label="Setup steps" className="hidden border-r border-line px-5 py-8 lg:flex lg:flex-col">
          <div className="flex items-center gap-2.5 px-2">
            <LogoMark className="h-7 w-7" />
            <span className={cn(mono, "text-sub")}>Setup</span>
          </div>
          <ol className="mt-8 flex flex-col gap-0.5">
            {steps.map((s, i) => {
              const label = s.kind === "welcome" ? "Welcome" : s.kind === "section" ? s.section.title : s.kind === "review" ? "Risk profile" : "iMessage (optional)";
              const reachable = i <= index || done.has(i) || done.has(i - 1);
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!reachable || busy}
                    onClick={() => go(i)}
                    aria-current={i === index ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-default",
                      focus,
                      i === index ? "bg-hover font-medium text-ink" : reachable ? "text-sub hover:text-ink" : "text-sub/50"
                    )}
                  >
                    <span className="w-5 font-mono text-[11px] tabular">{done.has(i) ? <Check className="h-3.5 w-3.5 text-good" aria-label="done" /> : pad(i)}</span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={finish} disabled={busy} className={cn("mt-auto px-2 pt-8 text-left text-[12.5px] text-sub hover:text-ink", focus)}>
            Skip setup, open the app →
          </button>
        </nav>

        {/* Step */}
        <main className="px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
          <form
            className="mx-auto flex max-w-[680px] flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <p className={cn(mono, "text-sub")}>
                {pad(index)} / {pad(total - 1)}
                {step.kind === "section" ? ` · ${step.section.title}` : ""}
              </p>
              <button type="button" onClick={finish} disabled={busy} className={cn("text-[12.5px] text-sub hover:text-ink lg:hidden", focus)}>
                Skip
              </button>
            </div>

            {step.kind === "welcome" ? (
              <>
                <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink outline-none sm:text-[42px]">
                  Let&apos;s build {farmName}&apos;s risk profile.
                </h1>
                <p className="mt-4 max-w-[560px] text-[15.5px] leading-relaxed text-sub">
                  Nine short sections on the farm: land, crops, sales, inputs, schemes, finance and costs. We&apos;ve pre-filled what we found in your
                  documents; you check and confirm. At the end you get a risk profile that every price move, policy change and weather outlook is measured
                  against.
                </p>
                <dl className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
                  {[
                    ["~5 min", "9 sections, about 60 facts. Edit anything."],
                    ["src:", "Every value shows where it came from."],
                    ["£ = code", "Figures are computed, never written by the model."],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white p-4">
                      <dt className="font-mono text-[13px] text-ink">{k}</dt>
                      <dd className="mt-1.5 text-[12.5px] leading-snug text-sub">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 text-[12px] text-sub">Demo farm: all figures are fictional sample data.</p>
              </>
            ) : null}

            {step.kind === "section" ? (
              <>
                <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-[30px] font-semibold tracking-[-0.025em] text-ink outline-none sm:text-[34px]">
                  {step.section.title}
                </h1>
                <p className="mt-3 flex gap-2.5 text-[14px] leading-relaxed text-sub">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {step.section.agentMessage}
                </p>
                <div className="mt-8 rounded-xl border border-line bg-white px-5">
                  {step.section.fields.map((f) => (
                    <FieldRow key={f.id} field={f} value={values[f.id] ?? ""} error={errors[f.id]} onChange={(v) => {
                        setValues((prev) => ({ ...prev, [f.id]: v }));
                        if (errors[f.id]) {
                          setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== f.id)));
                          setMessage("");
                        }
                      }}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-sub">Type numbers plainly or with units: 1,028 t · £40k · 3.1% · 31 Mar 2027. Leave blank if unknown.</p>
              </>
            ) : null}

            {step.kind === "review" ? (
              <>
                <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-[30px] font-semibold tracking-[-0.025em] text-ink outline-none sm:text-[34px]">
                  Your risk profile
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-sub">
                  {sectionsDone} of {initialSections.length} sections confirmed. This is what each risk has at stake from your answers. Creating the profile
                  freezes it as a snapshot: from then on, every piece of news is priced against these figures.
                </p>
                <ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-white">
                  {RISKS.map((r) => {
                    const e = exposures.find((x) => x.riskId === r.id);
                    return (
                      <li key={r.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6">
                        <span className="text-[14px] font-medium text-ink">{r.name}</span>
                        <span className="text-[12.5px] leading-snug text-sub">{e?.summary}</span>
                        <span className="font-mono text-[15px] tabular text-ink">{e ? gbp(e.total) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 font-mono text-[11px] text-sub">at stake = value unsold · inputs unbought · crop revenue · scheme income · variable debt</p>
              </>
            ) : null}

            {step.kind === "imessage" ? (
              <>
                <p className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-good">
                  <Check className="h-4 w-4" aria-hidden /> Risk profile created{snapshot ? ` · snapshot v${snapshot}` : ""}
                </p>
                <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-[30px] font-semibold tracking-[-0.025em] text-ink outline-none sm:text-[34px]">
                  Ask it by text <span className="text-sub">(optional)</span>
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-sub">
                  Text questions like &ldquo;what&apos;s my biggest risk?&rdquo; or &ldquo;what if wheat drops to £160?&rdquo; and get answers with the working,
                  from the same figures as the dashboard. It can read your risk profile but can&apos;t change anything or move money.
                </p>
                {imessage.available ? (
                  <div className="mt-8 rounded-xl border border-line bg-white p-5">
                    <ol className="flex flex-col gap-5">
                      <li className="flex gap-4">
                        <span className="font-mono text-[11px] text-sub">01</span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-ink">iMessage this number</p>
                          <p className="mt-1 font-mono text-[20px] tabular text-ink">{imessage.number}</p>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <span className="font-mono text-[11px] text-sub">02</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium text-ink">Send this message to connect</p>
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
                            <code className="font-mono text-[13.5px] text-ink">{imessage.connectCommand}</code>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard?.writeText(imessage.connectCommand).catch(() => undefined);
                                setCopied(true);
                              }}
                              className={cn("inline-flex items-center gap-1 text-[12px] text-sub hover:text-ink", focus)}
                            >
                              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                              {copied ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <a
                            href={`sms:${imessage.number}&body=${encodeURIComponent(imessage.connectCommand)}`}
                            className={cn("mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-white px-3 text-[13px] font-medium text-ink hover:bg-panel", focus)}
                          >
                            <MessageSquare className="h-4 w-4" aria-hidden /> Open in Messages
                          </a>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <span className="font-mono text-[11px] text-sub">03</span>
                        <p className="text-[14px] text-ink">Ask anything about your risks, options, news or deadlines.</p>
                      </li>
                    </ol>
                    {!imessage.replies ? (
                      <p className="mt-5 border-t border-line pt-3 text-[12px] text-[#B45309]">
                        Replies aren&apos;t switched on for this deployment yet (webhook secret or Anthropic key missing), so the assistant won&apos;t answer until
                        they are.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-8 rounded-xl border border-dashed border-line-strong p-5 text-[13.5px] text-sub">
                    {imessage.reason} You can connect it later; nothing else depends on it.
                  </p>
                )}
              </>
            ) : null}

            {/* Footer */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
              <div className="flex items-center gap-3">
                {index > 0 && step.kind !== "imessage" ? (
                  <Button type="button" variant="ghost" onClick={() => go(index - 1)} disabled={busy}>
                    <ArrowLeft aria-hidden /> Back
                  </Button>
                ) : null}
                {step.kind === "imessage" ? (
                  <Button type="button" variant="ghost" onClick={finish} disabled={busy}>
                    Skip for now
                  </Button>
                ) : null}
                <p role="status" className="text-[12.5px] text-bad">
                  {message}
                </p>
              </div>
              <Button type="submit" disabled={busy} className="h-10 px-4">
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {cta}
                {!busy ? (step.kind === "imessage" ? <ArrowRight aria-hidden /> : <CornerDownLeft className="opacity-60" aria-hidden />) : null}
              </Button>
            </div>
          </form>
        </main>

        {/* Live panel */}
        <div className="hidden px-6 py-12 xl:block">
          <div className="sticky top-12">{step.kind === "section" ? <LivePanel exposures={exposures} highlight={highlight} /> : null}</div>
        </div>
      </div>
    </div>
  );
}
