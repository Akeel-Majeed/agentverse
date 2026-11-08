-- Agent runs, their inputs, an append-only hash-chained trace, controls and backtest results.
-- The agent store can connect as risk_agent: it can append to the trace and propose changes, never edit the profile.

create table if not exists agent_runs (
  id             uuid primary key default gen_random_uuid(),
  farm_id        text not null references farms(id) on delete cascade,
  trigger        text not null check (trigger in ('update_profile', 'rerun', 'document', 'demo')),
  as_of          date not null,
  seed           integer not null,
  engine_version text not null,
  config_hash    text not null,
  prompt_version text,
  model          text,
  status         text not null default 'numbers_only'
                 check (status in ('numbers_only', 'queued', 'running', 'published', 'held', 'blocked', 'killed', 'failed')),
  total_cost_usd numeric,
  input_tokens   integer,
  output_tokens  integer,
  turns          integer,
  timings        jsonb not null default '{}',
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  error          text
);
create index if not exists agent_runs_status on agent_runs (status, started_at);
create index if not exists agent_runs_farm on agent_runs (farm_id, started_at desc);

create table if not exists observations (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references agent_runs(id) on delete restrict,
  farm_id       text not null references farms(id) on delete restrict,
  kind          text not null check (kind in ('market', 'profile', 'document', 'news', 'message')),
  source        text not null,
  url           text,
  fetched_at    timestamptz not null,
  value         jsonb not null,
  sha256        text not null,
  screen_status text not null default 'passed' check (screen_status in ('passed', 'quarantined', 'review')),
  screen        jsonb
);
create index if not exists observations_run on observations (run_id);
create index if not exists observations_farm_kind on observations (farm_id, kind);

create table if not exists agent_events (
  run_id     uuid not null references agent_runs(id) on delete restrict,
  seq        integer not null,
  type       text not null,
  actor      text not null check (actor in ('code', 'jev', 'gemini', 'human')),
  body       text not null,
  prev_hash  text not null,
  hash       text not null,
  created_at timestamptz not null default now(),
  primary key (run_id, seq)
);

create table if not exists agent_controls (
  id                    boolean primary key default true check (id),
  paused                boolean not null default false,
  max_turns             integer not null default 8,
  max_budget_usd        numeric not null default 3,
  max_proposals_per_run integer not null default 3,
  jev_threshold         numeric not null default 0.5,
  z_threshold           numeric not null default 4,
  updated_at            timestamptz not null default now(),
  updated_by            text
);
insert into agent_controls (id) values (true) on conflict do nothing;

create table if not exists backtest_results (
  id             bigint generated always as identity primary key,
  series         text not null,
  origin         date not null,
  horizon_months integer not null,
  model          text not null check (model in ('mc', 'normal_refit', 'hist_sim')),
  p5             numeric not null,
  p95            numeric not null,
  realised       numeric not null,
  breach_low     boolean not null,
  breach_high    boolean not null,
  pinball        numeric not null,
  config_hash    text not null,
  unique (series, origin, horizon_months, model, config_hash)
);

-- Append-only: no edits, deletes or truncation of the trace or the inputs.
create or replace function reject_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists agent_events_no_change on agent_events;
create trigger agent_events_no_change before update or delete on agent_events for each row execute function reject_change();
drop trigger if exists agent_events_no_truncate on agent_events;
create trigger agent_events_no_truncate before truncate on agent_events for each statement execute function reject_change();
drop trigger if exists observations_no_change on observations;
create trigger observations_no_change before update or delete on observations for each row execute function reject_change();
drop trigger if exists observations_no_truncate on observations;
create trigger observations_no_truncate before truncate on observations for each statement execute function reject_change();

-- Existing tables.
alter table pending_changes drop constraint if exists pending_changes_source_check;
alter table pending_changes add constraint pending_changes_source_check
  check (source in ('onboarding', 'freshness', 'imessage', 'mcp', 'companies_house', 'agent'));
alter table pending_changes add column if not exists run_id uuid references agent_runs(id);
alter table pending_changes add column if not exists evidence jsonb;
alter table pending_changes add column if not exists resolved_by text;

alter table assessments add column if not exists run_id uuid references agent_runs(id);
alter table assessments add column if not exists status text;
alter table assessments add column if not exists head_hash text;
alter table assessments add column if not exists simulation jsonb;

alter table market_data add column if not exists sha256 text;

alter table agent_runs       enable row level security;
alter table observations     enable row level security;
alter table agent_events     enable row level security;
alter table agent_controls   enable row level security;
alter table backtest_results enable row level security;

-- Restricted role for the agent store (RISK_AGENT_DATABASE_URL). Set its password in the SQL editor afterwards:
--   alter role risk_agent with login password '<strong password>';
do $$ begin
  if not exists (select from pg_roles where rolname = 'risk_agent') then create role risk_agent nologin; end if;
end $$;
grant usage on schema public to risk_agent;
grant select on all tables in schema public to risk_agent;
grant insert on agent_runs, agent_events, observations, pending_changes to risk_agent;
-- agent_controls stays read-only for risk_agent: the agent can never un-pause its own kill switch.
grant update on agent_runs, assessments to risk_agent;
revoke insert, update, delete, truncate on profile_fields from risk_agent;

do $$
declare t text;
begin
  foreach t in array array['farms', 'profile_fields', 'profile_snapshots', 'assessments', 'pending_changes',
                           'agent_runs', 'observations', 'agent_events', 'agent_controls', 'market_data', 'signals']
  loop
    execute format('drop policy if exists risk_agent_rw on %I', t);
    execute format('create policy risk_agent_rw on %I to risk_agent using (true) with check (true)', t);
  end loop;
end $$;
