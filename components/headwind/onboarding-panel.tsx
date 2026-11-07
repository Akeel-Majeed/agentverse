"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmSection } from "@/lib/data";
import type { Confidence, OnboardingField, OnboardingSection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, SectionLabel, SourceTag } from "./card";

const ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".csv", ".xlsx"];
const MAX_MB = 10;
const STATUS_TEXT: Record<OnboardingSection["status"], string> = { confirmed: "Confirmed", review: "Needs review", todo: "To do" };

function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return confidence === "high" ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-1.5 py-0.5 text-[11.5px] font-medium text-good">
      <Check className="h-3 w-3" aria-hidden /> Looks right
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[11.5px] font-medium text-[#92400E]">
      <AlertCircle className="h-3 w-3" aria-hidden /> Please check
    </span>
  );
}

function Field({ field, value, onChange }: { field: OnboardingField; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const edited = value !== field.value;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {field.label}
        </label>
        {edited ? <span className="text-[11.5px] font-medium text-brand">Edited, not confirmed</span> : <ConfidenceTag confidence={field.confidence} />}
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 font-mono text-[13.5px]" />
      <div>
        <SourceTag>{field.source}</SourceTag>
      </div>
    </div>
  );
}

interface PickedFile {
  key: string;
  name: string;
  error: string | null;
}

function check(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPT.includes(ext)) return "Not added: only PDF, JPG, PNG, CSV or XLSX files.";
  if (file.size > MAX_MB * 1024 * 1024) return `Not added: larger than ${MAX_MB} MB.`;
  return null;
}

