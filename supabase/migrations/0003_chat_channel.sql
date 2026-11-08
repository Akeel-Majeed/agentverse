-- One chat history across channels: the iMessage agent and the in-app assistant log to the
-- same table, and each reads the other's turns as context.
alter table chat_turns add column if not exists channel text not null default 'imessage'
  check (channel in ('imessage', 'web'));
