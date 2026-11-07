import "server-only";
/**
 * Where the data layer reads and writes. Supabase when NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SECRET_KEY are set, otherwise an in-memory copy of the demo data (resets when the
 * server restarts). Server-side only: the secret key never reaches the browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as mock from "../mock";
import * as demo from "../profile/fenland-ridge";
import { makeSnapshot } from "../profile/risk-profile";
import type {
  AssessmentMeta,
  BreakEven,
  Farm,
  MarketBaseline,
  PendingChange,
  ProfileFieldValue,
  ProfileSnapshot,
  ProfitSummary,
  RiskResult,
  Signal,
} from "../types";

export const FARM_ID = demo.FARM_ID;

export interface Assessment {
  id: string;
  snapshotId: string;
  meta: AssessmentMeta;
  profit: ProfitSummary;
  breakEvens: BreakEven[];
  topMitigationIds: string[];
  risks: RiskResult[];
}

export interface Store {
  kind: "supabase" | "mock";
  getFarm(): Promise<Farm>;
  getAssessment(): Promise<Assessment>;
  insertAssessment(a: Omit<Assessment, "id">, createdAt: string): Promise<void>;
  getProfileFields(): Promise<ProfileFieldValue[]>;
  saveProfileFields(fields: ProfileFieldValue[]): Promise<void>;
  getSectionConfirmations(): Promise<Record<string, string>>;
  confirmSection(id: string, at: string): Promise<void>;
  getSnapshot(): Promise<ProfileSnapshot>;
  insertSnapshot(s: ProfileSnapshot): Promise<void>;
  getMarket(): Promise<MarketBaseline>;
  /** Signals published after `since`, newest first. */
  getSignals(since: string): Promise<Signal[]>;
  getPendingChanges(): Promise<PendingChange[]>;
  updatePendingChange(id: string, status: PendingChange["status"], proposedValue?: string): Promise<PendingChange | null>;
}

/* ---------- In-memory demo store ---------- */

const clone = <T>(v: T): T => structuredClone(v);

function createMockStore(): Store {
  const firstSnapshot = makeSnapshot({
    id: "snapshot-1",
    version: 1,
    takenAt: demo.SNAPSHOT_AT,
    reason: "Onboarding confirmed",
    fields: demo.profileFields,
    market: demo.market,
  });
  const state = {
    fields: clone(demo.profileFields),
    confirmations: clone(demo.sectionConfirmations),
    snapshots: [firstSnapshot],
    assessments: [
      {
        id: "assessment-1",
        snapshotId: firstSnapshot.id,
        meta: clone(mock.meta),
        profit: clone(mock.profit),
        breakEvens: clone(mock.breakEvens),
        topMitigationIds: [...mock.topMitigationIds],
        risks: clone(mock.risks),
      },
    ] as Assessment[],
    pending: clone(mock.pendingChanges),
  };

  return {
    kind: "mock",
    getFarm: async () => clone(mock.farm),
    getAssessment: async () => clone(state.assessments.at(-1)!),
    insertAssessment: async (a) => {
      state.assessments.push({ ...clone(a), id: `assessment-${state.assessments.length + 1}` });
    },
    getProfileFields: async () => clone(state.fields),
    saveProfileFields: async (fields) => {
      for (const f of fields) {
        const i = state.fields.findIndex((x) => x.key === f.key);
        if (i === -1) state.fields.push(clone(f));
        else state.fields[i] = clone(f);
      }
    },
    getSectionConfirmations: async () => clone(state.confirmations),
    confirmSection: async (id, at) => {
      state.confirmations[id] = at;
    },
    getSnapshot: async () => clone(state.snapshots.at(-1)!),
    insertSnapshot: async (s) => {
      state.snapshots.push(clone(s));
    },
    getMarket: async () => clone(state.snapshots.at(-1)!.market),
    getSignals: async (since) =>
      clone(demo.signals.filter((s) => s.publishedAt > since).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))),
    getPendingChanges: async () => clone(state.pending),
    updatePendingChange: async (id, status, proposedValue) => {
      const item = state.pending.find((p) => p.id === id);
      if (!item) return null;
      item.status = status;
      if (proposedValue !== undefined) item.proposedValue = proposedValue;
      return clone(item);
    },
  };
}

/* ---------- Supabase store ---------- */

type Row = Record<string, unknown>;

const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" });
const DATE_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

