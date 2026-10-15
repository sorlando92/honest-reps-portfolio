-- MVP step 1: favorites and quick add (PRD F2).

-- The timeline title for entries that were not typed: a favorite logs under
-- the title of the entry it came from. raw_input stays the audit of what the
-- user typed (CLAUDE.md rule 3) and is never filled in for them.
alter table public.food_entries
  add column title text check (char_length(title) between 1 and 200);

-- A starred entry, kept as a template so it logs again in one tap.
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  -- The entry's items as the entries API takes them (name, food_item_id,
  -- amount, unit, grams, amount_source, state, calories and macros).
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  source_entry_id uuid references public.food_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, source_entry_id)
);

create index favorites_user_id_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

create policy "favorites: read own or assigned"
  on public.favorites for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "favorites: insert own"
  on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "favorites: delete own"
  on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.favorites from anon;
revoke update on public.favorites from authenticated;
