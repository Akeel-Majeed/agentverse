import Link from "next/link";
import { Card, CardHeader } from "@/components/headwind/card";
import { DocumentForm } from "@/components/headwind/document-form";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { jevP, StatusBadge } from "@/components/headwind/trace-timeline";
import { getDocuments } from "@/lib/data";

type DocValue = { mimeType?: string; fields?: { key: string; value: string; quote: string }[] };

export default async function DocumentsPage() {
  const docs = await getDocuments();
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8">
        <PageHeader
          title="Documents"
          subtitle="Contracts, quotes and emails the agent reads. Each one is screened before any model judges it; anything held waits for you."
        />
        <DocumentForm />
        <Card label="Documents added">
          <CardHeader title="Documents added" description={docs.length ? `${docs.length} this session, newest first.` : "None yet."} />
          <ul className="divide-y divide-line">
            {docs.map((d) => {
              const v = (d.value ?? {}) as DocValue;
              const p = jevP(d.screen);
              return (
                <li key={d.id} className="flex flex-col gap-2 px-5 py-3.5 text-[13px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-ink">{d.source}</span>
                    <span className="text-sub">{v.mimeType ?? "text/plain"}</span>
                    <StatusBadge status={d.screenStatus} />
                    <span className="text-sub tabular">{p ? `Jev injection p=${p}` : "Jev did not run"}</span>
                    <Link href={`/trace/${d.runId}#obs-${d.id}`} className="ml-auto font-medium text-brand underline-offset-4 hover:underline">
                      Trace
                    </Link>
                  </div>
                  {d.screen?.filter((c) => c.note).map((c) => <p key={c.name} className="text-[12.5px] text-sub">{c.note}</p>)}
                  {v.fields?.length ? (
                    <ul className="flex flex-col gap-1">
                      {v.fields.map((f) => (
                        <li key={f.key}>
                          <span className="font-mono text-[11.5px]">{f.key}</span> = {f.value} <span className="text-sub">from “{f.quote}”</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
