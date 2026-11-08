import { redirect } from "next/navigation";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { getTrace } from "@/lib/data";

export default async function LatestTracePage() {
  const trace = await getTrace();
  if (trace) redirect(`/trace/${trace.run.id}`);
  return (
    <PageShell>
      <PageHeader
        title="Trace"
        subtitle="No agent runs yet. Update the risk profile or add a document, and every step the agent takes is logged here."
      />
    </PageShell>
  );
}
