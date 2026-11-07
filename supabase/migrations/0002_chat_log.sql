-- Action log for the iMessage chat agent: one row per inbound message it answers.
-- inbound_message_id is unique, so a webhook retry for the same message is answered once.

create table if not exists chat_turns (
  id                 uuid primary key default gen_random_uuid(),
  farm_id            text not null references farms(id) on delete cascade,
  inbound_message_id text not null unique,
  conversation_id    text not null,
  question           text not null,
  answer             text,
  status             text not null default 'answering' check (status in ('answering', 'answered', 'failed')),
  tools              jsonb not null default '[]',
  checker            jsonb,
  model              text,
  error              text,
  created_at         timestamptz not null default now(),
  answered_at        timestamptz
);
create index if not exists chat_turns_farm_created on chat_turns (farm_id, created_at desc);

alter table chat_turns enable row level security;
