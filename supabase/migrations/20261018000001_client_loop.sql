-- MVP step 4, client loop (PRD F5, F12, F16 disclosure, F17 check-in
-- reminders). Additive: new tables, functions and one coach_settings column.
--
-- invites            coach invites with a single-use token (Q69)
-- checkin_questions  the coach's check-in steps, seeded (Q72)
-- checkins           one per client per check-in week
-- checkin_photos     up to 3 progress photos per check-in (private bucket)
-- messages           coach replies to check-ins (the thread arrives post-MVP)
-- notifications_sent one row per push sent by the reminder job, for dedupe

-- ---------------------------------------------------------------------------
-- Invites (PRD F12, Q69). Only a SHA-256 hash of the token is stored; the raw
-- token exists only in the link. The coach reads their own invites; the
-- server creates, revokes and resends them. Claiming goes through
-- claim_invite(), which binds whoever is signed in, whatever their email.
-- ---------------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  first_name text check (char_length(first_name) between 1 and 40),
  billing_source text not null check (billing_source in ('comped', 'external')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '14 days',
  claimed_by uuid references public.profiles (id) on delete set null,
  -- The email the client actually signed in with (may differ from email).
  claimed_email text check (char_length(claimed_email) <= 254),
  claimed_at timestamptz,
  revoked_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_coach_id_idx on public.invites (coach_id, created_at desc);

alter table public.invites enable row level security;

create policy "invites: coach reads own"
  on public.invites for select to authenticated
  using (coach_id = (select auth.uid()) and private.is_coach());

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;

-- Statuses: claimed, yours (already claimed by this user), used, revoked,
-- expired, invalid, coach (a coach account cannot become a client),
-- signed_out.
create function public.claim_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites%rowtype;
begin
  if uid is null then
    return 'signed_out';
  end if;
  select * into inv from public.invites
  where token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
  for update;
  if not found then
    return 'invalid';
  end if;
  if inv.claimed_at is not null then
    return case when inv.claimed_by = uid then 'yours' else 'used' end;
  end if;
  if inv.revoked_at is not null then
    return 'revoked';
  end if;
  if inv.expires_at <= now() then
    return 'expired';
  end if;
  if exists (select 1 from public.profiles where id = uid and role = 'coach') then
    return 'coach';
  end if;

  update public.profiles
  set coach_id = inv.coach_id, tier = 'paid', billing_source = inv.billing_source
  where id = uid;
  update public.invites
  set claimed_by = uid, claimed_email = (select auth.jwt() ->> 'email'), claimed_at = now()
  where id = inv.id;
  return 'claimed';
end;
$$;

revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- State disclosure (PRD F16, Q73). The body stays in disclosure_text.
-- ---------------------------------------------------------------------------
alter table public.coach_settings
  add column disclosure_title text check (char_length(disclosure_title) <= 80);

-- ---------------------------------------------------------------------------
-- Check-in questions (PRD F5, Q18, Q72). Weight and photos are steps too, so
-- every step's copy is coach data. Coach settings will edit these post-MVP;
-- until then only the seed and the server write.
-- ---------------------------------------------------------------------------
create table public.checkin_questions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  type text not null check (type in ('weight', 'photos', 'scale', 'text')),
  prompt text not null check (char_length(prompt) between 1 and 200),
  low_label text check (char_length(low_label) <= 30),
  high_label text check (char_length(high_label) <= 30),
  optional boolean not null default false,
  report_tag text check (report_tag in ('energy', 'sleep', 'hunger', 'performance')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coach_id, position),
  check (type <> 'scale' or (low_label is not null and high_label is not null))
);

alter table public.checkin_questions enable row level security;

create policy "checkin_questions: coach or their users read"
  on public.checkin_questions for select to authenticated
  using (coach_id = (select auth.uid()) or coach_id = private.my_coach_id());

revoke all on public.checkin_questions from anon, authenticated;
grant select on public.checkin_questions to authenticated;

-- ---------------------------------------------------------------------------
-- Check-ins (PRD F5). week_of is the check-in day in the coach's timezone.
-- The server validates the window and writes; the owner and the assigned
-- coach read.
-- ---------------------------------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  week_of date not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  weight_kg numeric(5, 2) check (weight_kg between 30 and 300),
  -- {question_id: 1..5 | text}
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  on_time boolean,
  unique (user_id, week_of)
);

create index checkins_coach_week_idx on public.checkins (coach_id, week_of desc);

alter table public.checkins enable row level security;

create policy "checkins: owner or assigned coach reads"
  on public.checkins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));

revoke all on public.checkins from anon, authenticated;
grant select on public.checkins to authenticated;

create table public.checkin_photos (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  created_at timestamptz not null default now(),
  unique (checkin_id, position)
);

alter table public.checkin_photos enable row level security;

create policy "checkin_photos: owner or assigned coach reads"
  on public.checkin_photos for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));

revoke all on public.checkin_photos from anon, authenticated;
grant select on public.checkin_photos to authenticated;

-- Private bucket. No storage policies for app users: uploads and signed URLs
-- go through the server after it checks ownership or coach assignment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-photos', 'checkin-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Messages: coach replies to check-ins (PRD F5; the full thread is F8,
-- post-MVP). The server inserts; the client and the coach read; the client
-- marks a reply read.
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_user_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  checkin_id uuid references public.checkins (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  photo_path text check (char_length(photo_path) <= 300),
  flagged_medical boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_user_id, created_at desc);
create index messages_checkin_idx on public.messages (checkin_id);

alter table public.messages enable row level security;

create policy "messages: thread user or assigned coach reads"
  on public.messages for select to authenticated
  using (thread_user_id = (select auth.uid()) or private.is_coach_of(thread_user_id));
