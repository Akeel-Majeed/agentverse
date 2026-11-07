import { ApprovalQueue, PendingCounter } from "@/components/headwind/approvals";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { OnboardingPanel } from "@/components/headwind/onboarding-panel";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { getFarm, getOnboarding } from "@/lib/data";

export default async function ProfilePage() {
  const [farm, sections] = await Promise.all([getFarm(), getOnboarding()]);
  return (
    <PageShell>
      <PageHeader
        title={farm.name}
        subtitle="Everything Headwind knows about the farm, section by section. Upload documents and the agent fills in what it can; you confirm."
      />
      <OnboardingPanel sections={sections} />
      <div id="approvals" className="scroll-mt-24">
        <Card label="Approval queue">
          <CardHeader
            title="Approval queue"
            leading={<PendingCounter />}
            description="Changes proposed by document reads, freshness checks, your iMessage replies, adviser agents and Companies House. Nothing changes until you approve."
          />
          <CardBody>
            <ApprovalQueue />
          </CardBody>
        </Card>
      </div>
    </PageShell>
  );
}
