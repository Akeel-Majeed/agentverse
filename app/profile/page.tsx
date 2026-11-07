import { ApprovalQueue, PendingCounter } from "@/components/headwind/approvals";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import { OnboardingPanel } from "@/components/headwind/onboarding-panel";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { RiskProfileCard } from "@/components/headwind/risk-profile-card";
import { getFarm, getOnboarding, getProfileStatus, getRiskProfile } from "@/lib/data";

export default async function ProfilePage({ searchParams }: { searchParams: { section?: string } }) {
  const [farm, sections, status, riskProfile] = await Promise.all([getFarm(), getOnboarding(), getProfileStatus(), getRiskProfile()]);
  return (
    <PageShell>
      <PageHeader
        title={farm.name}
        subtitle="Everything Headwind knows about the farm, section by section. Upload documents and the agent fills in what it can; you confirm. Each field shows which risks it feeds."
      />
      <div id="risk-profile" className="scroll-mt-24">
        <RiskProfileCard status={status} rows={riskProfile.rows} impacts={riskProfile.impacts} />
      </div>
      <OnboardingPanel sections={sections} initialSectionId={searchParams.section} />
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
