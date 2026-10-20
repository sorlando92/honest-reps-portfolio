-- Per-client AI access (Sean, 2026-10-20). Every route that calls Anthropic
-- checks profiles.ai_enabled first and denies unless it is true. Only the
-- assigned coach changes it, through /api/clients/[id]/ai with the service
-- role, which records who changed it and when.

alter table public.profiles
  add column ai_enabled boolean not null default false,
  add column ai_enabled_changed_by uuid references public.profiles (id) on delete set null,
  add column ai_enabled_changed_at timestamptz;

-- Clients keep their column-level update grant (display_name, timezone,
-- units). Nothing here grants UPDATE on the new columns; this makes sure
-- no earlier table-level grant reaches them.
revoke update (ai_enabled, ai_enabled_changed_by, ai_enabled_changed_at) on public.profiles from authenticated, anon;

-- Everyone who exists today keeps AI (Sean, 2026-10-20). New signups get the
-- column default, off, until their coach turns it on.
update public.profiles set ai_enabled = true;
