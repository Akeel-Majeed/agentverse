import type { ReactNode } from "react";
import type { Figure, SimResult } from "@/lib/engine/types";
import type { Observation, ScreenCheck, TraceEvent } from "@/lib/trace/types";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any -- event bodies are free-form JSON, read per event type in summary() */
type Body = any;

const MODEL_NAME: Record<string, string> = { "gemini-4-argon": "Gemini 4 Argon", "gemini-3.8-flash": "Gemini 3.8 Flash" };
export const modelName = (id: string | null | undefined) => (id ? MODEL_NAME[id] ?? id : "Gemini");

const TONE = {
  good: "bg-good/10 text-good",
  bad: "bg-bad/10 text-bad",
  brand: "bg-brand-surface text-brand-label",
  neutral: "bg-panel text-sub",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4", TONE[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  published: "good", passed: "good", killed: "bad", blocked: "bad", failed: "bad", quarantined: "bad", held: "brand", review: "brand", running: "brand",
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;

/** Jev's injection probability from a screen result, as text. */
export function jevP(checks: ScreenCheck[] | null | undefined): string | null {
  const c = checks?.find((x) => x.actor === "jev" && x.name === "injection");
  return c ? (Number.isFinite(c.value) ? c.value.toFixed(2) : "n/a") : null;
}

function actorBadge(e: TraceEvent, body: Body, judgeModel: string | null) {
  if (e.actor === "code") return <Badge>Computed (code)</Badge>;
  if (e.actor === "human") return <Badge tone="brand">Human</Badge>;
  if (e.actor === "jev") return <Badge tone="brand">Decided (Jev, p={jevP(body.checks) ?? "n/a"})</Badge>;
  if (e.type === "extract.result") return <Badge tone="brand">Read ({modelName(body.model)})</Badge>;
  return <Badge tone="brand">Judged ({modelName(judgeModel)})</Badge>;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London" });
const short = (h: string) => `${h.slice(0, 12)}…`;
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} className="text-brand underline-offset-4 hover:underline">
    {children}
  </a>
);
const Mono = ({ children }: { children: ReactNode }) => <span className="break-all font-mono text-[11.5px]">{children}</span>;

/**
 * The run's append-only trace, one row per event. Every engine figure has an anchor (`#<figure id>`)
 * and links to the function result that handed it to the judge and to the observations it came from,
 * which link to their source URL.
 */
