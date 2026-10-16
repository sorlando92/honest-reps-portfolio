-- One note per local day on Today (docs/SCREENS_V2.md "Day notes"). Additive.
-- Core, not nutrition: a journal note is not food data. The owner reads and
-- writes; the assigned coach reads only.
create table public.day_notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  body text not null check (char_length(body) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.day_notes enable row level security;

create policy "day_notes: read own or assigned"
  on public.day_notes for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "day_notes: insert own"
  on public.day_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "day_notes: update own"
  on public.day_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "day_notes: delete own"
  on public.day_notes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.day_notes from anon;
