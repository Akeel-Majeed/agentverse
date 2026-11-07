import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { MiniScore, CombinedRiskCircle } from "@/components/headwind/risk-summary";
import { Button } from "@/components/ui/button";
import { getAssessmentMeta, getFarm, getOverallRisk, getProfitSummary, getRisks, getUpcoming, getWhatIfConfig } from "@/lib/data";
import { gbp, gbpK, gbpPerT, longDate, shortDate } from "@/lib/format";
import { bandFor } from "@/lib/score";
import { whatIf } from "@/lib/sim";

export const metadata: Metadata = {
  title: { absolute: "Headwind · See what could hit your farm's profit" },
  alternates: { canonical: "/" },
};

const section = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";
const h2 = "text-[24px] font-bold tracking-[-0.02em] sm:text-[28px]";

export default async function LandingPage() {
  const [farm, meta, summary, risks, profit, upcoming, whatIfConfig] = await Promise.all([
    getFarm(),
    getAssessmentMeta(),
    getOverallRisk(),
    getRisks(),
    getProfitSummary(),
    getUpcoming("2026-11-07"),
    getWhatIfConfig(),
  ]);
  const wheat = risks.find((r) => r.id === "wheat-price")!;
  const minPrice = wheat.mitigations.find((m) => m.id === "wheat-minprice-half-2027");
  const slump = whatIfConfig.presets.find((p) => p.id === "wheat-slump")!;
  const slumpResult = whatIf(slump.inputs);
  const nextKey = upcoming.find((c) => c.kind === "key") ?? upcoming[0];
  const byId = new Map(risks.map((r) => [r.id, r]));

  const journeys = [
    {
      title: "Review a risk",
      body: `See why ${wheat.name.toLowerCase()} scores ${wheat.score}/10${minPrice ? ` and how a minimum-price contract would take it to ${minPrice.scoreAfter}` : ""}, with the working behind every £ figure.`,
      href: `/risks/${wheat.id}`,
      cta: `Open ${wheat.name.toLowerCase()}`,
    },
    {
      title: "Test a scenario",
      body: `Drop wheat from ${gbpPerT(whatIfConfig.baseline.wheatPrice)} to ${gbpPerT(slump.inputs.wheatPrice)} and expected profit falls from ${gbp(profit.expected)} to ${gbpK(slumpResult.profitK)}.`,
      href: "/what-if",
      cta: "Open scenarios",
    },
    {
      title: "See an upcoming deadline",
      body: nextKey ? `Next decision: ${shortDate(nextKey.start)}, ${nextKey.label.toLowerCase()}. Expected and confirmed dates are marked differently.` : "Selling, input, finance and scheme dates for the year ahead.",
      href: "/calendar",
      cta: "Open the calendar",
    },
  ];

  const faqs = [
    {
      q: "What do the scores mean?",
      a: "Each risk gets a score from 1 to 10 based on how much an estimated 1-in-20 bad year for that risk alone would take off a typical year's profit: 1–3 Low, 4–5 Moderate, 6–7 High, 8–10 Severe. The overall score uses the same bands for the whole farm's bad-year loss, with risks combined so they don't all peak together. A score shows severity, not likelihood: 10/10 does not mean a loss is certain.",
    },
    {
      q: "How current is the data?",
      a: `This demo is a snapshot: market prices are dated ${longDate(meta.marketDataDate)}, the assessment is shown as run at ${meta.updatedAt} on ${longDate(meta.date)}, and farm inputs were last confirmed on ${longDate(meta.farmInputsConfirmed)}. Nothing updates live. Inputs that are stale or unconfirmed are flagged, and the overall score is marked provisional until they are checked.`,
    },
    {
      q: "What documents are supported?",
      a: "None are processed in this demo. Farm setup shows where documents such as cropping plans, grain store sheets and bank letters would go, and accepts PDF, JPG, PNG, CSV and XLSX files up to 10 MB to show the flow, but files are not read, uploaded or stored.",
    },
    {
      q: "What can the demo do?",
      a: "You can explore the dashboard, open each risk, add options to a comparison, test scenarios, browse the calendar and work through farm setup and the actions queue. Approvals and edits are kept only in your browser tab and reset when you reload. It doesn't connect to real accounts, send messages or place any trade.",
    },
  ];

  return (
    <>
      <main id="main" tabIndex={-1} className="flex flex-col">
        <section aria-labelledby="hero-heading" className="border-b border-line">
          <div className={`${section} grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:py-20`}>
            <div className="flex flex-col gap-5">
              <p className="text-[13px] font-medium text-brand-label">Farm risk for UK arable farms</p>
              <h1 id="hero-heading" className="text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[46px]">
                See what could hit your farm&apos;s profit — and what to do next.
              </h1>
              <p className="max-w-xl text-[16px] leading-relaxed text-sub sm:text-[17px]">
                Headwind brings crop prices, input costs, weather exposure and finance into one farm-specific view, so you can compare risks and
                test your next decision.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 text-[14px]">
                  <Link href="/overview">
                    Explore the demo farm <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <a
                  href="#how-it-works"
                  className="inline-flex h-11 items-center rounded-lg px-3 text-[14px] font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  See how it works
                </a>
              </div>
              <p className="text-[13px] text-sub">No sign-up. The demo uses sample data for a fictional {farm.hectares} ha farm in Lincolnshire.</p>
            </div>

            <figure aria-labelledby="preview-caption" className="rounded-card border border-line bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <span id="preview-caption" className="min-w-0 truncate text-[13px] font-medium">
                  {farm.name}
                </span>
                <span className="shrink-0 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1 text-[12px] font-medium leading-none text-[#92400E]">
                  Demo · sample data
                </span>
              </div>
              <div className="flex flex-col items-center gap-4 px-4 py-5 sm:flex-row sm:items-center">
                <CombinedRiskCircle summary={summary} className="w-[200px] sm:w-[200px]" />
                <div className="flex w-full min-w-0 flex-col gap-3">
                  <div>
                    <p className="text-[12px] text-sub">Expected profit, {meta.harvestYear}</p>
                    <p className="font-mono text-[24px] font-semibold leading-tight">{gbp(profit.expected)}</p>
                  </div>
                  <ul className="flex flex-col gap-1.5" aria-label="Category scores, outer ring to inner ring">
                    {summary.categories.map((c, i) => {
                      const risk = byId.get(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
                          <MiniScore score={c.score} size={26} />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono text-[11px] text-sub">{i + 1}</span> {c.name}
                          </span>
                          {c.score !== null && risk ? (
                            <span className="shrink-0 font-medium" style={{ color: bandFor(c.score).text }}>
                              {bandFor(c.score).level}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <figcaption className="border-t border-line px-4 py-3 text-[12.5px] text-sub">
                Overall risk {summary.overall.score ?? "—"}/10 {summary.overall.level ?? ""}
                {summary.overall.state === "provisional" ? " (provisional: some sample inputs are unconfirmed)" : ""}. Rings show each category on its own 1–10 scale.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-b border-line bg-panel">
          <div className={`${section} py-12 sm:py-16`}>
            <h2 id="how-heading" className={h2}>
              How it works
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                ["Add or confirm farm information", "Start from the farm's own figures: cropping, grain in store, inputs, borrowing and scheme agreements. In the demo these are already filled in with sample values, and the ones that need checking are marked."],
                ["Review your exposure", "See expected profit, an overall risk score and five risk categories, each with what a bad year could cost. Every £ figure opens its working and sources."],
                ["Compare options and upcoming decisions", "Add options such as a minimum-price contract to a comparison, test price and yield scenarios, and see which deadlines matter next."],
              ].map(([title, body], i) => (
                <li key={title} className="flex flex-col gap-2 rounded-card border border-line bg-white p-5">
                  <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong font-mono text-[12px] font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
                  <p className="text-[14px] leading-relaxed text-sub">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="explore" aria-labelledby="explore-heading" className="scroll-mt-20 border-b border-line">
          <div className={`${section} py-12 sm:py-16`}>
            <h2 id="explore-heading" className={h2}>
              What you can explore
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-sub">Three ways into the demo farm. Each opens a working page.</p>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {journeys.map((j) => (
                <li key={j.title}>
                  <Link
                    href={j.href}
                    className="group flex h-full flex-col gap-2 rounded-card border border-line bg-white p-5 transition-colors hover:border-line-strong hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <h3 className="text-[16px] font-semibold tracking-tight">{j.title}</h3>
                    <p className="flex-1 text-[14px] leading-relaxed text-sub">{j.body}</p>
                    <span className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand group-hover:underline">
                      {j.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="who-heading" className="border-b border-line">
          <div className={`${section} grid gap-8 py-12 sm:py-16 lg:grid-cols-2`}>
            <div>
              <h2 id="who-heading" className={h2}>
                Who it&apos;s for
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed">
                Farmers and the advisers who work with them: agronomists, farm business consultants and accountants. The current demo is an arable
                farm growing {farm.crops.join(", ").toLowerCase()}, so the risks are the ones that matter on a combinable-crop business: grain prices,
                fertiliser, weather, support payments and borrowing.
              </p>
            </div>
            <div>
              <h2 className={h2}>About the sample data</h2>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed">
                <li>Every figure belongs to a fictional farm. Prices and dates are a fixed snapshot, not live feeds.</li>
                <li>Scores and bad-year figures are model estimates under stated assumptions. They are not forecasts or financial advice.</li>
                <li>
                  Nothing you enter is stored. Approvals, edits and scenarios stay in your browser tab and reset when you reload. Files you choose are
                  not read or sent anywhere.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="border-b border-line bg-panel">
          <div className={`${section} py-12 sm:py-16`}>
            <h2 id="faq-heading" className={h2}>
              Questions
            </h2>
            <div className="mt-6 flex max-w-3xl flex-col gap-2">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-xl border border-line bg-white">
                  <summary className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <h3>{f.q}</h3>
                    <ChevronDown className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-4 pb-4 text-[14.5px] leading-relaxed text-sub">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Open the demo" className={`${section} flex flex-col items-start gap-4 py-12 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="text-[18px] font-semibold tracking-tight">Ready to look around?</p>
          <Button asChild size="lg" className="h-11 text-[14px]">
            <Link href="/overview">
              Explore the demo farm <ArrowRight aria-hidden />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${section} flex flex-col gap-4 py-8 text-[13px] text-sub md:flex-row md:items-start md:justify-between`}>
          <div>
            <p className="font-semibold text-ink">Headwind</p>
            <p className="mt-1">Demo with sample data for a fictional farm. Not financial advice.</p>
          </div>
          <nav aria-label="Demo pages">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                ["/overview", "Dashboard"],
                ["/risks", "Risks"],
                ["/what-if", "Scenarios"],
                ["/calendar", "Calendar"],
                ["/actions", "Actions"],
                ["/profile", "Farm setup"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="rounded-sm hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
