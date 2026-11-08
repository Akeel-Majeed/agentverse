import { Ban, Bot, ChevronRight, CircleCheck, CircleX, Flag, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/headwind/card";
import type { TraceEvent } from "@/lib/trace/types";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any -- event bodies are free-form JSON, read per event type */
type Body = any;

const MAX_JSON = 1500;
const json = (v: unknown) => {
  const s = JSON.stringify(v, null, 2) ?? "null";
  return s.length > MAX_JSON ? `${s.slice(0, MAX_JSON)}\n… (${s.length - MAX_JSON} more characters on the trace row)` : s;
};
/** Engine figures in a function result: every object carrying a display string. */
const countFigures = (v: unknown): number =>
  v && typeof v === "object" ? (("display" in v && "id" in v) ? 1 : 0) + Object.values(v).reduce((n: number, x) => n + countFigures(x), 0) : 0;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function resultLine(tool: string, result: Body): string {
  if (result?.error) return result.error;
  if (tool === "get_engine_results") return plural(countFigures(result), "figure");
  if (tool === "get_documents") return plural(Array.isArray(result) ? result.length : 0, "document");
  if (tool === "get_profile") return plural(Array.isArray(result) ? result.length : 0, "field");
  return result?.status ?? "done";
}

interface Step {
  seq: number;
  icon: ReactNode;
  title: string;
  line?: string;
  tone?: "bad" | "good";
  detail?: { label: string; value: unknown }[];
}

/** The judge's turns, function calls with what each returned, the figure check and the run's end, in trace order. */
export function ToolFlow({ events }: { events: TraceEvent[] }) {
  const bodies = new Map(events.map((e) => [e.seq, JSON.parse(e.body) as Body]));
  const results = new Map(events.filter((e) => e.type === "tool.result").map((e) => [bodies.get(e.seq).callId, bodies.get(e.seq)]));
  const steps: Step[] = [];
  for (const e of events) {
    const b = bodies.get(e.seq);
    if (e.type === "judge.turn") steps.push({ seq: e.seq, icon: <Bot aria-hidden />, title: `Turn ${b.turn}`, line: b.calls.length ? plural(b.calls.length, "call") : "no calls" });
    else if (e.type === "tool.call") {
      const r = results.get(b.callId);
      steps.push({
        seq: e.seq, icon: <Wrench aria-hidden />, title: b.tool, line: r ? resultLine(b.tool, r.result) : "no result",
        tone: r?.result?.error ? "bad" : undefined,
        detail: [{ label: "Arguments", value: b.args }, ...(r ? [{ label: "Result", value: r.result }] : [])],
      });
    } else if (e.type === "tool.denied") steps.push({ seq: e.seq, icon: <Ban aria-hidden />, title: `${b.tool} refused`, line: "not an allowed function", tone: "bad" });
    else if (e.type === "checker.result") {
      steps.push(b.untraced.length
        ? { seq: e.seq, icon: <CircleX aria-hidden />, title: "Figure check", line: `✗ blocked: ${b.untraced.length} untraced`, tone: "bad", detail: [{ label: "Untraced", value: b.untraced }] }
        : { seq: e.seq, icon: <CircleCheck aria-hidden />, title: "Figure check", line: `✓ ${plural(b.figures.length, "figure")} traced`, tone: "good" });
    } else if (e.type === "run.end") steps.push({ seq: e.seq, icon: <Flag aria-hidden />, title: "Run end", line: b.status, tone: b.status === "published" ? "good" : b.status === "held" ? undefined : "bad" });
  }
  if (!events.some((e) => e.type === "judge.turn")) return null;

  return (
    <Card label="Tools the agent called">
      <CardHeader title="Tools the agent called" description="Each step links to its row in the trace. Open one to see what was sent and returned." />
      <CardBody>
        <ol className="flex flex-wrap items-start gap-x-1 gap-y-2">
          {steps.map((s, i) => (
            <li key={s.seq} className="flex min-w-0 max-w-full items-start gap-1 has-[details[open]]:basis-full">
              {i > 0 ? <ChevronRight aria-hidden className="mt-2.5 h-3.5 w-3.5 shrink-0 text-sub" /> : null}
              <details className="group min-w-0 flex-1">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] hover:bg-panel [&::-webkit-details-marker]:hidden [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
                    s.tone === "bad" ? "border-bad/40 bg-bad/5 text-bad" : s.tone === "good" ? "border-good/30 text-good" : "border-line text-ink"
                  )}
                >
                  {s.icon}
                  <span className="font-mono text-[11.5px] font-medium">{s.title}</span>
                  {s.line ? <span className={cn("truncate", !s.tone && "text-sub")}>{s.line}</span> : null}
                  <a href={`#event-${s.seq}`} className="font-mono text-[11px] text-brand underline-offset-4 hover:underline">#{s.seq}</a>
                </summary>
                <div className="mt-2 space-y-2">
                  {(s.detail ?? [{ label: "Event", value: bodies.get(s.seq) }]).map((d) => (
                    <div key={d.label}>
                      <p className="text-[11.5px] font-medium text-sub">{d.label}</p>
                      <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-panel p-3 font-mono text-[11px] leading-relaxed">{json(d.value)}</pre>
                    </div>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
