import "server-only";
/**
 * Agent runs, observations, trace events and controls.
 * - memory: default, and always in tests
 * - supabase (secret key): only when AGENT_TABLES=1 (migration 0003 applied)
 * - postgres as risk_agent: when RISK_AGENT_DATABASE_URL is set (restricted role, no profile writes)
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { EventSink } from "../trace/chain";
import {
  DEFAULT_CONTROLS,
  type AgentProposal,
  type AgentRun,
  type Controls,
  type Observation,
  type ScreenCheck,
  type TraceEvent,
} from "../trace/types";

export type NewRun = Pick<AgentRun, "farmId" | "trigger" | "asOf" | "seed" | "engineVersion" | "configHash">;

export interface AgentStore extends EventSink {
  kind: "memory" | "supabase" | "postgres";
  createRun(r: NewRun): Promise<AgentRun>;
  updateRun(id: string, patch: Partial<AgentRun>): Promise<void>;
  getRun(id: string): Promise<AgentRun | null>;
  latestRun(farmId: string): Promise<AgentRun | null>;
  /** Atomically moves the oldest queued run to running. */
  claimQueuedRun(): Promise<AgentRun | null>;
  insertObservation(o: Omit<Observation, "id">): Promise<Observation>;
  getObservations(runId: string): Promise<Observation[]>;
  /** Passed documents for the farm across runs, newest first. */
  getDocuments(farmId: string): Promise<Observation[]>;
  getEvents(runId: string): Promise<TraceEvent[]>;
  getControls(): Promise<Controls>;
  setPaused(paused: boolean, by: string): Promise<void>;
  insertProposal(p: AgentProposal & { farmId: string }): Promise<void>;
}

export function createMemoryAgentStore(onProposal?: (p: AgentProposal & { farmId: string }) => Promise<void>): AgentStore {
  const runs = new Map<string, AgentRun>();
  const observations: Observation[] = [];
  const events: TraceEvent[] = [];
  let controls: Controls = { ...DEFAULT_CONTROLS };
  return {
    kind: "memory",
    async createRun(r) {
      const run: AgentRun = {
        ...r, id: crypto.randomUUID(), promptVersion: null, model: null, status: "numbers_only",
        totalCostUsd: null, inputTokens: null, outputTokens: null, turns: null, timings: {},
        startedAt: new Date().toISOString(), endedAt: null, error: null,
      };
      runs.set(run.id, run);
      return run;
    },
    async updateRun(id, patch) {
      const r = runs.get(id);
      if (r) runs.set(id, { ...r, ...patch });
    },
    async getRun(id) { return runs.get(id) ?? null; },
    async latestRun(farmId) {
      return Array.from(runs.values()).filter((r) => r.farmId === farmId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
    },
    async claimQueuedRun() {
      const r = Array.from(runs.values()).filter((x) => x.status === "queued").sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
      if (!r) return null;
      const claimed = { ...r, status: "running" as const };
      runs.set(r.id, claimed);
      return claimed;
    },
    async insertObservation(o) {
      const obs = { ...o, id: crypto.randomUUID() };
      observations.push(obs);
      return obs;
    },
    async getObservations(runId) { return observations.filter((o) => o.runId === runId); },
    async getDocuments(farmId) {
      return observations.filter((o) => o.farmId === farmId && o.kind === "document" && o.screenStatus === "passed").reverse();
    },
    async insertEvent(e) {
      if (events.some((x) => x.runId === e.runId && x.seq === e.seq)) throw new Error("duplicate seq");
      events.push(e);
    },
    async getEvents(runId) { return events.filter((e) => e.runId === runId).sort((a, b) => a.seq - b.seq); },
    async getControls() { return controls; },
    async setPaused(paused, by) { controls = { ...controls, paused, updatedBy: by, updatedAt: new Date().toISOString() }; },
    async insertProposal(p) { await onProposal?.(p); },
  };
}

/** One memory store per server process (globalThis survives Next.js hot reload). */
export async function getAgentStore(): Promise<AgentStore> {
  const g = globalThis as { __agentStore?: AgentStore };
  if (process.env.RISK_AGENT_DATABASE_URL) return (g.__agentStore ??= await createPostgresAgentStore(process.env.RISK_AGENT_DATABASE_URL));
  if (process.env.AGENT_TABLES === "1" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return (g.__agentStore ??= createSupabaseAgentStore());
  }
  const { getStore } = await import("./store");
  return (g.__agentStore ??= createMemoryAgentStore(async (p) => (await getStore()).insertPendingChange({
    fieldKey: p.fieldKey, field: p.fieldLabel, currentValue: p.currentValue, proposedValue: p.proposedValue,
    source: "agent", reason: p.reason, status: "pending",
  })));
}

/* ---------- Database stores (column names from supabase/migrations/0003_agent_runs.sql) ---------- */

type Row = Record<string, unknown>;

/** postgres.js returns Date for date/timestamptz columns, supabase-js returns strings. */
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown) => (v === null || v === undefined ? null : iso(v));
/** numeric comes back as a string from both clients. */
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));
/** camelCase keys to snake_case columns, dropping undefined. */
const snake = (o: object): Row =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v])
  );

