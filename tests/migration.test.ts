import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const f of ["0001_risk_profile.sql", "0002_chat_log.sql", "0003_agent_runs.sql"]) await db.exec(sql(f));
  await db.exec(`insert into farms (id, name, hectares, location) values ('f1', 'Test', 1, 'X');`);
  await db.exec(`insert into agent_runs (id, farm_id, trigger, as_of, seed, engine_version, config_hash)
                 values ('00000000-0000-0000-0000-000000000001', 'f1', 'demo', '2026-11-08', 42, '1.0.0', 'abc');`);
  await db.exec(`insert into agent_events (run_id, seq, type, actor, body, prev_hash, hash)
                 values ('00000000-0000-0000-0000-000000000001', 1, 'run.start', 'code', '{}', '0', 'h1');`);
}, 30_000);

describe("migration 0003", () => {
  it("rejects UPDATE, DELETE and TRUNCATE on agent_events", async () => {
    await expect(db.exec(`update agent_events set type = 'x'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from agent_events`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`truncate agent_events`)).rejects.toThrow(/append-only/);
  });
  it("lets pending_changes come from the agent", async () => {
    await db.exec(`insert into pending_changes (farm_id, field_label, current_value, proposed_value, source, reason)
                   values ('f1', 'N bought', '0 t', '120 t', 'agent', 'contract')`);
  });
  it("has one controls row, not paused", async () => {
    const r = await db.query<{ paused: boolean }>(`select paused from agent_controls`);
    expect(r.rows).toEqual([{ paused: false }]);
  });
  it("risk_agent role cannot write profile_fields but can append events", async () => {
    await db.exec(`set role risk_agent`);
    await expect(db.exec(`insert into profile_fields (farm_id, key, source, confidence) values ('f1','k','s','high')`)).rejects.toThrow();
    await db.exec(`insert into agent_events (run_id, seq, type, actor, body, prev_hash, hash)
                   values ('00000000-0000-0000-0000-000000000001', 2, 'x', 'code', '{}', 'h1', 'h2')`);
    await db.exec(`reset role`);
  });
});
