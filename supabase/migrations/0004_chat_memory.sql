-- Long-term memory for the chat agent: one set of short running notes per farm, shared by
-- iMessage and the in-app assistant (one conversation across channels). Written by the model
-- after each answered question (lib/agents/chat/memory.ts). Context only, never a figure source;
-- the full record of every question stays in chat_turns.

create table if not exists chat_memory (
  farm_id    text primary key references farms(id) on delete cascade,
  notes      text not null default '',
  turns      integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table chat_memory enable row level security;