function DropZone({ hint }: { hint: string }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list, (f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, error: check(f) }));
    setFiles((cur) => [...cur, ...picked]);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-5 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
          over ? "border-brand bg-brand-surface" : "border-line-strong bg-panel hover:border-sub"
        )}
      >
        <Upload className="h-5 w-5 text-sub" aria-hidden />
        <span className="text-[13.5px] font-medium">Choose documents, or drop them here</span>
        <span id={hintId} className="max-w-md text-[12.5px] leading-relaxed text-sub">
          {hint}. PDF, JPG, PNG, CSV or XLSX, up to {MAX_MB} MB each. In this demo files stay in your browser and are not uploaded or read.
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          aria-describedby={hintId}
          className="sr-only"
          onChange={(e) => add(e.target.files)}
        />
      </label>
      <ul className="mt-3 flex flex-col gap-1.5 empty:mt-0" aria-live="polite">
        {files.map((f) => (
          <li key={f.key} className="flex items-center gap-2 text-[12.5px]">
            {f.error ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-bad" aria-hidden /> : <FileText className="h-3.5 w-3.5 shrink-0 text-sub" aria-hidden />}
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-1.5">
              <span className="min-w-0 max-w-full truncate font-mono">{f.name}</span>
              <span className={f.error ? "text-bad" : "text-sub"}>· {f.error ?? "Not processed (demo)"}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={`Remove ${f.name}`}
              onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OnboardingPanel({ sections: initial }: { sections: OnboardingSection[] }) {
  const [sections, setSections] = useState(initial);
  const [currentId, setCurrentId] = useState(initial.find((s) => s.status !== "confirmed")?.id ?? initial[0].id);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(initial.flatMap((s) => s.fields.map((f) => [f.id, f.value]))));
  const [confirmedValues, setConfirmedValues] = useState(values);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const selectId = useId();

  const current = sections.find((s) => s.id === currentId)!;
  const index = sections.indexOf(current);
  const confirmedCount = sections.filter((s) => s.status === "confirmed").length;
  const nextRecommended = sections.find((s) => s.status === "review") ?? sections.find((s) => s.status === "todo");
  const changedSinceConfirm = current.fields.some((f) => values[f.id] !== confirmedValues[f.id]);
  const canConfirm = current.status !== "confirmed" || changedSinceConfirm;

  const go = (id: string) => {
    setCurrentId(id);
    setMessage(null);
  };

  const confirm = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await confirmSection(current.id);
      if (!result) throw new Error("not found");
      const next = sections.map((s) => (s.id === current.id ? { ...s, status: "confirmed" as const } : s));
      setSections(next);
      setConfirmedValues((prev) => ({ ...prev, ...Object.fromEntries(current.fields.map((f) => [f.id, values[f.id]])) }));
      const after = next.find((s, i) => i > index && s.status !== "confirmed") ?? next.find((s) => s.status !== "confirmed");
      setMessage({
        tone: "good",
        text: after ? `${current.title} confirmed for this session. Next: ${after.title}.` : `${current.title} confirmed. Every section is now confirmed for this session.`,
      });
    } catch {
      setMessage({ tone: "bad", text: "Couldn't confirm this section. Nothing was changed; try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold">
            {confirmedCount} of {sections.length} sections confirmed
          </p>
          {nextRecommended ? (
            <p className="text-[13px] text-sub">
              Recommended next:{" "}
              <button
                type="button"
                onClick={() => go(nextRecommended.id)}
                className="inline-flex min-h-9 items-center rounded-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {nextRecommended.title}
              </button>
            </p>
          ) : (
            <p className="text-[13px] text-good">All sections confirmed</p>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Sections confirmed"
          aria-valuemin={0}
          aria-valuemax={sections.length}
          aria-valuenow={confirmedCount}
          className="h-2 overflow-hidden rounded-full bg-hover"
        >
          <div className="h-full rounded-full bg-good" style={{ width: `${(confirmedCount / sections.length) * 100}%` }} />
        </div>
        <p className="text-[12.5px] leading-relaxed text-sub">
          Editing a field only changes this page. Confirming a section tells Headwind the values are right and would re-run the assessment. In this
          demo nothing is stored: reloading the page restores the sample values.
        </p>
      </div>

      <div className="lg:hidden">
        <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-medium">
          Section
        </label>
        <select
          id={selectId}
          value={currentId}
          onChange={(e) => go(e.target.value)}
          className="h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {sections.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {s.title} ({STATUS_TEXT[s.status].toLowerCase()})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Farm setup sections" className="hidden lg:block">
          <ol className="flex flex-col gap-1">
            {sections.map((s, i) => {
              const isCurrent = s.id === currentId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCurrent ? "bg-hover font-semibold text-ink" : "text-sub hover:text-ink"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold",
                        s.status === "confirmed" || isCurrent ? "bg-ink text-white" : "border border-line-strong bg-white text-sub"
                      )}
                    >
                      {s.status === "confirmed" ? <Check className="h-3.5 w-3.5" /> : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{s.title}</span>
                    <span className="sr-only">, {STATUS_TEXT[s.status].toLowerCase()}</span>
                    {s.status === "review" ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#D97706]" /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card label={current.title}>
          <CardHeader
            title={current.title}
            description={`Section ${index + 1} of ${sections.length} · ${STATUS_TEXT[current.status]}`}
            action={current.status === "confirmed" ? <SourceTag>Confirmed</SourceTag> : null}
          />
          <CardBody className="flex flex-col gap-6">
            <div className="flex gap-3 rounded-xl border border-line bg-panel p-4">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
              <div>
                <SectionLabel>Headwind agent · sample</SectionLabel>
                <p className="mt-1 text-[14px] leading-relaxed">{current.agentMessage}</p>
              </div>
            </div>
            <div className={cn("rounded-xl border p-4 text-[13.5px] leading-relaxed", current.status === "confirmed" ? "border-line" : "border-[#FDE68A] bg-[#FFFBEB]")}>
              <p className="font-medium">{current.status === "confirmed" ? "What this section affects" : "If this stays unconfirmed"}</p>
              <p className="mt-1 text-ink/80">{current.ifMissing}</p>
            </div>
            <DropZone key={current.id} hint={current.documentsHint} />
            <div className="grid gap-5 md:grid-cols-2">
              {current.fields.map((f) => (
                <Field key={f.id} field={f} value={values[f.id]} onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <p className={cn("text-[13px]", message ? (message.tone === "good" ? "text-good" : "text-bad") : "text-sub")} role="status">
                {message
                  ? message.text
                  : current.status === "confirmed"
                    ? changedSinceConfirm
                      ? "You've changed values since confirming. Confirm again to use them."
                      : "Confirmed. Change a value to confirm it again."
                    : "Check the fields marked “Please check”, then confirm."}
              </p>
              <Button onClick={confirm} disabled={saving || !canConfirm}>
                <Check aria-hidden />
                {saving ? "Confirming…" : current.status === "confirmed" && !changedSinceConfirm ? "Section confirmed" : "Confirm section"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
