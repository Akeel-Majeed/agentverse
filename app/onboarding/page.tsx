import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/headwind/onboarding-flow";
import { getFarm, getIMessageSetup, getMarketBaseline, getOnboarding } from "@/lib/data";

export const metadata: Metadata = { title: "Set up your farm · Headwind" };

export default async function OnboardingPage() {
  const [farm, sections, market, imessage] = await Promise.all([getFarm(), getOnboarding(), getMarketBaseline(), getIMessageSetup()]);
  return <OnboardingFlow farmName={farm.name} sections={sections} market={market} imessage={imessage} />;
}
