-- MVP step 3 data (PRD F1, F4; ARCHITECTURE.md data model). Additive.

-- Food scale answer (PRD F1). The app already reads it; it was never created.
alter table public.nutrition_profiles add column has_scale boolean;

-- When the user first finished onboarding (PRD section 5 onboarding_completed).
alter table public.profiles add column onboarding_completed_at timestamptz;

-- Targets history: the latest row by effective_from is current. Rows are
-- never edited; a change is a new row (ARCHITECTURE.md "targets").
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  calories integer not null check (calories between 500 and 10000),
  protein_g integer not null check (protein_g between 0 and 1000),
  carbs_g integer not null check (carbs_g between 0 and 2000),
  fat_g integer not null check (fat_g between 0 and 1000),
  set_by text not null check (set_by in ('formula', 'user', 'coach')),
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index targets_user_effective_idx on public.targets (user_id, effective_from desc);

alter table public.targets enable row level security;

create policy "targets: read own or assigned"
  on public.targets for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
-- Formula targets for anyone; their own edits only for free members (PRD F1:
-- paid users' targets are set by the coach).
create policy "targets: insert own"
  on public.targets for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      set_by = 'formula'
      or (set_by = 'user' and exists (select 1 from public.profiles p where p.id = user_id and p.tier = 'free'))
    )
  );
create policy "targets: coach sets for assigned users"
  on public.targets for insert to authenticated
  with check (set_by = 'coach' and private.is_coach_of(user_id));

revoke all on public.targets from anon;
revoke update, delete on public.targets from authenticated;

-- Weigh-ins: one per local day (PRD F4). Re-logging the same day replaces it.
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.weights enable row level security;

create policy "weights: read own or assigned"
  on public.weights for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "weights: insert own"
  on public.weights for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "weights: update own"
  on public.weights for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "weights: delete own"
  on public.weights for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.weights from anon;
