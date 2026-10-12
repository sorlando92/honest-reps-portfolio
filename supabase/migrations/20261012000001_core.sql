-- M0 core: profiles, app_config, coach_settings, consents, events.
-- Every table has Row Level Security. A user reads and writes only their own
-- rows; the coach reads rows of every user assigned to them, free and paid
-- (QUESTIONS.md Q4). Writes that must not come from the client (role, tier,
-- coach assignment) are blocked with column privileges and done server side.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'client', 'coach')),
  coach_id uuid references public.profiles (id) on delete set null,
  display_name text check (char_length(display_name) <= 80),
  units text not null default 'imperial' check (units in ('imperial', 'metric')),
  timezone text not null default 'UTC',
  tier text not null default 'free' check (tier in ('free', 'paid')),
  billing_source text check (billing_source in ('stripe', 'comped', 'external')),
  medical_flag boolean not null default false,
  date_of_birth date,
  created_at timestamptz not null default now()
);

create index profiles_coach_id_idx on public.profiles (coach_id);

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policies on profiles can call them without
-- recursing into the profiles policies.
-- ---------------------------------------------------------------------------
create function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'coach'
  );
$$;

create function public.is_coach_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_coach() and exists (
    select 1 from public.profiles
    where id = target and coach_id = (select auth.uid())
  );
$$;

create function public.my_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coach_id from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.is_coach() from public, anon;
revoke execute on function public.is_coach_of(uuid) from public, anon;
revoke execute on function public.my_coach_id() from public, anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.is_coach_of(uuid) to authenticated;
grant execute on function public.my_coach_id() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles: read own or assigned"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_coach_of(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users may only change these columns on their own row. Role, tier, billing,
-- coach assignment, medical flag and date of birth change server side.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, units, timezone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- app_config: global key/value settings (product name, thresholds, versions)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config: signed in users read"
  on public.app_config for select to authenticated
  using (true);

create policy "app_config: coach inserts"
  on public.app_config for insert to authenticated
  with check (public.is_coach());

create policy "app_config: coach updates"
  on public.app_config for update to authenticated
  using (public.is_coach())
  with check (public.is_coach());

create policy "app_config: coach deletes"
  on public.app_config for delete to authenticated
  using (public.is_coach());

revoke all on public.app_config from anon;

-- ---------------------------------------------------------------------------
-- coach_settings: one row per coach, edited from Coach settings (F14)
-- ---------------------------------------------------------------------------
create table public.coach_settings (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  price_cents integer check (price_cents >= 0),
  stripe_price_id text,
  checkin_day smallint not null check (checkin_day between 0 and 6),
  review_day smallint check (review_day between 0 and 6),
  target_defaults jsonb not null default '{}'::jsonb,
  reminder_defaults jsonb not null default '{}'::jsonb,
  disclosure_text text,
  -- FK to ai_prompt_versions is added in M4 when that table exists.
  ai_editable_layer_version_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.coach_settings enable row level security;

create policy "coach_settings: coach or their users read"
  on public.coach_settings for select to authenticated
  using (coach_id = (select auth.uid()) or coach_id = public.my_coach_id());

create policy "coach_settings: coach inserts own"
  on public.coach_settings for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_coach());

create policy "coach_settings: coach updates own"
  on public.coach_settings for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach())
  with check (coach_id = (select auth.uid()) and public.is_coach());

revoke all on public.coach_settings from anon;
revoke delete on public.coach_settings from authenticated;

-- ---------------------------------------------------------------------------
-- consents: append only record of what each user accepted and when (F16)
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'disclaimer', 'coach_visibility', 'mo_disclosure')),
  version text not null,
  accepted_at timestamptz not null default now()
);

create index consents_user_id_idx on public.consents (user_id);

alter table public.consents enable row level security;

create policy "consents: read own or assigned"
  on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach_of(user_id));

create policy "consents: insert own"
  on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- accepted_at always comes from the server clock; no edits or deletes.
revoke all on public.consents from anon;
revoke insert, update, delete on public.consents from authenticated;
grant insert (user_id, kind, version) on public.consents to authenticated;

-- ---------------------------------------------------------------------------
-- events: first party analytics (PRD section 5)
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  -- Null for events before sign in (signup_started, pwa_installed).
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) <= 64),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_name_created_at_idx on public.events (name, created_at);
create index events_user_id_created_at_idx on public.events (user_id, created_at);

alter table public.events enable row level security;

create policy "events: read own or assigned"
  on public.events for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach_of(user_id));

create policy "events: insert own"
  on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.events from anon;
revoke insert, update, delete on public.events from authenticated;
grant insert (user_id, name, props) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- New auth user: create the profile, assign the default coach, record the
-- coach visibility consent shown on the sign in screen, emit signup_completed.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  tz text := meta ->> 'timezone';
  default_coach uuid;
begin
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  select (value #>> '{}')::uuid into default_coach
  from public.app_config where key = 'default_coach_id';

  insert into public.profiles (id, coach_id, timezone)
  values (new.id, default_coach, tz);

  if (meta ->> 'coach_visibility_accepted') = 'true' then
    insert into public.consents (user_id, kind, version)
    values (
      new.id,
      'coach_visibility',
      coalesce(
        (select value ->> 'coach_visibility' from public.app_config where key = 'consent_versions'),
        'unversioned'
      )
    );
  end if;

  insert into public.events (user_id, name, props)
  values (new.id, 'signup_completed', jsonb_build_object('method', 'email_otp'));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
