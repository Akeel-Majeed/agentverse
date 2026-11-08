import { Card, CardBody, CardHeader, SourceTag } from "@/components/headwind/card";
import { KpiCell, KpiStrip } from "@/components/headwind/kpi-cell";
import { PageHeader, PageShell } from "@/components/headwind/page-header";
import { getActivity } from "@/lib/data";
import { londonDay, londonTime, shortDate } from "@/lib/format";
import type { ChatTurn, PendingChange } from "@/lib/types";
import { cn } from "@/lib/utils";

const when = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${shortDate(londonDay(d))} ${londonTime(d)}`;
};

const SOURCE: Record<PendingChange["source"], string> = {
  onboarding: "Document read",
  freshness: "Freshness check",
  imessage: "iMessage reply",
  mcp: "Adviser agent",
  companies_house: "Companies House",
  agent: "Risk agent",
};

function CheckBadge({ turn }: { turn: ChatTurn }) {
  const c = turn.checker;
  if (turn.status === "failed") return <span className="text-[12.5px] font-medium text-bad">Not answered{turn.error ? `: ${turn.error}` : ""}</span>;
  if (turn.status === "answering") return <span className="text-[12.5px] text-sub">Answering…</span>;
  if (!c) return null;
  if (c.blocked) {
    return (
      <span className="text-[12.5px] font-medium text-bad">
        Held back: {c.untraced.join(", ")} still not in any tool result after a rewrite
      </span>
    );
  }
  if (c.flagged.length) {
    return (
      <span className="text-[12.5px] font-medium text-warn">
        Figure check caught {c.flagged.join(", ")}: rewritten from tool results
      </span>
    );
  }
  return <span className="text-[12.5px] font-medium text-good">Every figure traced to a tool result</span>;
}

export default async function ActivityPage() {
  const { turns, decisions, snapshots, totals } = await getActivity();
  return (
    <PageShell>
      <PageHeader
        title="Activity"
        subtitle="Everything the agents did and everything you decided: each question the assistant answered, the tools it called and what the figure check caught; each change you approved or rejected; each risk profile snapshot."
      />

      <KpiStrip>
        <KpiCell label="Questions answered" value={totals.answered} sub={totals.failed ? `${totals.failed} not answered` : "iMessage and app"} />
        <KpiCell label="Tool calls" value={totals.toolCalls} sub="All read-only" />
        <KpiCell
          label="Figures caught"
          value={totals.caught}
          sub={totals.caught ? `in ${totals.caughtReplies} ${totals.caughtReplies === 1 ? "reply" : "replies"}, rewritten` : "None so far"}
        />
        <KpiCell label="Replies held back" value={totals.heldBack} sub="Figure untraced after rewrite" />
      </KpiStrip>

      <Card label="Assistant log">
        <CardHeader title="Assistant log" description="Newest first. Both channels share one conversation." />
        <CardBody>
          {turns.length === 0 ? (
            <p className="text-[13.5px] text-sub">No questions yet. Ask Hedged something and it shows up here, with the tools it used.</p>
          ) : (
            <ol className="divide-y divide-line">
              {turns.map((t) => (
                <li key={t.inboundMessageId} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-sub">
                    <span className="tabular">{when(t.createdAt)}</span>
                    <SourceTag>{t.channel === "web" ? "App" : "iMessage"}</SourceTag>
                    {t.model ? <span>{t.model}</span> : null}
                  </div>
                  <p className="text-[14px] font-medium">{t.question}</p>
                  {t.answer && t.status !== "failed" ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-sub">{t.answer}</p> : null}
                  {t.tools?.length ? (
                    <ul aria-label="Tools called" className="flex flex-wrap gap-1.5">
                      {t.tools.map((tool, i) => (
                        <li key={i} className="rounded-full border border-line bg-panel px-2.5 py-0.5 font-mono text-[11.5px] text-ink">
                          {tool.name}
                          {tool.input && Object.keys(tool.input as object).length ? `(${JSON.stringify(tool.input)})` : "()"}
                          <span className="ml-1 text-sub">{tool.ms} ms</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <CheckBadge turn={t} />
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-8 min-[1100px]:grid-cols-2">
        <Card label="Your decisions">
          <CardHeader title="Your decisions" description="Proposed changes you approved or rejected. Only you can change the profile." />
          <CardBody>
            {decisions.length === 0 ? (
              <p className="text-[13.5px] text-sub">Nothing decided yet. Proposed changes wait in the approval queue on your profile.</p>
            ) : (
              <ul className="divide-y divide-line">
                {decisions.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[13.5px] first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="font-medium">{d.field}</span>: {d.currentValue} → {d.proposedValue}
                      <span className="block text-[12.5px] text-sub">{SOURCE[d.source]}</span>
                    </span>
                    <span className={cn("text-[12.5px] font-semibold", d.status === "approved" ? "text-good" : "text-bad")}>
                      {d.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card label="Risk profile snapshots">
          <CardHeader title="Risk profile snapshots" description="Each one freezes the profile and market figures that every risk figure is worked out from." />
          <CardBody>
            <ul className="divide-y divide-line">
              {snapshots.map((s) => (
                <li key={s.version} className="flex items-baseline justify-between gap-3 py-3 text-[13.5px] first:pt-0 last:pb-0">
                  <span>
                    <span className="font-medium">v{s.version}</span> · {s.reason}
                  </span>
                  <span className="text-[12.5px] text-sub tabular">{when(s.takenAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  );
}