const toRun = (r: Row): AgentRun => ({
  id: String(r.id),
  farmId: String(r.farm_id),
  trigger: r.trigger as AgentRun["trigger"],
  asOf: iso(r.as_of).slice(0, 10),
  seed: Number(r.seed),
  engineVersion: String(r.engine_version),
  configHash: String(r.config_hash),
  promptVersion: strOrNull(r.prompt_version),
  model: strOrNull(r.model),
  status: r.status as AgentRun["status"],
  totalCostUsd: numOrNull(r.total_cost_usd),
  inputTokens: numOrNull(r.input_tokens),
  outputTokens: numOrNull(r.output_tokens),
  turns: numOrNull(r.turns),
  timings: (r.timings as Record<string, number> | null) ?? {},
  startedAt: iso(r.started_at),
  endedAt: isoOrNull(r.ended_at),
  error: strOrNull(r.error),
});

const toObservation = (r: Row): Observation => ({
  id: String(r.id),
  runId: String(r.run_id),
  farmId: String(r.farm_id),
  kind: r.kind as Observation["kind"],
  source: String(r.source),
  url: strOrNull(r.url),
  fetchedAt: iso(r.fetched_at),
  value: r.value,
  sha256: String(r.sha256),
  screenStatus: r.screen_status as Observation["screenStatus"],
  screen: (r.screen as ScreenCheck[] | null) ?? null,
});

const toEvent = (r: Row): TraceEvent => ({
  runId: String(r.run_id),
  seq: Number(r.seq),
  type: String(r.type),
  actor: r.actor as TraceEvent["actor"],
  body: String(r.body),
  prevHash: String(r.prev_hash),
  hash: String(r.hash),
  createdAt: iso(r.created_at),
});

const toControls = (r: Row | undefined | null): Controls =>
  r
    ? {
        paused: Boolean(r.paused),
        maxTurns: Number(r.max_turns),
        maxBudgetUsd: Number(r.max_budget_usd),
        maxProposalsPerRun: Number(r.max_proposals_per_run),
        jevThreshold: Number(r.jev_threshold),
        zThreshold: Number(r.z_threshold),
        updatedAt: iso(r.updated_at),
        updatedBy: strOrNull(r.updated_by),
      }
    : { ...DEFAULT_CONTROLS };