create policy "messages: thread user marks read"
  on public.messages for update to authenticated
  using (thread_user_id = (select auth.uid()))
  with check (thread_user_id = (select auth.uid()));

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Pushes sent by the reminder job: one per user, kind and week.
-- ---------------------------------------------------------------------------
create table public.notifications_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('checkin_open', 'checkin_followup')),
  ref text not null check (char_length(ref) <= 40),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

alter table public.notifications_sent enable row level security;
revoke all on public.notifications_sent from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The check-in window for a coach at a moment (ARCHITECTURE "Weekly cycle"):
-- the latest check-in day whose open time has passed, in the coach's
-- timezone. Overdue after weekly_cycle.overdue_after_hours; closes when the
-- review day starts.
-- ---------------------------------------------------------------------------
create function private.checkin_window(p_coach uuid, p_now timestamptz)
returns table (week_of date, opens_at timestamptz, overdue_at timestamptz, closes_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  s public.coach_settings%rowtype;
  local_day date;
  d date;
  opens_time time;
  review_gap int;
begin
  select p.timezone into tz from public.profiles p where p.id = p_coach;
  select * into s from public.coach_settings where coach_id = p_coach;
  if tz is null or s.coach_id is null then
    return;
  end if;
  opens_time := coalesce(s.weekly_cycle ->> 'checkin_opens_at', '06:00')::time;
  local_day := (p_now at time zone tz)::date;
  d := local_day - ((extract(dow from local_day)::int - s.checkin_day + 7) % 7);
  if ((d + opens_time) at time zone tz) > p_now then
    d := d - 7;
  end if;
  review_gap := (coalesce(s.review_day, s.checkin_day) - s.checkin_day + 7) % 7;
  if review_gap = 0 then
    review_gap := 7;
  end if;
  week_of := d;
  opens_at := (d + opens_time) at time zone tz;
  overdue_at := opens_at + make_interval(hours => coalesce((s.weekly_cycle ->> 'overdue_after_hours')::int, 24));
  closes_at := ((d + review_gap)::timestamp) at time zone tz;
  return next;
end;
$$;

revoke execute on function private.checkin_window(uuid, timestamptz) from public, anon, authenticated;

-- What Today, the check-in screen and the coach need about a user's current
-- check-in. The user or their coach may ask; the server (service role) may
-- ask for anyone. eligible: a paid client with a coach.
create function public.checkin_state(p_user uuid, p_now timestamptz default now())
returns table (
  eligible boolean, week_of date, opens_at timestamptz, overdue_at timestamptz, closes_at timestamptz,
  is_open boolean, checkin_id uuid, submitted_at timestamptz, on_time boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prof public.profiles%rowtype;
  w record;
  c public.checkins%rowtype;
begin
  if (select auth.role()) <> 'service_role' and p_user <> (select auth.uid()) and not private.is_coach_of(p_user) then
    return;
  end if;
  select * into prof from public.profiles where id = p_user;
  if prof.id is null or prof.coach_id is null then
    return;
  end if;
  select * into w from private.checkin_window(prof.coach_id, p_now);
  if w.week_of is null then
    return;
  end if;
  select * into c from public.checkins ch where ch.user_id = p_user and ch.week_of = w.week_of;
  eligible := prof.tier = 'paid';
  week_of := w.week_of;
  opens_at := w.opens_at;
  overdue_at := w.overdue_at;
  closes_at := w.closes_at;
  is_open := p_now >= w.opens_at and p_now < w.closes_at;
  checkin_id := c.id;
  submitted_at := c.submitted_at;
  on_time := c.on_time;
  return next;
end;
$$;

revoke execute on function public.checkin_state(uuid, timestamptz) from public, anon;
grant execute on function public.checkin_state(uuid, timestamptz) to authenticated, service_role;

-- Pushes the reminder job owes at p_now (PRD F5, F17): on the check-in day in
-- the client's own timezone, the morning reminder from reminder_defaults
-- checkin_reminder and the evening follow-up from checkin_followup, while the
-- check-in is open and not submitted, once per week each. Test profiles are
-- skipped.
create function public.due_checkin_reminders(p_now timestamptz default now())
returns table (user_id uuid, kind text, week_of date, coach_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, k.kind, w.week_of, p.coach_id
  from public.profiles p
  join public.coach_settings s on s.coach_id = p.coach_id
  cross join lateral private.checkin_window(p.coach_id, p_now) w
  cross join lateral (values
    ('checkin_open', coalesce(s.reminder_defaults ->> 'checkin_reminder', '08:00')::time),
    ('checkin_followup', coalesce(s.reminder_defaults ->> 'checkin_followup', '19:00')::time)
  ) as k (kind, at_time)
  where p.tier = 'paid'
    and not p.is_test
    and p_now >= w.opens_at and p_now < w.closes_at
    and (p_now at time zone p.timezone)::date = w.week_of
    and (p_now at time zone p.timezone)::time >= k.at_time
    and not exists (
      select 1 from public.checkins c
      where c.user_id = p.id and c.week_of = w.week_of and c.submitted_at is not null
    )
    and not exists (
      select 1 from public.notifications_sent n
      where n.user_id = p.id and n.kind = k.kind and n.ref = w.week_of::text
    );
$$;

revoke execute on function public.due_checkin_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.due_checkin_reminders(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Every 15 minutes pg_cron asks the app to send what is due (Q76). The URL
-- and the shared secret live in Vault (app_url, jobs_secret); until both are
-- set the call is skipped.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.run_checkin_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_secret');
begin
  if base is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := base || '/api/jobs/checkin-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function private.run_checkin_reminders() from public, anon, authenticated;

select cron.schedule('checkin-reminders', '*/15 * * * *', 'select private.run_checkin_reminders()');
