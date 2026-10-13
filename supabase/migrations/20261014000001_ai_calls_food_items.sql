-- M1 step 1: LLM call log (core) and the food database cache (nutrition).

-- ---------------------------------------------------------------------------
-- ai_calls: one row per LLM call (AI_PROMPTS.md, QUESTIONS.md Q10). Written
-- by the server with the service role. Readable by the coach for assigned
-- users; users never read it. Kept without the user id when an account is
-- deleted, so cost and failure history survive.
-- ---------------------------------------------------------------------------
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  prompt_id text not null check (prompt_id in ('P1', 'P2', 'P3', 'P4', 'P5')),
  prompt_version text not null,
  editable_layer_version_id uuid,
  model text not null,
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  outcome text not null check (outcome in ('ok', 'retried', 'fallback', 'error')),
  validation text not null check (validation in ('passed', 'failed_then_passed', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index ai_calls_user_id_created_at_idx on public.ai_calls (user_id, created_at);
create index ai_calls_prompt_id_created_at_idx on public.ai_calls (prompt_id, created_at);

alter table public.ai_calls enable row level security;

create policy "ai_calls: coach reads assigned users"
  on public.ai_calls for select to authenticated
  using (private.is_coach_of(user_id));

revoke all on public.ai_calls from anon;
revoke insert, update, delete on public.ai_calls from authenticated;

-- ---------------------------------------------------------------------------
-- food_items: foods matched from USDA FoodData Central and Open Food Facts,
-- plus curated custom items. Shared reference data: every signed in user
-- reads it, only the server writes it. Nutrients are per 100 g.
-- ---------------------------------------------------------------------------
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('usda', 'off', 'custom')),
  source_id text not null,
  name text not null check (char_length(name) <= 300),
  brand text,
  data_type text,
  state text check (state in ('raw', 'cooked', 'dry')),
  per_100g jsonb not null,
  serving jsonb,
  barcode text,
  fetched_at timestamptz not null default now(),
  unique (source, source_id)
);

create index food_items_barcode_idx on public.food_items (barcode) where barcode is not null;

alter table public.food_items enable row level security;

create policy "food_items: signed in users read"
  on public.food_items for select to authenticated
  using (true);

revoke all on public.food_items from anon;
revoke insert, update, delete on public.food_items from authenticated;
