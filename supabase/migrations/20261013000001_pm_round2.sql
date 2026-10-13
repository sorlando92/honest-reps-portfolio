-- PM decisions round 2 (QUESTIONS.md, 2026-10-13) and the M0 review fixes.

-- ---------------------------------------------------------------------------
-- Q3: role is member or coach. "Client" is a member with tier paid.
-- ---------------------------------------------------------------------------
update public.profiles set role = 'member' where role = 'client';
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'coach'));

-- ---------------------------------------------------------------------------
-- Q26: Stripe is the source of truth for price.
-- ---------------------------------------------------------------------------
alter table public.coach_settings drop column price_cents;

-- ---------------------------------------------------------------------------
-- Finding 3 / Q16: analytics outlive a deleted account, without the user id.
-- ---------------------------------------------------------------------------
alter table public.events
  drop constraint events_user_id_fkey,
  add constraint events_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Finding 1: only PRD event names (core/events/names.ts), and the events the
-- metrics page trusts most are written by the server, never by a client.
-- ---------------------------------------------------------------------------
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent'
));

drop policy "events: insert own" on public.events;
create policy "events: insert own"
  on public.events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and name not in ('signup_completed', 'upgrade_completed', 'subscription_canceled', 'review_reply_sent')
  );

-- ---------------------------------------------------------------------------
-- Finding 2: fixed window rate limit for unauthenticated writes. Keys are
-- hashed before they get here. Only the service role can call it.
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

create function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_open timestamptz := now() - make_interval(secs => p_window_seconds);
  allowed boolean;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < window_open then now() else r.window_start end,
    hits = case when r.window_start < window_open then 1 else r.hits + 1 end
  returning r.hits <= p_limit into allowed;

  delete from private.rate_limits where window_start < now() - interval '1 day';
  return allowed;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Finding 5: reminders and the weekly cycle depend on a real timezone.
-- ---------------------------------------------------------------------------
create function private.check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.check_timezone() from public, anon, authenticated;

create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function private.check_timezone();
