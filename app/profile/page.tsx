import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ApprovalQueue, PendingCounter } from "@/components/headwind/approvals";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { OnboardingPanel } from "@/components/headwind/onboarding-panel";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { getFarm, getOnboarding } from "@/lib/data";

export const metadata: Metadata = { title: "Farm setup" };

export default async function ProfilePage() {
  const [farm, sections] = await Promise.all([getFarm(), getOnboarding()]);
  return (
    <PageShell className="gap-6 sm:gap-8">
      <PageHeader
        title="Farm setup"
        subtitle={`What Headwind knows about ${farm.name}, section by section. Check each value, then confirm the section so the assessment can rely on it.`}
      />
      <OnboardingPanel sections={sections} />
      <div id="approvals">
        <Card label="Proposed changes">
          <CardHeader
            title="Proposed changes to your farm data"
            leading={<PendingCounter />}
            description="Changes suggested by documents, freshness checks, your iMessage replies, your adviser's connected service and Companies House. Nothing changes until you approve it."
            action={
              <Link
                href="/actions"
                className="inline-flex min-h-9 items-center gap-1 rounded-sm text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open Actions <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          <CardBody>
            <ApprovalQueue />
          </CardBody>
        </Card>
      </div>
    </PageShell>
  );
}
