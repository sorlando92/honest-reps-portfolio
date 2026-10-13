-- M1 step 2: logged food (ARCHITECTURE.md nutrition module, PRD F2).
-- Every entry keeps its raw input, the model's raw output and confidence so
-- parsing can be audited (CLAUDE.md rule 3). Drafts never reach these tables.

-- The parse route stores what went in and came out of each call, so a saved
-- entry copies its audit trail from here instead of trusting the browser.
alter table public.ai_calls
  add column input text check (char_length(input) <= 2000),
  add column output jsonb;

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  logged_at timestamptz not null,
  meal_tag text check (meal_tag in ('breakfast', 'lunch', 'dinner', 'snack')),
  method text not null check (method in ('text', 'photo', 'barcode', 'search', 'quick_add', 'manual')),
  raw_input text check (char_length(raw_input) <= 2000),
  raw_photo_path text,
  model_output jsonb,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  status text not null default 'final' check (status in ('final', 'pending')),
  -- Offline entries are created on the device; the server dedupes on this.
  client_uuid uuid not null,
  ai_call_id uuid references public.ai_calls (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_uuid)
);

create index food_entries_user_logged_at_idx on public.food_entries (user_id, logged_at);

create table public.food_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.food_entries (id) on delete cascade,
  -- Copied from the entry so RLS needs no join.
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null default 0,
  food_item_id uuid references public.food_items (id) on delete set null,
  name text not null check (char_length(name) <= 300),
  amount numeric(10, 2) not null check (amount >= 0),
  unit text not null check (char_length(unit) <= 32),
  grams numeric(10, 2) not null check (grams >= 0),
  amount_source text not null check (amount_source in ('weighed', 'label', 'measured', 'hand', 'estimated')),
  state text check (state in ('raw', 'cooked', 'dry')),
  calories numeric(8, 1) not null check (calories >= 0),
  protein_g numeric(8, 1) not null check (protein_g >= 0),
  carbs_g numeric(8, 1) not null check (carbs_g >= 0),
  fat_g numeric(8, 1) not null check (fat_g >= 0),
  -- QUESTIONS.md Q34: flagged until edited or confirmed; the reason picks
  -- the signal ("match" shows Check this, "amount" shows Estimated).
  flagged boolean not null default false,
  flag_reason text check (flag_reason in ('match', 'amount')),
  check (flagged = (flag_reason is not null))
);

create index food_entry_items_entry_id_idx on public.food_entry_items (entry_id);
create index food_entry_items_user_id_idx on public.food_entry_items (user_id);

-- An item always belongs to an entry of the same user.
create function private.check_item_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.food_entries where id = new.entry_id and user_id = new.user_id) then
    raise exception 'Item user does not match its entry' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.check_item_owner() from public, anon, authenticated;

create trigger food_entry_items_owner
  before insert or update of entry_id, user_id on public.food_entry_items
  for each row execute function private.check_item_owner();

alter table public.food_entries enable row level security;
alter table public.food_entry_items enable row level security;

create policy "food_entries: read own or assigned"
  on public.food_entries for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "food_entries: insert own"
  on public.food_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "food_entries: update own"
  on public.food_entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "food_entries: delete own"
  on public.food_entries for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "food_entry_items: read own or assigned"
  on public.food_entry_items for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "food_entry_items: insert own"
  on public.food_entry_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "food_entry_items: update own"
  on public.food_entry_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "food_entry_items: delete own"
  on public.food_entry_items for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.food_entries, public.food_entry_items from anon;
-- The audit trail (raw input, model output, confidence, call id) is written
-- once and never edited. A table grant covers every column, so revoke it and
-- grant back only what a user may change.
revoke update on public.food_entries from authenticated;
grant update (logged_at, meal_tag, status, updated_at) on public.food_entries to authenticated;
