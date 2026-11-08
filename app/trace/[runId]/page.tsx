import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/headwind/card";
import { HedgeDecisionCard } from "@/components/headwind/hedge-decision";
import { JudgeButton } from "@/components/headwind/judge-button";
import { KillSwitch } from "@/components/headwind/kill-switch";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { ToolFlow } from "@/components/headwind/tool-flow";
import { jevP, modelName, StatusBadge, TraceTimeline } from "@/components/headwind/trace-timeline";
import { getControls, getTrace } from "@/lib/data";
import { hedgeDecision } from "@/lib/trace/decision";
import type { AgentRun, TraceEvent } from "@/lib/trace/types";
import { cn } from "@/lib/utils";

const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/** One line per model: what ran, with its id, or plainly that it did not. Nothing is mocked. */
function modelLines(run: AgentRun, events: TraceEvent[]): [string, string][] {
  const find = (type: string) => events.find((e) => e.type === type);
  const body = (e: TraceEvent | undefined) => (e ? JSON.parse(e.body) : null);
  const extract = body(find("extract.result")), extractError = body(find("extract.error"));
  const screen = find("screen.text"), skipped = body(find("judge.skipped"));
  const turns = events.filter((e) => e.type === "judge.turn").length;
  const reader = extract
    ? `${modelName(extract.model)} ran · interaction ${extract.interactionId}`
    : extractError ? `Did not read the file: ${extractError.error}` : "Did not run (no PDF or photo on this run)";
  const jev = screen
    ? screen.actor === "jev" ? `Jev ran · injection p=${jevP(body(screen).checks)}` : "Did not run: no text to screen, held for the farmer"
    : "Did not run (no document on this run)";
  const judge =
    turns > 0 ? `${modelName(run.model)} ran · ${turns} turn${turns === 1 ? "" : "s"} · $${(run.totalCostUsd ?? 0).toFixed(4)}`
    : skipped ? `Did not run: ${skipped.reason}`
    : run.status === "queued" ? "Not run yet: press Run judgement"
    : run.status === "running" ? "Starting…"
    : run.status === "held" ? "Did not run: the input screen held this run for the farmer"
    : run.status === "killed" ? "Did not run: stopped by the kill switch before its first turn"
    : run.status === "numbers_only" ? "Did not run: numbers only (kill switch on or no GEMINI_API_KEY when the run started)"
    : "Did not run";
  return [["Document reader", reader], ["Input screen", jev], ["Judge", judge]];
}

export default async function TraceRunPage({ params }: { params: { runId: string } }) {
  const [trace, controls] = await Promise.all([getTrace(params.runId), getControls()]);
  if (!trace) notFound();
  const { run, events, observations, verify } = trace;
  const decision = hedgeDecision(events);
  const untraced = (() => {
    const e = events.find((x) => x.type === "checker.result");
    return e ? (JSON.parse(e.body).untraced as string[]) : [];
  })();
  const facts: [string, string][] = [
    ["Trigger", run.trigger],
    ["As of", run.asOf],
    ["Model", run.model ? modelName(run.model) : "none"],
    ["Cost", run.totalCostUsd === null ? "none" : `$${run.totalCostUsd.toFixed(4)}`],
    ["Turns", String(run.turns ?? 0)],
    ["Timings", Object.entries(run.timings).map(([k, ms]) => `${k} ${secs(ms)}`).join(" · ") || "none"],
  ];

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Trace <StatusBadge status={run.status} />
          </span>
        }
        subtitle="Every step of this run, in order, hash-chained. Computed = our code. Decided = the Jev screen. Read and Judged = a Gemini model, with its interaction id."
        meta={<span className="font-mono text-[12px]">run {run.id}</span>}
        actions={run.status === "queued" || run.status === "running" ? <JudgeButton runId={run.id} running={run.status === "running"} /> : null}
      />

      <div
        className={cn(
          "rounded-card border px-5 py-3 text-[13px]",
          verify.ok ? "border-good/30 bg-good/5 text-good" : "border-bad/40 bg-bad/5 text-bad"
        )}
      >
        <p className="font-semibold">
          {verify.ok ? `Chain intact · ${events.length} events re-hashed on this page load` : `Chain broken at event ${verify.brokenAt}`}
        </p>
        <p className="mt-0.5 break-all font-mono text-[11.5px]">head {verify.head}</p>
      </div>

      <KillSwitch paused={controls.paused} />

      {run.status === "blocked" ? (
        <p className="text-[14px] font-medium text-bad">
          Explanation withheld: the figure checker could not trace {untraced.join(", ") || "its figures"} to a function result.
        </p>
      ) : null}
      {run.status === "held" ? <p className="text-[14px] font-medium text-brand-label">Needs the farmer.</p> : null}
      {run.error ? <p className="text-[13px] text-bad">{run.error}</p> : null}

      {decision ? <HedgeDecisionCard runId={run.id} decision={decision} canDecide={run.status === "published"} /> : null}
      <ToolFlow events={events} />

      <Card label="Run">
        <CardBody>
          <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            {[...facts, ...modelLines(run, events)].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-32 shrink-0 text-sub">{k}</dt>
                <dd className="min-w-0 break-words tabular">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <TraceTimeline events={events} observations={observations} judgeModel={run.model} />
    </PageShell>
  );
}
