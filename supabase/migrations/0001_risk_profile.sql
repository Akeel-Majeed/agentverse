-- Farm profile, risk profile snapshots, assessments and news, keyed by farm_id.
-- Row level security is on with no policies: only the server (secret key) can read or write.

create table if not exists farms (
  id          text primary key,
  name        text not null,
  hectares    numeric not null,
  location    text not null,
  crops       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- One row per fact about the farm. Only the farmer writes here; agents write to pending_changes.
create table if not exists profile_fields (
  farm_id      text not null references farms(id) on delete cascade,
  key          text not null,
  value        jsonb,
  source       text not null,
  confidence   text not null check (confidence in ('high', 'check')),
  confirmed_at timestamptz,
  valid_until  date,
  updated_at   timestamptz not null default now(),
  primary key (farm_id, key)
);

create table if not exists profile_sections (
  farm_id      text not null references farms(id) on delete cascade,
  section_id   text not null,
  confirmed_at timestamptz not null default now(),
  primary key (farm_id, section_id)
);

-- Frozen copy of the profile and the market when a risk profile is made. Never updated.
create table if not exists profile_snapshots (
  id         uuid primary key default gen_random_uuid(),
  farm_id    text not null references farms(id) on delete cascade,
  version    integer not null,
  taken_at   timestamptz not null default now(),
  reason     text not null,
  fields     jsonb not null,
  market     jsonb not null,
  exposures  jsonb not null,
  unique (farm_id, version)
);

-- One row per engine run. summary and risks match lib/types.ts.
create table if not exists assessments (
  id           uuid primary key default gen_random_uuid(),
  farm_id      text not null references farms(id) on delete cascade,
  snapshot_id  uuid not null references profile_snapshots(id),
  created_at   timestamptz not null default now(),
  harvest_year integer not null,
  summary      jsonb not null,
  risks        jsonb not null
);
create index if not exists assessments_farm_created on assessments (farm_id, created_at desc);

create table if not exists pending_changes (
  id             text primary key default gen_random_uuid()::text,
  farm_id        text not null references farms(id) on delete cascade,
  field_key      text,
  field_label    text not null,
  current_value  text not null,
  proposed_value text not null,
  source         text not null check (source in ('onboarding', 'freshness', 'imessage', 'mcp', 'companies_house')),
  reason         text not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  received_at    timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists pending_changes_farm on pending_changes (farm_id, status);

-- Cached market figures (prices, rates), one row per metric per day.
create table if not exists market_data (
  metric      text not null,
  observed_on date not null,
  value       numeric not null,
  unit        text not null,
  label       text not null,
  source      text not null,
  primary key (metric, observed_on)
);

-- News, price moves and policy items, tagged with the risk they touch. farm_id null = applies to every farm.
create table if not exists signals (
  id           text primary key,
  farm_id      text references farms(id) on delete cascade,
  risk_id      text not null check (risk_id in ('output_prices', 'input_prices', 'weather_yield', 'regulation', 'interest_rates')),
  kind         text not null check (kind in ('market', 'policy', 'weather', 'news')),
  title        text not null,
  summary      text not null,
  source       text not null,
  url          text,
  published_at timestamptz not null,
  metric       text,
  value        numeric,
  created_at   timestamptz not null default now()
);
create index if not exists signals_published on signals (published_at desc);

-- A signal measured against one snapshot: delta is the £ change in expected profit (null = no figure).
create table if not exists signal_impacts (
  signal_id   text not null references signals(id) on delete cascade,
  snapshot_id uuid not null references profile_snapshots(id) on delete cascade,
  farm_id     text not null references farms(id) on delete cascade,
  risk_id     text not null,
  delta       numeric,
  working     jsonb not null,
  alert       boolean not null default false,
  status      text not null default 'new' check (status in ('new', 'alerted', 'dismissed')),
  created_at  timestamptz not null default now(),
  primary key (signal_id, snapshot_id)
);

create or replace view latest_assessment with (security_invoker = true) as
  select distinct on (farm_id) * from assessments order by farm_id, created_at desc;

create or replace view latest_snapshot with (security_invoker = true) as
  select distinct on (farm_id) * from profile_snapshots order by farm_id, version desc;

alter table farms             enable row level security;
alter table profile_fields    enable row level security;
alter table profile_sections  enable row level security;
alter table profile_snapshots enable row level security;
alter table assessments       enable row level security;
alter table pending_changes   enable row level security;
alter table market_data       enable row level security;
alter table signals           enable row level security;
alter table signal_impacts    enable row level security;
