-- Long-term memory for the iMessage chat agent: short running notes per conversation, written by
-- the model after each answered message (lib/agents/chat/memory.ts). Context only, never a figure
-- source; the full record of every message stays in chat_turns.

create table if not exists chat_memory (
  farm_id         text not null references farms(id) on delete cascade,
  conversation_id text not null,
  notes           text not null default '',
  turns           integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (farm_id, conversation_id)
);

alter table chat_memory enable row level security;
