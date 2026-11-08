-- Profile changes proposed in the in-app chat (iMessage proposals keep source 'imessage').
alter table pending_changes drop constraint if exists pending_changes_source_check;
alter table pending_changes add constraint pending_changes_source_check
  check (source in ('onboarding', 'freshness', 'imessage', 'mcp', 'companies_house', 'agent', 'chat'));
