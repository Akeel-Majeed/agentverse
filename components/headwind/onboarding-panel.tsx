"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Clock, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSection } from "@/lib/data";
import type { Confidence, OnboardingField, OnboardingSection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, SectionLabel, SourceTag } from "./card";

function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return confidence === "high" ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-1.5 py-0.5 text-[11.5px] font-medium text-good">
      <Check className="h-3 w-3" aria-hidden /> Looks right
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[11.5px] font-medium text-[#B45309]">
      <AlertCircle className="h-3 w-3" aria-hidden /> Please check
    </span>
  );
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: OnboardingField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div id={`field-${field.id}`} className="flex scroll-mt-24 flex-col gap-1.5 rounded-lg target:bg-brand-surface target:ring-4 target:ring-brand-surface">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {field.label}
        </label>
        <span className="flex items-center gap-1.5">
          {field.stale ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[11.5px] font-medium text-[#B45309]">
              <Clock className="h-3 w-3" aria-hidden /> Out of date
            </span>
          ) : null}
          <ConfidenceTag confidence={field.confidence} />
        </span>
      </div>
      <Input
        id={id}
        value={value}
        placeholder="Not recorded"
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        className={cn("h-10 text-[13.5px]", error && "border-bad focus-visible:ring-bad")}
      />
      <div id={hintId} className="flex flex-col gap-1.5">
        {error ? <p className="text-[12px] font-medium text-bad">{error}</p> : null}
        {field.help ? <p className="text-[12px] text-sub">{field.help}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceTag>{field.source}</SourceTag>
          {field.risks?.length ? (
            <span className="flex flex-wrap items-center gap-1 text-[11.5px] text-sub">
              Feeds
              {field.risks.map((r, i) => (
                <span key={r.id}>
                  <Link href={`/risks/${r.id}`} className="font-medium text-ink hover:underline">
                    {r.name}
                  </Link>
                  {i < field.risks!.length - 1 ? "," : ""}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DropZone({ hint }: { hint: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const add = (list: FileList | null) => list && setFiles((f) => [...f, ...Array.from(list, (x) => x.name)]);
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
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
          over ? "border-brand bg-brand-surface" : "border-line-strong bg-panel hover:border-sub"
        )}
      >
        <Upload className="h-5 w-5 text-sub" aria-hidden />
        <span className="text-[13.5px] font-medium">Drop documents here, or browse</span>
        <span className="text-[12.5px] text-sub">{hint}. PDF, image or spreadsheet.</span>
        <input ref={inputRef} id={inputId} type="file" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      {files.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5" aria-live="polite">
          {files.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-2 text-[12px]">
              <FileText className="h-3.5 w-3.5 text-sub" aria-hidden />
              {name}
              <span className="text-sub">· queued for reading (demo)</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OnboardingPanel({ sections: initial, initialSectionId }: { sections: OnboardingSection[]; initialSectionId?: string }) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [currentId, setCurrentId] = useState(
    initial.find((s) => s.id === initialSectionId)?.id ?? initial.find((s) => s.status !== "confirmed")?.id ?? initial[0].id
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.flatMap((s) => s.fields.map((f) => [f.id, f.value])))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const current = sections.find((s) => s.id === currentId)!;
  const index = sections.indexOf(current);
  const confirmed = sections.filter((s) => s.status === "confirmed").length;
  const dirty = current.fields.some((f) => values[f.id] !== f.value);

  // Scroll to a field linked from a risk page (/profile?section=…#field-…).
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith("field-")) document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    const sectionValues = Object.fromEntries(current.fields.map((f) => [f.id, values[f.id] ?? ""]));
    try {
      const result = await saveSection(current.id, sectionValues);
      if (!result.ok) {
        setErrors(result.errors);
        setMessage("Some values need fixing before this section can be saved.");
        return;
      }
      setErrors({});
      const next = sections.map((s) => (s.id === current.id ? result.section : s));
      setSections(next);
      setValues((prev) => ({ ...prev, ...Object.fromEntries(result.section.fields.map((f) => [f.id, f.value])) }));
      const pending = result.status.changes.length;
      setMessage(
        pending
          ? `Saved. ${pending} change${pending > 1 ? "s" : ""} since the risk profile snapshot: update it at the top of the page.`
          : "Saved. Your risk profile is up to date."
      );
      router.refresh();
      if (current.status !== "confirmed") {
        const after = next.find((s, i) => i > index && s.status !== "confirmed") ?? next.find((s) => s.status !== "confirmed");
        if (after) setCurrentId(after.id);
      }
    } catch {
      setMessage("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Onboarding sections">
        <SectionLabel className="mb-3">
          {confirmed} of {sections.length} confirmed
        </SectionLabel>
        <ol className="flex flex-col gap-1">
          {sections.map((s, i) => {
            const isCurrent = s.id === currentId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentId(s.id);
                    setMessage("");
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isCurrent ? "bg-hover font-semibold text-ink" : "text-sub hover:text-ink"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                      s.status === "confirmed" || isCurrent ? "bg-ink text-white" : "border border-line-strong bg-white text-sub"
                    )}
                  >
                    {s.status === "confirmed" ? <Check className="h-3.5 w-3.5" /> : String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1">{s.title}</span>
                  <span className="sr-only">
                    {s.status === "confirmed" ? "confirmed" : s.status === "review" ? "needs review" : "to do"}
                  </span>
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
          description={`Section ${index + 1} of ${sections.length}`}
          action={current.status === "confirmed" ? <SourceTag>Confirmed</SourceTag> : null}
        />
        <CardBody className="flex flex-col gap-6">
          <div className="rounded-lg bg-panel p-4">
            <div>
              <SectionLabel>Headwind agent</SectionLabel>
              <p className="mt-1 text-[14px] leading-relaxed">{current.agentMessage}</p>
            </div>
          </div>
          <DropZone key={current.id} hint={current.documentsHint} />
          <div className="grid gap-5 md:grid-cols-2">
            {current.fields.map((f) => (
              <Field
                key={f.id}
                field={f}
                value={values[f.id] ?? ""}
                error={errors[f.id]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-[12.5px] text-sub" aria-live="polite">
              {message ||
                (current.status === "confirmed"
                  ? "Confirmed. Saved changes show up in the risk profile once you update it."
                  : "Check the fields marked “Please check”, then confirm.")}
            </p>
            <Button onClick={save} disabled={saving || (current.status === "confirmed" && !dirty)}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {saving ? "Saving…" : current.status !== "confirmed" ? "Confirm section" : dirty ? "Save changes" : "Section confirmed"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
