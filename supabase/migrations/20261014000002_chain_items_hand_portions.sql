-- QUESTIONS.md round 3: curated chain items (Q36) and hand portion
-- conversions in a nutrition module table (Q33).

-- Where each curated item's numbers come from, re-verified before releases.
alter table public.food_items
  add column source_url text,
  add column verified_on date;

-- ---------------------------------------------------------------------------
-- nutrition_coach_settings: nutrition settings edited on the Coach settings
-- screen. Same access as coach_settings: the coach and their users read, the
-- coach writes their own row.
-- ---------------------------------------------------------------------------
create table public.nutrition_coach_settings (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  hand_portions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_coach_settings enable row level security;

create policy "nutrition_coach_settings: coach or their users read"
  on public.nutrition_coach_settings for select to authenticated
  using (coach_id = (select auth.uid()) or coach_id = private.my_coach_id());

create policy "nutrition_coach_settings: coach inserts own"
  on public.nutrition_coach_settings for insert to authenticated
  with check (coach_id = (select auth.uid()) and private.is_coach());

create policy "nutrition_coach_settings: coach updates own"
  on public.nutrition_coach_settings for update to authenticated
  using (coach_id = (select auth.uid()) and private.is_coach())
  with check (coach_id = (select auth.uid()) and private.is_coach());

revoke all on public.nutrition_coach_settings from anon;
revoke delete on public.nutrition_coach_settings from authenticated;
