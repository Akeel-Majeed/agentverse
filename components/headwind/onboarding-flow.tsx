"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Loader2, MessageSquare } from "lucide-react";
import { finishOnboarding, saveSection, updateRiskProfile } from "@/lib/data";
import { gbp } from "@/lib/format";
import { FIELDS, RISKS } from "@/lib/profile/catalogue";
import { computeExposures } from "@/lib/profile/risk-profile";
import { parseValue } from "@/lib/profile/values";
import type { IMessageSetup, MarketBaseline, OnboardingField, OnboardingSection, ProfileValue, RiskId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";

type Step = { kind: "welcome" } | { kind: "section"; section: OnboardingSection } | { kind: "review" } | { kind: "imessage" };

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

/** "Output prices (£757k at stake) and Weather and yield (£610k)" */
function feedsSentence(ids: RiskId[], exposures: ReturnType<typeof computeExposures>): string {
  const parts = ids.map((id, i) => {
    const name = RISKS.find((r) => r.id === id)?.name ?? id;
    const total = exposures.find((e) => e.riskId === id)?.total;
    return total === undefined ? name : `${name} (${gbp(total)}${i === 0 ? " at stake" : ""})`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
}

/** "Assumed · No contracts found" → "Assumed: no contracts found." / "Grain store sheet · Upload" → "From grain store sheet (uploaded)." */
function sourceText(source: string): string {
  if (/^assumed/i.test(source)) {
    const why = source.replace(/^assumed\s*·?\s*/i, "");
    return why ? `Assumed: ${why.charAt(0).toLowerCase()}${why.slice(1)}.` : "Assumed.";
  }
  if (/^not recorded$/i.test(source)) return "Not recorded yet.";
  const plain = source
    .replace(/\s*·\s*Upload$/i, " (uploaded)")
    .replace(/\s*·\s*via MCP$/i, " (via your adviser's agent)")
    .replace(/\s*·\s*/g, ", ");
  return `From ${plain}.`;
}

function Field({ field, value, error, onChange }: { field: OnboardingField; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `ob-${field.id}`;
  const unit = field.type === "number" ? field.unit : null;
  return (
    <div className="flex flex-col gap-2 text-left">
      <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[17px] font-medium text-ink">
        {field.label}
        {field.confidence === "check" ? <span className="text-[13px] font-normal text-warn">Please check</span> : null}
      </label>
      <div
        className={cn(
          "flex h-14 items-center rounded-2xl border bg-card px-4 transition-colors focus-within:border-ink focus-within:ring-4 focus-within:ring-lime/40",
          error ? "border-bad" : "border-line-strong"
        )}
      >
        {field.type === "money" ? <span className="mr-1 text-[18px] text-sub">£</span> : null}
        <input
          id={id}
          value={value}
          placeholder="Not known yet"
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          className="h-full min-w-0 flex-1 bg-transparent text-[18px] tabular text-ink outline-none placeholder:text-sub/50"
        />
        {unit ? <span className="ml-2 text-[16px] text-sub">{unit}</span> : null}
      </div>
      <p id={`${id}-hint`} className={cn("text-[14px] leading-snug", error ? "font-medium text-bad" : "text-sub")}>
        {error ?? `${field.help ? `${field.help} ` : ""}${sourceText(field.source)}`}
      </p>
    </div>
  );
}

function PrimaryButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={cn(
        "inline-flex h-14 min-w-[220px] items-center justify-center gap-2 rounded-full bg-ink px-8 text-[17px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60",
        focus
      )}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
      {children}
      {!busy ? <span aria-hidden>→</span> : null}
    </button>
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
  const [values, setValues] = useState<Record<string, string>>(() => inputValues(initialSections.flatMap((s) => s.fields)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const initialParsed = useMemo(() => parsedValues(values, {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  const exposures = useMemo(() => computeExposures(parsedValues(values, initialParsed), market), [values, initialParsed, market]);

  const step = steps[index];
  const total = steps.length - 1;
  const feeds: RiskId[] =
    step.kind === "section" ? Array.from(new Set(step.section.fields.flatMap((f) => (f.risks ?? []).map((r) => r.id)))) : [];

  useEffect(() => {
    headingRef.current?.focus();
    setMessage("");
  }, [index]);

  const go = (i: number) => {
    setErrors({});
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
    document.getElementById("onboarding")?.scrollTo({ top: 0 });
  };

  const finish = async () => {
    setBusy(true);
    await finishOnboarding();
    router.push("/overview");
    router.refresh();
  };

  const next = async () => {
    if (busy) return;
    if (step.kind === "welcome") return go(index + 1);
    if (step.kind === "section") {
      setBusy(true);
      try {
        const result = await saveSection(step.section.id, Object.fromEntries(step.section.fields.map((f) => [f.id, values[f.id] ?? ""])));
        if (!result.ok) {
          setErrors(result.errors);
          setMessage("A value needs fixing before you continue.");
          return;
        }
        setValues((v) => ({ ...v, ...inputValues(result.section.fields) }));
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
        go(index + 1);
      } catch {
        setMessage("Couldn't create the risk profile. Try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
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

  const heading = "mx-auto max-w-[620px] text-balance text-[42px] font-medium leading-[1.05] tracking-[-0.04em] text-ink outline-none sm:text-[56px]";
  const lead = "mx-auto mt-5 max-w-[540px] text-balance text-[18px] leading-relaxed text-sub sm:text-[19px]";

  return (
    <div
      id="onboarding"
      className={cn(
        "fixed inset-0 z-[60] overflow-y-auto font-sans transition-colors duration-700",
        step.kind === "welcome" || step.kind === "imessage" ? "bg-sky" : "bg-paper"
      )}
    >
      <div className="fixed inset-x-0 top-0 z-10 h-[3px] bg-ink/5">
        <div className="h-full bg-lime transition-[width] duration-700 ease-out" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <header className="mx-auto flex max-w-[720px] items-center justify-between px-6 pt-8">
        <Wordmark className="text-[17px]" />
        <span className="text-[14px] text-sub tabular">{index === 0 ? "" : `Step ${index} of ${total}`}</span>
        <button type="button" onClick={finish} disabled={busy} className={cn("text-[14px] text-sub hover:text-ink", focus)}>
          Skip
        </button>
      </header>

      <main>
      <form
        className="mx-auto flex min-h-[calc(100vh-72px)] max-w-[620px] flex-col justify-center px-6 py-16 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step.kind === "welcome" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className={heading}>
              Let&apos;s set up {farmName}.
            </h1>
            <p className={lead}>
              A few questions about the land, crops, sales, inputs, schemes and money. We&apos;ve filled in what we found in your documents, so mostly
              you&apos;ll just check it. It takes about five minutes.
            </p>
            <p className="mx-auto mt-6 max-w-[480px] text-[15px] leading-relaxed text-sub/80">
              Every figure is worked out from your answers, and every answer shows where it came from. This is a demo farm with sample data.
            </p>
          </>
        ) : null}

        {step.kind === "section" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className={heading}>
              {step.section.title}
            </h1>
            <p className={lead}>{step.section.agentMessage}</p>
            <div className="mt-12 flex flex-col gap-8">
              {step.section.fields.map((f) => (
                <Field
                  key={f.id}
                  field={f}
                  value={values[f.id] ?? ""}
                  error={errors[f.id]}
                  onChange={(v) => {
                    setValues((prev) => ({ ...prev, [f.id]: v }));
                    if (errors[f.id]) {
                      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== f.id)));
                      setMessage("");
                    }
                  }}
                />
              ))}
            </div>
            {feeds.length ? (
              <p className="mx-auto mt-10 max-w-[520px] text-balance text-[15px] leading-relaxed text-sub" aria-live="polite">
                These answers feed {feedsSentence(feeds, exposures)}.
              </p>
            ) : null}
          </>
        ) : null}

        {step.kind === "review" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className={heading}>
              Here&apos;s what&apos;s at stake.
            </h1>
            <p className={lead}>
              From your answers, at today&apos;s prices. Creating your risk profile saves this as the baseline every price move, policy change and weather
              outlook is measured against.
            </p>
            <ul className="mt-12 divide-y divide-line overflow-hidden rounded-[24px] bg-card text-left shadow-card">
              {RISKS.map((r) => {
                const e = exposures.find((x) => x.riskId === r.id);
                return (
                  <li key={r.id} className="px-6 py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[18px] font-medium text-ink">{r.name}</span>
                      <span className="text-[22px] font-medium tracking-[-0.03em] tabular text-ink">{e ? gbp(e.total) : "—"}</span>
                    </div>
                    {e ? <p className="mt-1 text-[15px] leading-snug text-sub">{e.summary}</p> : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {step.kind === "imessage" ? (
          <>
            <p className="mb-6 inline-flex items-center justify-center gap-2 text-[15px] font-medium text-good">
              <Check className="h-5 w-5" aria-hidden /> Your risk profile is ready
            </p>
            <h1 ref={headingRef} tabIndex={-1} className={heading}>
              Want answers by text?
            </h1>
            <p className={lead}>
              Ask things like &ldquo;what&apos;s my biggest risk?&rdquo; or &ldquo;what if wheat drops to £160?&rdquo; over iMessage. It reads your risk
              profile but can&apos;t change anything. This is optional.
            </p>
            {imessage.available ? (
              <div className="mt-12 flex flex-col items-center gap-6">
                <div>
                  <p className="text-[15px] text-sub">Text</p>
                  <p className="mt-1 text-[32px] font-medium tabular tracking-[-0.03em] text-ink">{imessage.number}</p>
                </div>
                <div>
                  <p className="text-[15px] text-sub">with</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(imessage.connectCommand).catch(() => undefined);
                      setCopied(true);
                    }}
                    className={cn("mt-2 inline-flex items-center gap-3 rounded-full bg-panel px-5 py-3 text-[18px] text-ink hover:bg-hover", focus)}
                  >
                    {imessage.connectCommand}
                    <span className="inline-flex items-center gap-1 text-[14px] text-sub">
                      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </button>
                </div>
                <a
                  href={`sms:${imessage.number}&body=${encodeURIComponent(imessage.connectCommand)}`}
                  className={cn("inline-flex items-center gap-2 text-[16px] font-medium text-ink underline-offset-4 hover:underline", focus)}
                >
                  <MessageSquare className="h-5 w-5" aria-hidden /> Open in Messages
                </a>
                {!imessage.replies ? (
                  <p className="max-w-[460px] text-[14px] text-warn">Replies aren&apos;t switched on for this deployment yet, so it won&apos;t answer until they are.</p>
                ) : null}
              </div>
            ) : (
              <p className="mx-auto mt-10 max-w-[460px] text-[16px] text-sub">{imessage.reason} You can connect it any time later.</p>
            )}
          </>
        ) : null}

        <div className="mt-14 flex flex-col items-center gap-4">
          <PrimaryButton busy={busy}>
            {step.kind === "welcome" ? "Get started" : step.kind === "section" ? "Continue" : step.kind === "review" ? "Create my risk profile" : "Go to my dashboard"}
          </PrimaryButton>
          <p role="status" className="min-h-[20px] text-[14px] text-bad">
            {message}
          </p>
          {index > 0 && step.kind !== "imessage" ? (
            <button type="button" onClick={() => go(index - 1)} disabled={busy} className={cn("-mt-2 inline-flex items-center gap-1.5 text-[15px] text-sub hover:text-ink", focus)}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          ) : step.kind === "imessage" ? (
            <button type="button" onClick={finish} disabled={busy} className={cn("-mt-2 text-[15px] text-sub hover:text-ink", focus)}>
              Not now
            </button>
          ) : (
            <p className="-mt-2 text-[13px] text-sub">or press Enter</p>
          )}
        </div>
      </form>
      </main>
    </div>
  );
}
