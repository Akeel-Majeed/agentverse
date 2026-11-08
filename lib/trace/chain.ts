import { createHash } from "node:crypto";
import type { Actor, TraceEvent } from "./types";

export const GENESIS = "0".repeat(64);

/** JSON with keys sorted at every depth, so the same value always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const nextHash = (prev: string, body: string) => sha256(prev + body);

export interface EventSink {
  insertEvent(e: TraceEvent): Promise<void>;
}

/** Appends events one at a time (single writer per run), even if callers don't await each other. */
export class TraceWriter {
  private seq = 0;
  private prev = GENESIS;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly runId: string, private sink: EventSink) {}

  /** Continue a run's chain from its last stored event. */
  static resume(runId: string, sink: EventSink, lastSeq: number, lastHash: string): TraceWriter {
    const w = new TraceWriter(runId, sink);
    w.seq = lastSeq;
    w.prev = lastHash;
    return w;
  }

  append(type: string, actor: Actor, payload: unknown): Promise<TraceEvent> {
    const next = this.queue.then(async () => {
      const body = canonical(payload);
      const e: TraceEvent = {
        runId: this.runId, seq: ++this.seq, type, actor, body,
        prevHash: this.prev, hash: nextHash(this.prev, body), createdAt: new Date().toISOString(),
      };
      await this.sink.insertEvent(e);
      this.prev = e.hash;
      return e;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  head(): string {
    return this.prev;
  }
}

/** Recomputes the chain. `brokenAt` is the first seq whose hash or link doesn't match. */
export function verifyChain(events: TraceEvent[]): { ok: boolean; head: string; brokenAt?: number } {
  let prev = GENESIS;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.prevHash !== prev || e.hash !== nextHash(prev, e.body)) return { ok: false, head: prev, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, head: prev };
}
