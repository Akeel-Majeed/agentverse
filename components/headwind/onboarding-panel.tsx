"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmSection } from "@/lib/data";
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

function Field({ field, value, onChange }: { field: OnboardingField; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {field.label}
        </label>
        <ConfidenceTag confidence={field.confidence} />
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 font-mono text-[13.5px]" />
      <div>
        <SourceTag>{field.source}</SourceTag>
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
            <li key={`${name}-${i}`} className="flex items-center gap-2 font-mono text-[12px]">
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

export function OnboardingPanel({ sections: initial }: { sections: OnboardingSection[] }) {
  const [sections, setSections] = useState(initial);
  const [currentId, setCurrentId] = useState(initial.find((s) => s.status !== "confirmed")?.id ?? initial[0].id);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.flatMap((s) => s.fields.map((f) => [f.id, f.value])))
  );
  const [saving, setSaving] = useState(false);
  const current = sections.find((s) => s.id === currentId)!;
  const index = sections.indexOf(current);
  const confirmed = sections.filter((s) => s.status === "confirmed").length;

  const confirm = async () => {
    setSaving(true);
    await confirmSection(current.id);
    const next = sections.map((s) => (s.id === current.id ? { ...s, status: "confirmed" as const } : s));
    setSections(next);
    setSaving(false);
    const after = next.find((s, i) => i > index && s.status !== "confirmed") ?? next.find((s) => s.status !== "confirmed");
    if (after) setCurrentId(after.id);
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
                  onClick={() => setCurrentId(s.id)}
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
          <div className="flex gap-3 rounded-xl border border-line bg-panel p-4">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
            <div>
              <SectionLabel>Headwind agent</SectionLabel>
              <p className="mt-1 text-[14px] leading-relaxed">{current.agentMessage}</p>
            </div>
          </div>
          <DropZone key={current.id} hint={current.documentsHint} />
          <div className="grid gap-5 md:grid-cols-2">
            {current.fields.map((f) => (
              <Field key={f.id} field={f} value={values[f.id]} onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-[12.5px] text-sub" aria-live="polite">
              {current.status === "confirmed" ? "Confirmed. Edits will re-run the assessment." : "Check the fields marked “Please check”, then confirm."}
            </p>
            <Button onClick={confirm} disabled={saving || current.status === "confirmed"}>
              <Check aria-hidden />
              {current.status === "confirmed" ? "Section confirmed" : "Confirm section"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
