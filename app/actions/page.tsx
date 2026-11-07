import type { Metadata } from "next";
import { ActionsQueue } from "@/components/headwind/actions-queue";
import { PageHeader, PageShell } from "@/components/headwind/page-header";

export const metadata: Metadata = { title: "Actions" };

export default function ActionsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Actions"
        subtitle="Updates waiting for you before they go into the figures. Nothing changes until you approve it, and exploring a scenario never applies a proposal."
      />
      <ActionsQueue />
    </PageShell>
  );
}
