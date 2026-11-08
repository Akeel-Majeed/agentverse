"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDemoDocument, addDocument, addDocumentFile } from "@/lib/data";
import { Card, CardBody, CardHeader, SectionLabel } from "./card";

type Demo = { name: Parameters<typeof addDemoDocument>[0]; label: string; thumb?: string };

const DEMO_GROUPS: { title: string; docs: Demo[] }[] = [
  {
    title: "Financial documents (synthetic)",
    docs: [
      { name: "facility-letter.pdf", label: "Bank facility letter (PDF)" },
      { name: "annual-accounts.pdf", label: "Annual accounts 2026 (PDF)" },
      { name: "ct-computation.pdf", label: "Corporation tax computation (PDF)" },
      { name: "vat-return.pdf", label: "VAT return Q10/26 (PDF)" },
      { name: "scheme-remittance.pdf", label: "Scheme payment statement (PDF)" },
      { name: "fertiliser-invoice.pdf", label: "Fertiliser invoice (PDF)" },
      { name: "fertiliser-invoice-photo.png", label: "Fertiliser invoice (photo)", thumb: "/demo/fertiliser-invoice-photo.png" },
      { name: "fertiliser-contract.txt", label: "Fertiliser contract (text)" },
      { name: "forward-contract.png", label: "Forward contract (photo)", thumb: "/demo/forward-contract.png" },
      { name: "forward-contract.pdf", label: "Forward contract (PDF)" },
    ],
  },
  {
    title: "Attack examples",
    docs: [
      { name: "merchant-email-injection.txt", label: "Suspicious merchant email (text)" },
      { name: "injection-contract.png", label: "Contract with printed instruction (photo)", thumb: "/demo/injection-contract.png" },
    ],
  },
];
const DEMOS = DEMO_GROUPS.flatMap((g) => g.docs);

/** Paste text, upload or photograph a document, or load a demo one. Each opens its run's trace. */
export function DocumentForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const run = (add: () => Promise<{ runId: string }>) => {
    setError(null);
    start(async () => {
      try {
        const { runId } = await add();
        router.push(`/trace/${runId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <Card label="Add a document">
      <CardHeader
        title="Add a document"
        description="Gemini 3.8 Flash reads PDFs and photos, Jev screens the text for instructions aimed at the agent, then the engine runs. Nothing changes the profile until you approve it."
      />
      <CardBody className="flex flex-col gap-6">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addDocument(name.trim() || "Pasted text", text));
          }}
        >
          <SectionLabel as="h3">Paste text</SectionLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Merchant email 3 Nov" aria-label="Document name" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            rows={5}
            aria-label="Document text"
            placeholder="Paste a contract, quote or email"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="submit" variant="outline" disabled={pending} className="self-start">
            Add text
          </Button>
        </form>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(() => addDocumentFile(form));
          }}
        >
          <SectionLabel as="h3">Upload a PDF or take a photo</SectionLabel>
          <input
            type="file"
            name="file"
            required
            accept="application/pdf,image/*"
            capture="environment"
            aria-label="PDF or photo"
            className="text-[13px] file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
          <Button type="submit" variant="outline" disabled={pending} className="self-start">
            Upload
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <SectionLabel as="h3">Demo documents</SectionLabel>
          {DEMO_GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <p className="text-[12px] text-sub">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.docs.map((d) => (
                  <Button key={d.name} variant="secondary" size="sm" disabled={pending} onClick={() => run(() => addDemoDocument(d.name))}>
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            {DEMOS.filter((d) => d.thumb).map((d) => (
              <figure key={d.name} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- static demo thumbnail */}
                <img src={d.thumb} alt={d.label} width={96} height={133} className="rounded-md border border-line" />
                <figcaption className="max-w-[96px] text-[11px] leading-tight text-sub">{d.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        {pending ? (
          <p role="status" className="flex items-center gap-2 text-[13px] text-sub">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading, screening and simulating…
          </p>
        ) : null}
        {error ? <p role="alert" className="text-[13px] text-bad">{error}</p> : null}
      </CardBody>
    </Card>
  );
}