/** "Today 06:00" or "Fri 17:42", as the approval queue shows it. */
function receivedLabel(iso: string): string {
  const d = new Date(iso);
  const day = DATE_KEY.format(d) === DATE_KEY.format(new Date()) ? "Today" : DAY_FMT.format(d);
  return `${day} ${TIME_FMT.format(d)}`;
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`Supabase: ${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`Supabase: ${what}: no data`);
  return result.data as NonNullable<T>;
}

const toPending = (r: Row): PendingChange => ({
  id: String(r.id),
  fieldKey: (r.field_key as string | null) ?? undefined,
  field: String(r.field_label),
  currentValue: String(r.current_value),
  proposedValue: String(r.proposed_value),
  source: r.source as PendingChange["source"],
  reason: String(r.reason),
  status: r.status as PendingChange["status"],
  receivedAt: receivedLabel(String(r.received_at)),
});

const toSnapshot = (r: Row): ProfileSnapshot => ({
  id: String(r.id),
  version: Number(r.version),
  takenAt: String(r.taken_at),
  reason: String(r.reason),
  fields: r.fields as ProfileSnapshot["fields"],
  market: r.market as MarketBaseline,
  exposures: r.exposures as ProfileSnapshot["exposures"],
});

const toSignal = (r: Row): Signal => ({
  id: String(r.id),
  riskId: r.risk_id as Signal["riskId"],
  kind: r.kind as Signal["kind"],
  title: String(r.title),
  summary: String(r.summary),
  source: String(r.source),
  url: (r.url as string | null) ?? undefined,
  publishedAt: String(r.published_at),
  metric: (r.metric as Signal["metric"]) ?? null,
  value: r.value === null || r.value === undefined ? null : Number(r.value),
});

function createSupabaseStore(db: SupabaseClient): Store {
  const farm = FARM_ID;
  return {
    kind: "supabase",
    async getFarm() {
      const r = must(await db.from("farms").select("*").eq("id", farm).single(), "farm");
      return { id: r.id, name: r.name, hectares: Number(r.hectares), location: r.location, crops: r.crops };
    },
    async getAssessment() {
      const r = must(await db.from("latest_assessment").select("*").eq("farm_id", farm).single(), "latest assessment");
      return { id: r.id, snapshotId: r.snapshot_id, ...r.summary, risks: r.risks };
    },
    async insertAssessment(a, createdAt) {
      const { snapshotId, risks, ...summary } = a;
      const { error } = await db.from("assessments").insert({
        farm_id: farm,
        snapshot_id: snapshotId,
        created_at: createdAt,
        harvest_year: a.meta.harvestYear,
        summary,
        risks,
      });
      if (error) throw new Error(`Supabase: save assessment: ${error.message}`);
    },
    async getProfileFields() {
      const rows = must(await db.from("profile_fields").select("*").eq("farm_id", farm), "profile fields");
      return rows.map((r: Row) => ({
        key: String(r.key),
        value: (r.value as ProfileFieldValue["value"]) ?? null,
        source: String(r.source),
        confidence: r.confidence as ProfileFieldValue["confidence"],
        confirmedAt: (r.confirmed_at as string | null) ?? null,
        validUntil: (r.valid_until as string | null) ?? null,
      }));
    },
    async saveProfileFields(fields) {
      const { error } = await db.from("profile_fields").upsert(
        fields.map((f) => ({
          farm_id: farm,
          key: f.key,
          value: f.value,
          source: f.source,
          confidence: f.confidence,
          confirmed_at: f.confirmedAt,
          valid_until: f.validUntil,
          updated_at: new Date().toISOString(),
        }))
      );
      if (error) throw new Error(`Supabase: save profile: ${error.message}`);
    },
    async getSectionConfirmations() {
      const rows = must(await db.from("profile_sections").select("*").eq("farm_id", farm), "section confirmations");
      return Object.fromEntries(rows.map((r: Row) => [String(r.section_id), String(r.confirmed_at)]));
    },
    async confirmSection(id, at) {
      const { error } = await db.from("profile_sections").upsert({ farm_id: farm, section_id: id, confirmed_at: at });
      if (error) throw new Error(`Supabase: confirm section: ${error.message}`);
    },
    async getSnapshot() {
      return toSnapshot(must(await db.from("latest_snapshot").select("*").eq("farm_id", farm).single(), "latest snapshot"));
    },
    async insertSnapshot(s) {
      const { error } = await db.from("profile_snapshots").insert({
        id: s.id,
        farm_id: farm,
        version: s.version,
        taken_at: s.takenAt,
        reason: s.reason,
        fields: s.fields,
        market: s.market,
        exposures: s.exposures,
      });
      if (error) throw new Error(`Supabase: save snapshot: ${error.message}`);
    },
    async getMarket() {
      return (await this.getSnapshot()).market;
    },
    async getSignals(since) {
      const rows = must(
        await db
          .from("signals")
          .select("*")
          .or(`farm_id.is.null,farm_id.eq.${farm}`)
          .gt("published_at", since)
          .order("published_at", { ascending: false }),
        "signals"
      );
      return rows.map(toSignal);
    },
    async getPendingChanges() {
      const rows = must(
        await db.from("pending_changes").select("*").eq("farm_id", farm).order("received_at", { ascending: false }),
        "pending changes"
      );
      return rows.map(toPending);
    },
    async updatePendingChange(id, status, proposedValue) {
      const patch: Row = { status, resolved_at: status === "pending" ? null : new Date().toISOString() };
      if (proposedValue !== undefined) patch.proposed_value = proposedValue;
      const { data, error } = await db.from("pending_changes").update(patch).eq("farm_id", farm).eq("id", id).select("*").maybeSingle();
      if (error) throw new Error(`Supabase: update pending change: ${error.message}`);
      return data ? toPending(data) : null;
    },
  };
}

/* ---------- Choosing a store ---------- */

let supabaseStore: Store | undefined;
let mockStore: Store | undefined;
let retryAt = 0;
let checking: Promise<Store | undefined> | undefined;

/**
 * Supabase if configured and reachable, otherwise the demo store. If the tables are missing
 * (migration not run yet) the app logs a warning, keeps working on demo data and checks
 * again a minute later.
 */
export async function getStore(): Promise<Store> {
  if (supabaseStore) return supabaseStore;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key && Date.now() >= retryAt) {
    // One check at a time, however many reads a page makes at once.
    checking ??= (async () => {
      const db = createClient(url.replace(/\/rest\/v1\/?$/, ""), key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await db.from("latest_assessment").select("id").eq("farm_id", FARM_ID).limit(1).single();
      if (!error) return (supabaseStore = createSupabaseStore(db));
      retryAt = Date.now() + 60_000;
      console.warn(`[data] Supabase is configured but not ready (${error.message}). Using demo data. Run supabase/migrations/*.sql, then supabase/seed.sql.`);
      return undefined;
    })().finally(() => {
      checking = undefined;
    });
    const found = await checking;
    if (found) return found;
  }
  return (mockStore ??= createMockStore());
}