const proposalRow = (p: AgentProposal & { farmId: string }): Row => ({
  farm_id: p.farmId,
  field_key: p.fieldKey,
  field_label: p.fieldLabel,
  current_value: p.currentValue,
  proposed_value: p.proposedValue,
  source: "agent",
  reason: p.reason,
  status: "pending",
  run_id: p.runId,
  evidence: p.evidence,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase agent store: ${what}: ${res.error.message}`);
  return res.data;
}

export function createSupabaseAgentStore(): AgentStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/, "");
  const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    kind: "supabase",
    async createRun(r) {
      return toRun(check(await db.from("agent_runs").insert(snake(r)).select().single(), "create run")!);
    },
    async updateRun(id, patch) {
      check(await db.from("agent_runs").update(snake({ ...patch, id: undefined })).eq("id", id), "update run");
    },
    async getRun(id) {
      const row = check(await db.from("agent_runs").select().eq("id", id).maybeSingle(), "get run");
      return row ? toRun(row) : null;
    },
    async latestRun(farmId) {
      const row = check(
        await db.from("agent_runs").select().eq("farm_id", farmId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
        "latest run"
      );
      return row ? toRun(row) : null;
    },
    async claimQueuedRun() {
      // ponytail: select then conditional update; an empty update means another worker took it. The postgres store does it in one statement.
      const candidate = check(
        await db.from("agent_runs").select("id").eq("status", "queued").order("started_at").limit(1).maybeSingle(),
        "find queued run"
      );
      if (!candidate) return null;
      const rows = check(
        await db.from("agent_runs").update({ status: "running" }).eq("id", candidate.id).eq("status", "queued").select(),
        "claim run"
      );
      return rows?.[0] ? toRun(rows[0]) : null;
    },
    async insertObservation(o) {
      return toObservation(check(await db.from("observations").insert(snake(o)).select().single(), "insert observation")!);
    },
    async getObservations(runId) {
      return (check(await db.from("observations").select().eq("run_id", runId), "observations") ?? []).map(toObservation);
    },
    async getDocuments(farmId) {
      const rows = check(
        await db
          .from("observations")
          .select()
          .eq("farm_id", farmId)
          .eq("kind", "document")
          .eq("screen_status", "passed")
          .order("fetched_at", { ascending: false }),
        "documents"
      );
      return (rows ?? []).map(toObservation);
    },
    async insertEvent(e) {
      check(await db.from("agent_events").insert(snake(e)), "insert event");
    },
    async getEvents(runId) {
      return (check(await db.from("agent_events").select().eq("run_id", runId).order("seq"), "events") ?? []).map(toEvent);
    },
    async getControls() {
      return toControls(check(await db.from("agent_controls").select().eq("id", true).maybeSingle(), "controls"));
    },
    async setPaused(paused, by) {
      check(
        await db.from("agent_controls").update({ paused, updated_by: by, updated_at: new Date().toISOString() }).eq("id", true),
        "set paused"
      );
    },
    async insertProposal(p) {
      check(await db.from("pending_changes").insert(proposalRow(p)), "insert proposal");
    },
  };
}

/** Connects as the restricted risk_agent role. jsonb values go through sql.json so arrays aren't sent as Postgres arrays. */
export async function createPostgresAgentStore(url: string): Promise<AgentStore> {
  const sql = postgres(url, { max: 2 });
  const json = (v: unknown) => sql.json(v as postgres.JSONValue);
  return {
    kind: "postgres",
    async createRun(r) {
      const [row] = await sql`insert into agent_runs ${sql(snake(r))} returning *`;
      return toRun(row);
    },
    async updateRun(id, patch) {
      const { timings, ...rest } = patch;
      const row = snake({ ...rest, id: undefined });
      if (timings) row.timings = json(timings);
      if (Object.keys(row).length) await sql`update agent_runs set ${sql(row)} where id = ${id}`;
    },
    async getRun(id) {
      const [row] = await sql`select * from agent_runs where id = ${id}`;
      return row ? toRun(row) : null;
    },
    async latestRun(farmId) {
      const [row] = await sql`select * from agent_runs where farm_id = ${farmId} order by started_at desc limit 1`;
      return row ? toRun(row) : null;
    },
    async claimQueuedRun() {
      const [row] = await sql`
        update agent_runs set status = 'running'
        where id = (select id from agent_runs where status = 'queued' order by started_at limit 1 for update skip locked)
        returning *`;
      return row ? toRun(row) : null;
    },
    async insertObservation(o) {
      const row = { ...snake(o), value: json(o.value ?? null), screen: o.screen ? json(o.screen) : null };
      const [inserted] = await sql`insert into observations ${sql(row)} returning *`;
      return toObservation(inserted);
    },
    async getObservations(runId) {
      return (await sql`select * from observations where run_id = ${runId}`).map(toObservation);
    },
    async getDocuments(farmId) {
      const rows = await sql`
        select * from observations
        where farm_id = ${farmId} and kind = 'document' and screen_status = 'passed'
        order by fetched_at desc`;
      return rows.map(toObservation);
    },
    async insertEvent(e) {
      await sql`insert into agent_events ${sql(snake(e))}`;
    },
    async getEvents(runId) {
      return (await sql`select * from agent_events where run_id = ${runId} order by seq`).map(toEvent);
    },
    async getControls() {
      const [row] = await sql`select * from agent_controls where id = true`;
      return toControls(row);
    },
    async setPaused(paused, by) {
      await sql`update agent_controls set paused = ${paused}, updated_by = ${by}, updated_at = now() where id = true`;
    },
    async insertProposal(p) {
      await sql`insert into pending_changes ${sql({ ...proposalRow(p), evidence: json(p.evidence) })}`;
    },
  };
}
