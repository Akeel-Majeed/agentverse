"use client";

import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveChange, rejectChange } from "@/lib/data";
import type { PendingChange, PendingSource } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ApprovalContextValue {
  items: PendingChange[];
  approve: (id: string, value?: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function ApprovalProvider({ initial, children }: { initial: PendingChange[]; children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  const update = useCallback((next: PendingChange | null) => {
    if (next) setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    router.refresh();
  }, [router]);

  const value = useMemo<ApprovalContextValue>(
    () => ({
      items,
      approve: async (id, v) => {
        const result = await approveChange(id, v).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
        if (!result.ok) throw new Error(result.error);
        update(result.item);
      },
      reject: async (id) => update(await rejectChange(id)),
    }),
    [items, update]
  );

  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>;
}

export function useApprovals(): ApprovalContextValue {
  const ctx = useContext(ApprovalContext);
  if (!ctx) throw new Error("useApprovals must be used inside ApprovalProvider");
  return ctx;
}

export function usePendingCount(): number {
  return useApprovals().items.filter((i) => i.status === "pending").length;
}

export const SOURCE_LABELS: Record<PendingSource, string> = {
  onboarding: "Onboarding · document read",
  freshness: "Freshness check",
  imessage: "iMessage reply",
  mcp: "Adviser agent · via MCP",
  companies_house: "Companies House",
};

export function ApprovalQueueItem({
  item,
  onApprove,
  onReject,
}: {
  item: PendingChange;
  onApprove: (value?: string) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const isFreshness = item.source === "freshness";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.currentValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resolved = item.status !== "pending";
  const changed = item.proposedValue !== item.currentValue;

  return (
    <li className={cn("flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0", resolved && "opacity-70")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-sub">
          {SOURCE_LABELS[item.source]}
        </span>
        {item.receivedAt ? <span className="text-[12px] text-sub tabular">{item.receivedAt}</span> : null}
      </div>
      <div>
        <p className="text-[14px] font-semibold tracking-tight">{item.field}</p>
        <p className="mt-1 text-[12.5px] tabular">
          {isFreshness ? (
            <span>
              On record: <span className="font-medium text-ink">{item.currentValue}</span>
            </span>
          ) : (
            <>
              <span className="text-sub line-through decoration-line-strong">{item.currentValue}</span>
              <span className="px-1.5 text-sub" aria-label="changes to">→</span>
              <span className="font-medium text-ink">{item.proposedValue}</span>
            </>
          )}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{item.reason}</p>
      </div>

      <div aria-live="polite">
        {error ? <p className="mb-2 text-[12px] font-medium text-bad">{error}</p> : null}
        {resolved ? (
          <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink">
            {item.status === "approved" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
            {item.status === "rejected"
              ? "Rejected · kept as is"
              : isFreshness
                ? changed
                  ? `Updated to ${item.proposedValue}`
                  : "Confirmed still unbought"
                : "Approved · saved to your profile"}
          </p>
        ) : editing ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => onApprove(draft.trim() || item.currentValue));
            }}
          >
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor={inputId} className="text-[12px] text-sub">
                New value for {item.field.toLowerCase()}
              </label>
              <Input id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 text-[13px]" autoFocus />
            </div>
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {isFreshness ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => run(() => onApprove())}>
                  Still unbought
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                  Update
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => run(() => onApprove())}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(onReject)}>
                  Reject
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ApprovalQueue({ limit, emptyText = "Nothing waiting for you." }: { limit?: number; emptyText?: string }) {
  const { items, approve, reject } = useApprovals();
  const visible = limit ? items.slice(0, limit) : items;
  if (visible.length === 0) return <p className="text-[13px] text-sub">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line">
      {visible.map((item) => (
        <ApprovalQueueItem
          key={item.id}
          item={item}
          onApprove={(v) => approve(item.id, v)}
          onReject={() => reject(item.id)}
        />
      ))}
    </ul>
  );
}

export function PendingCounter() {
  const count = usePendingCount();
  return (
    <span
      aria-label={`${count} waiting`}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-hover px-1.5 text-[11.5px] font-semibold text-ink tabular"
    >
      {count}
    </span>
  );
}
