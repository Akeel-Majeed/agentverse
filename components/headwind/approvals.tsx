"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveChange, rejectChange, rerunAssessment, undoChange } from "@/lib/data";
import type { PendingChange, PendingSource } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AssessmentState = "current" | "pending" | "running" | "updated";

interface ApprovalContextValue {
  items: PendingChange[];
  /** Ids with a request in flight; their controls are disabled to prevent double submission. */
  busy: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  approve: (id: string, value?: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  undo: (id: string) => Promise<void>;
  assessment: { state: AssessmentState; ranAt: string; includedIds: ReadonlySet<string> };
  rerun: () => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function ApprovalProvider({
  initial,
  assessedAt,
  children,
}: {
  initial: PendingChange[];
  assessedAt: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assessment, setAssessment] = useState<ApprovalContextValue["assessment"]>({
    state: "current",
    ranAt: assessedAt,
    includedIds: new Set(),
  });
  const inflight = useRef(new Set<string>());

  const run = useCallback(async (id: string, fn: () => Promise<PendingChange | null>) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    setBusy(new Set(inflight.current));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const next = await fn();
      if (next) {
        setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
        setAssessment((a) => ({
          ...a,
          state: a.state === "running" ? a.state : "pending",
          includedIds: new Set(Array.from(a.includedIds).filter((x) => x !== id)),
        }));
      }
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "The update couldn't be saved." }));
    } finally {
      inflight.current.delete(id);
      setBusy(new Set(inflight.current));
    }
  }, []);

  const rerun = useCallback(async () => {
    if (inflight.current.has("__rerun")) return;
    inflight.current.add("__rerun");
    setAssessment((a) => ({ ...a, state: "running" }));
    const resolvedIds = items.filter((i) => i.status !== "pending").map((i) => i.id);
    try {
      const meta = await rerunAssessment();
      setAssessment({ state: "updated", ranAt: meta.updatedAt, includedIds: new Set(resolvedIds) });
    } finally {
      inflight.current.delete("__rerun");
    }
  }, [items]);

  const value = useMemo<ApprovalContextValue>(
    () => ({
      items,
      busy,
      errors,
      approve: (id, v) => run(id, () => approveChange(id, v)),
      reject: (id) => run(id, () => rejectChange(id)),
      undo: (id) => run(id, () => undoChange(id)),
      assessment,
      rerun,
    }),
    [items, busy, errors, run, assessment, rerun]
  );

  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>;
}

export function useApprovals(): ApprovalContextValue {
  const ctx = useContext(ApprovalContext);
  if (!ctx) throw new Error("useApprovals must be used inside ApprovalProvider");
  return ctx;
}

export function usePendingCount(kind?: "freshness" | "proposal"): number {
  return useApprovals().items.filter((i) => i.status === "pending" && (!kind || kindOf(i) === kind)).length;
}

export const kindOf = (item: PendingChange): "freshness" | "proposal" => (item.source === "freshness" ? "freshness" : "proposal");

export const SOURCE_LABELS: Record<PendingSource, string> = {
  onboarding: "Read from a document you uploaded",
  freshness: "Headwind freshness check",
  imessage: "Your iMessage reply",
  mcp: "From your adviser's connected service",
  companies_house: "Companies House",
};

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function resolvedText(item: PendingChange, isFreshness: boolean): string {
  if (item.status === "rejected") return `Rejected. ${item.field} stays at ${item.currentValue}.`;
  if (isFreshness) {
    return item.proposedValue === item.currentValue
      ? `Confirmed: ${item.field.toLowerCase()} is still ${item.currentValue}.`
      : `Updated: ${item.field.toLowerCase()} is now ${item.proposedValue} (was ${item.currentValue}).`;
  }
  return `Approved: ${item.field.toLowerCase()} is now ${item.proposedValue} (was ${item.currentValue}).`;
}

export function AssessmentNote({ id }: { id: string }) {
  const { assessment } = useApprovals();
  if (assessment.state === "running") return <>Reassessment running…</>;
  if (assessment.includedIds.has(id)) {
    return <>Included in the re-run at {assessment.ranAt}. In this demo the sample figures stay the same.</>;
  }
  return <>Not in the figures yet: it is included at the next assessment. Re-run it from the dashboard.</>;
}