export function TraceTimeline({ events, observations, judgeModel }: { events: TraceEvent[]; observations: Observation[]; judgeModel: string | null }) {
  const bodies = new Map(events.map((e) => [e.seq, JSON.parse(e.body) as Body]));
  const market = observations.filter((o) => o.kind === "market");
  const seriesObs = new Map(market.map((o) => [(o.value as { id?: string })?.id, o.id]));
  const profileObs = observations.find((o) => o.kind === "profile")?.id;
  const obsIds = new Set(observations.map((o) => o.id));
  const engineResult = events.find((e) => e.type === "engine.result");
  const figures: Record<string, Figure> = engineResult ? (bodies.get(engineResult.seq).sim as SimResult).figures : {};
  const resultEvent = events.find((e) => e.type === "tool.result" && bodies.get(e.seq).tool === "get_engine_results");

  const inputHref = (input: string): string | null => {
    if (figures[input]) return `#${input}`;
    if (seriesObs.has(input)) return `#obs-${seriesObs.get(input)}`;
    if (input === "history" && market[0]) return `#obs-${market[0].id}`;
    if ((input === "profile" || input.includes(".")) && profileObs) return `#obs-${profileObs}`;
    return null;
  };
  const cites = (ids: string[]) =>
    ids.map((id, i) => (
      <span key={id}>
        {i > 0 ? ", " : ""}
        <A href={`#${id}`}>{id}</A>
      </span>
    ));

  function summary(e: TraceEvent, b: Body): ReactNode {
    switch (e.type) {
      case "observation": {
        const o = observations.find((x) => x.id === b.id);
        const v = o?.value as { last?: { date: string; value: number }; n?: number } | undefined;
        return (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span>{b.source}</span>
            {v?.last ? <span className="text-sub tabular">last {v.last.date}: {v.last.value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} (n={v.n})</span> : null}
            {b.url ? <A href={b.url}>source</A> : <span className="text-sub">no URL (farm data)</span>}
            <Mono>sha256 {short(b.sha256)}</Mono>
          </span>
        );
      }
      case "screen.text":
      case "screen.number":
        return (
          <span>
            <StatusBadge status={b.status} />{" "}
            {(b.checks ?? []).map((c: ScreenCheck) => `${c.name} ${Number.isFinite(c.value) ? c.value.toFixed(2) : "n/a"} (limit ${c.threshold})${c.note ? `: ${c.note}` : ""}`).join(" · ")}
            {b.observationId && obsIds.has(b.observationId) ? <> · <A href={`#obs-${b.observationId}`}>document</A></> : null}
          </span>
        );
      case "extract.result":
        return (
          <span className="flex flex-col gap-1">
            <span>Interaction <Mono>{b.interactionId}</Mono></span>
            {(b.fields ?? []).map((f: { key: string; value: string; quote: string }) => (
              <span key={f.key}><Mono>{f.key}</Mono> = {f.value} <span className="text-sub">from “{f.quote}”</span></span>
            ))}
          </span>
        );
      case "extract.error":
      case "judge.error":
        return <span className="text-bad">{b.error ?? b.message}</span>;
      case "judge.skipped":
        return <span>{b.reason}</span>;
      case "judge.start":
        return <span>{modelName(b.model)} · prompt {b.promptVersion} · thinking {b.thinkingLevel} · limits {b.limits.maxTurns} turns, ${b.limits.maxBudgetUsd}, {b.limits.maxProposals} proposals</span>;
      case "judge.turn": {
        const u = b.usage ?? {};
        return (
          <span className="flex flex-wrap gap-x-3">
            <span>Turn {b.turn}</span>
            <span>Interaction <Mono>{b.interactionId}</Mono></span>
            <span>calls {b.calls.length ? b.calls.join(", ") : "none"}</span>
            <span className="tabular">{u.total_input_tokens ?? 0} in / {(u.total_output_tokens ?? 0) + (u.total_thought_tokens ?? 0)} out tokens</span>
            <span className="tabular">running cost ${Number(b.costUsd).toFixed(4)}</span>
          </span>
        );
      }
      case "tool.call":
        return <span><Mono>{b.tool}</Mono> · interaction <Mono>{b.interactionId}</Mono></span>;
      case "tool.result":
        return (
          <span>
            <Mono>{b.tool}</Mono>
            {b.tool === "get_engine_results" ? <> · figures from the <A href="#engine">engine table</A>, computed in code</> : null}
            {b.result?.error ? <span className="text-bad"> · {b.result.error}</span> : null}
          </span>
        );
      case "tool.denied":
        return <span className="text-bad">Refused: {b.tool} is not an allowed function</span>;
      case "proposal.queued_for_farmer":
        return (
          <span>
            <Mono>{b.field_key}</Mono> → {b.proposed_value}, quote “{b.quote}” ·{" "}
            {obsIds.has(b.observation_id) ? <A href={`#obs-${b.observation_id}`}>document</A> : <A href="/documents">document</A>} · waits for the farmer
          </span>
        );
      case "judge.output":
        return (
          <span className="flex flex-col gap-1.5">
            {b.ranked_options.map((o: Body) => (
              <span key={o.option_id}>#{o.rank} <Mono>{o.option_id}</Mono>: {o.reason} <span className="text-sub">cites {cites(o.cites)}</span></span>
            ))}
            {b.risks.map((r: Body) => (
              <span key={r.risk_id}><Mono>{r.risk_id}</Mono>: {r.explanation} <span className="text-sub">cites {cites(r.cites)}</span></span>
            ))}
            {b.change_my_mind.map((c: Body) => (
              <span key={c.threshold_id}>What would change it ({cites([c.threshold_id])}): {c.statement}</span>
            ))}
            {b.hold_for_human ? <span className="text-bad">Holds for the farmer: {b.hold_reason}</span> : null}
          </span>
        );
      case "checker.result":
        return b.untraced.length ? (
          <span className="text-bad">Untraced: {b.untraced.join(", ")} (explanation withheld)</span>
        ) : (
          <span className="text-good">All {b.figures.length} figures in the explanation match a function result</span>
        );
      case "run.numbers_published":
      case "run.end":
        return <span><StatusBadge status={b.status} />{b.head ? <> · head <Mono>{short(b.head)}</Mono></> : null}</span>;
      default:
        return e.type.startsWith("control.") ? (
          <span className="text-bad">{Object.entries(b).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(" · ")}</span>
        ) : null;
    }
  }

  return (
    <ol className="divide-y divide-line rounded-card border border-line bg-white shadow-card">
      {events.map((e) => {
        const b = bodies.get(e.seq);
        const isObs = e.type === "observation";
        return (
          <li key={e.seq} id={isObs ? `obs-${b.id}` : `event-${e.seq}`} className="scroll-mt-20 px-5 py-3 text-[13px] target:bg-brand-surface">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-8 font-mono text-[11.5px] text-sub tabular">#{e.seq}</span>
              <span className="font-mono text-[11.5px] text-sub tabular">{time(e.createdAt)}</span>
              {actorBadge(e, b, judgeModel)}
              {e.type.startsWith("control.") ? <Badge tone="bad">Control fired</Badge> : null}
              <span className="font-mono text-[12px] font-medium text-ink">{e.type}</span>
            </div>
            <div className="mt-1.5 min-w-0 pl-11 leading-relaxed">{summary(e, b)}</div>
            {e.type === "engine.result" ? (
              <FigureTable figures={Object.values(figures)} inputHref={inputHref} resultSeq={resultEvent?.seq} missing={b.missing} />
            ) : (
              <details className="mt-1.5 pl-11">
                <summary className="cursor-pointer text-[12px] text-sub hover:text-ink">Body · hash {short(e.hash)}</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-panel p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(b, null, 2)}</pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FigureTable({ figures, inputHref, resultSeq, missing }: { figures: Figure[]; inputHref: (i: string) => string | null; resultSeq?: number; missing?: string[] }) {
  return (
    <div id="engine" className="mt-2 scroll-mt-20 pl-11">
      <p className="mb-2 text-[12px] text-sub">
        {figures.length} figures computed in code.{" "}
        {resultSeq ? <>Handed to the judge in function result <A href={`#event-${resultSeq}`}>#{resultSeq}</A>.</> : "Not handed to a model on this run."}
        {missing?.length ? ` Profile fields missing, defaults used: ${missing.join(", ")}.` : null}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[12px]">
          <thead className="text-sub">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-normal">Figure</th>
              <th className="py-1.5 pr-3 font-normal">Label</th>
              <th className="py-1.5 pr-3 text-right font-normal">Value</th>
              <th className="py-1.5 pr-3 font-normal">Formula</th>
              <th className="py-1.5 pr-3 font-normal">Inputs</th>
              <th className="py-1.5 font-normal">Function result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {figures.map((f) => (
              <tr key={f.id} id={f.id} className="scroll-mt-20 align-top target:bg-brand-surface">
                <td className="py-1.5 pr-3"><Mono>{f.id}</Mono></td>
                <td className="py-1.5 pr-3">{f.label}</td>
                <td className="py-1.5 pr-3 text-right font-medium tabular">{f.display}</td>
                <td className="py-1.5 pr-3 text-sub">{f.formula}</td>
                <td className="py-1.5 pr-3">
                  {f.inputs.length
                    ? f.inputs.map((i, n) => {
                        const href = inputHref(i);
                        return (
                          <span key={i}>
                            {n > 0 ? ", " : ""}
                            {href ? <A href={href}>{i}</A> : i}
                          </span>
                        );
                      })
                    : <span className="text-sub">simulated paths</span>}
                </td>
                <td className="py-1.5">{resultSeq ? <A href={`#event-${resultSeq}`}>#{resultSeq}</A> : <span className="text-sub">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
