-- Nutrition module: body data collected in onboarding (F1). Kept off the core
-- profiles table per CLAUDE.md rule 5. Columns arrive in M0 so goal weight is
-- ready for M2 onboarding (QUESTIONS.md Q27). Current weight lives in weights.

create table public.nutrition_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  goal text check (goal in ('lose_fat', 'maintain', 'build_muscle', 'performance')),
  sex text check (sex in ('male', 'female')),
  height_cm numeric(5, 1) check (height_cm > 0),
  -- Keys match the activity multipliers in coach_settings.target_defaults.
  activity_level text check (char_length(activity_level) <= 32),
  goal_weight_kg numeric(5, 1) check (goal_weight_kg > 0),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_profiles enable row level security;

create policy "nutrition_profiles: read own or assigned"
  on public.nutrition_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach_of(user_id));

create policy "nutrition_profiles: insert own"
  on public.nutrition_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "nutrition_profiles: update own"
  on public.nutrition_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.nutrition_profiles from anon;
revoke delete on public.nutrition_profiles from authenticated;