export function ApprovalQueueItem({ item, headingLevel = "h3" }: { item: PendingChange; headingLevel?: "h3" | "h4" }) {
  const { approve, reject, undo, busy: busyIds, errors } = useApprovals();
  const isFreshness = kindOf(item) === "freshness";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.currentValue);
  const [lastAction, setLastAction] = useState<null | (() => Promise<void>)>(null);
  const inputId = useId();
  const busy = busyIds.has(item.id);
  const error = errors[item.id];
  const Heading = headingLevel;

  const act = (fn: () => Promise<void>) => {
    setLastAction(() => fn);
    void fn().then(() => setEditing(false));
  };

  const resolved = item.status !== "pending";

  return (
    <li className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[12px] font-medium text-sub">{SOURCE_LABELS[item.source]}</span>
        {item.receivedAt ? <span className="font-mono text-[11px] text-sub">Received {item.receivedAt}</span> : null}
      </div>
      <div>
        <Heading className="text-[14px] font-semibold tracking-tight">{item.field}</Heading>
        {isFreshness ? (
          <p className="mt-1 text-[13px]">
            On record: <span className="font-mono font-medium tabular">{item.currentValue}</span>
          </p>
        ) : (
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
            <dt className="text-sub">Current</dt>
            <dd className="font-mono tabular">{item.currentValue}</dd>
            <dt className="text-sub">Proposed</dt>
            <dd className="font-mono font-medium tabular">{item.proposedValue}</dd>
          </dl>
        )}
        <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{item.reason}</p>
        {item.impact ? (
          <p className="mt-1 text-[13px] leading-relaxed">
            <span className="text-sub">If {isFreshness ? "updated" : "approved"}: </span>
            {item.impact}
            {item.riskId ? (
              <>
                {" "}
                <Link href={`/risks/${item.riskId}`} className="rounded-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View risk
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-bad">
            <span className="min-w-0 flex-1">{error}</span>
            {lastAction ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(lastAction)}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}
        {resolved ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-start gap-1.5 text-[13px] font-medium text-ink">
                {item.status === "approved" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span>
                  {resolvedText(item, isFreshness)}
                  {item.resolvedAt ? <span className="font-normal text-sub"> {timeFormat.format(new Date(item.resolvedAt))}</span> : null}
                </span>
              </p>
              {item.status === "approved" ? (
                <p className="mt-0.5 pl-5 text-[12.5px] text-sub">
                  <AssessmentNote id={item.id} />
                </p>
              ) : null}
            </div>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => undo(item.id))} aria-label={`Undo: ${item.field}`}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
              Undo
            </Button>
          </div>
        ) : editing ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = draft.trim() || item.currentValue;
              act(() => approve(item.id, v));
            }}
          >
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor={inputId} className="text-[12px] text-sub">
                New value for {item.field.toLowerCase()}
              </label>
              <Input id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 font-mono text-[13px]" autoFocus />
            </div>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Saving…" : "Save value"}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {isFreshness ? (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => approve(item.id))}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  {busy ? "Saving…" : `Still ${item.currentValue}`}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                  Update value
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => approve(item.id))}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  {busy ? "Saving…" : "Approve proposed update"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => reject(item.id))} className="border border-line">
                  <X aria-hidden />
                  Reject proposed update
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * A list of changes. `ids` fixes which items show (and their order) so resolved items stay in place
 * with their result; otherwise every item matching `kind` is shown, pending first.
 */
export function ApprovalQueue({
  ids,
  kind,
  emptyText = "Nothing waiting for you.",
  className,
}: {
  ids?: string[];
  kind?: "freshness" | "proposal";
  emptyText?: string;
  className?: string;
}) {
  const { items } = useApprovals();
  const [order] = useState(() =>
    ids ?? [...items].sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending")).map((i) => i.id)
  );
  const visible = order
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is PendingChange => !!i && (!kind || kindOf(i) === kind));
  if (visible.length === 0) return <p className="text-[13px] text-sub">{emptyText}</p>;
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {visible.map((item) => (
        <ApprovalQueueItem key={item.id} item={item} />
      ))}
    </ul>
  );
}

export function PendingCounter({ kind }: { kind?: "freshness" | "proposal" }) {
  const count = usePendingCount(kind);
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-[11px] font-semibold text-white tabular"
    >
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

export function PendingCountText() {
  const total = usePendingCount();
  return <>{total === 0 ? "None waiting" : `${total} waiting`}</>;
}

/** Live count text, e.g. "5 waiting: 1 freshness check, 4 proposed updates". */
export function PendingSummary({ short = false }: { short?: boolean }) {
  const total = usePendingCount();
  const fresh = usePendingCount("freshness");
  const proposals = total - fresh;
  const parts = `${fresh} freshness check${fresh === 1 ? "" : "s"}, ${proposals} proposed update${proposals === 1 ? "" : "s"}`;
  if (total === 0) return <>Nothing waiting</>;
  return <>{short ? parts : `${total} waiting: ${parts}`}</>;
}
