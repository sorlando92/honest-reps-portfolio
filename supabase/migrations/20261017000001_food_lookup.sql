-- docs/FOOD_LOOKUP_SPEC.md: the local food index with USDA Branded Foods
-- (QUESTIONS.md Q40 pulled forward), custom foods, barcode corrections, the
-- scan log and the new events. Additive: fdc_foods and search_fdc (P1
-- matching) are unchanged; food_items gains columns and policies, and its
-- read policy is replaced by one that hides other users' custom foods.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- fdc_branded: FDC Branded Foods, one row per product (canonical GTIN-14),
-- the latest available version, discontinued products left out. Loaded by
-- scripts/import-fdc.mts; reference data, read only. Nutrients per 100 g
-- (per 100 ml for liquids, as FDC publishes them).
-- ---------------------------------------------------------------------------
create table public.fdc_branded (
  fdc_id integer primary key,
  gtin text not null unique check (gtin ~ '^[0-9]{14}$'),
  description text not null,
  brand_owner text,
  brand_name text,
  -- The label serving: size in g or ml, and the household text ("1 scoop").
  serving_size numeric(10, 2),
  serving_unit text check (serving_unit in ('g', 'ml')),
  household_serving text,
  per_100g jsonb not null,
  category text,
  release text not null,
  -- Brand, owner and description, so "ascent chocolate" finds brand ASCENT
  -- and "fairlife core power" finds CORE POWER, owned by fairlife.
  name_search tsvector generated always as (
    to_tsvector('english', coalesce(brand_name, '') || ' ' || coalesce(brand_owner, '') || ' ' || description)
  ) stored
);

create index fdc_branded_name_search_idx on public.fdc_branded using gin (name_search);
create index fdc_branded_brand_idx on public.fdc_branded (lower(coalesce(nullif(brand_name, ''), brand_owner, '')));

alter table public.fdc_branded enable row level security;

create policy "fdc_branded: signed in users read"
  on public.fdc_branded for select to authenticated
  using (true);

revoke all on public.fdc_branded from anon;
revoke insert, update, delete on public.fdc_branded from authenticated;

-- ---------------------------------------------------------------------------
-- food_words: every word in the food index with how many foods use it, for
-- typo correction ("ascnet protien"). Rebuilt by refresh_food_words() after
-- each import. Read only to users through search_food_index().
-- ---------------------------------------------------------------------------
create table public.food_words (
  word text primary key,
  n integer not null
);

alter table public.food_words enable row level security;

create policy "food_words: signed in users read"
  on public.food_words for select to authenticated
  using (true);

revoke all on public.food_words from anon;
revoke insert, update, delete on public.food_words from authenticated;

-- ---------------------------------------------------------------------------
-- food_staples: the plain Foundation or SR Legacy item for everyday generic
-- searches (PM 2026-10-17): "egg" is a whole raw egg, not eggnog or dried
-- yolk. Reference data, reviewed by the PM; search puts it first in Basic
-- foods unless the user's own history says otherwise. Singular terms; a
-- trailing "s" in the query is ignored.
-- ---------------------------------------------------------------------------
create table public.food_staples (
  term text primary key check (term = lower(term)),
  fdc_id integer not null
);

alter table public.food_staples enable row level security;

create policy "food_staples: signed in users read"
  on public.food_staples for select to authenticated
  using (true);

revoke all on public.food_staples from anon;
revoke insert, update, delete on public.food_staples from authenticated;

insert into public.food_staples (term, fdc_id) values
  ('almonds', 170567),
  ('apple', 171688),
  ('avocado', 171705),
  ('banana', 173944),
  ('black beans', 173735),
  ('blueberry', 171711),
  ('bread', 174924),
  ('broccoli', 170379),
  ('brown rice', 169704),
  ('butter', 173410),
  ('carrot', 170393),
  ('cheddar cheese', 328637),
  ('chicken breast', 171477),
  ('chicken thigh', 172388),
  ('cottage cheese', 172182),
  ('egg', 171287),
  ('egg white', 172183),
  ('grape', 174683),
  ('greek yogurt', 330137),
  ('ground beef', 174032),
  ('ground turkey', 171506),
  ('milk', 171265),
  ('oatmeal', 173904),
  ('oats', 173904),
  ('olive oil', 171413),
  ('orange', 169097),
  ('pasta', 169737),
  ('peanut butter', 172470),
  ('potato', 170093),
  ('quinoa', 168917),
  ('rice', 168878),
  ('salmon', 175168),
  ('shrimp', 175180),
  ('spinach', 168462),
  ('strawberry', 167762),
  ('sweet potato', 168483),
  ('tofu', 172475),
  ('tuna', 334194),
  ('white rice', 168878),
  ('whole wheat bread', 172688);

-- Brand and query text compared word by word: lower case, apostrophes
-- dropped ("Culver's" is "culvers"), anything else that is not a letter or
-- digit is a space ("Chick-fil-A" is "chick fil a").
create function private.norm_words(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(lower(coalesce(t, '')), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- search_food_index() runs as its caller: signed in users already reach
-- private; the server (service role, the search eval) needs it too.
grant usage on schema private to service_role;
grant execute on function private.norm_words(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- food_items: custom foods (FOOD_LOOKUP_SPEC 4), product images, popularity.
-- ---------------------------------------------------------------------------
alter table public.food_items drop constraint food_items_source_check;
alter table public.food_items add constraint food_items_source_check
  check (source in ('usda', 'off', 'custom', 'user'));

alter table public.food_items
  -- Set only for source = user: the member who created the custom food.
  add column owner_id uuid references public.profiles (id) on delete cascade,
  -- Open Food Facts front image, shown on the barcode confirmation.
  add column image_url text check (image_url ~ '^https://'),
  -- Logged items across non-test users (gym-wide popularity), kept by trigger.
  add column log_count integer not null default 0,
  add constraint food_items_owner_iff_user check ((source = 'user') = (owner_id is not null)),
  add constraint food_items_user_brand_length check (source <> 'user' or char_length(coalesce(brand, '')) <= 200),
  add constraint food_items_barcode_digits check (source <> 'user' or barcode is null or barcode ~ '^[0-9]{14}$'),
  add constraint food_items_user_serving check (source <> 'user' or jsonb_typeof(serving) = 'object');

-- One custom food per barcode per user.
create unique index food_items_owner_barcode_idx on public.food_items (owner_id, barcode)
  where source = 'user' and barcode is not null;
create index food_items_owner_idx on public.food_items (owner_id) where owner_id is not null;

-- Shared rows stay readable by every signed in user; a custom food only by
-- its owner and the owner's coach.
drop policy "food_items: signed in users read" on public.food_items;
create policy "food_items: shared, own or assigned"
  on public.food_items for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()) or private.is_coach_of(owner_id));

-- Users write only their own custom foods, and only these columns.
grant insert (source, source_id, owner_id, name, brand, data_type, per_100g, serving, barcode) on public.food_items to authenticated;
grant update (name, brand, per_100g, serving, barcode) on public.food_items to authenticated;
grant delete on public.food_items to authenticated;

create policy "food_items: insert own custom food"
  on public.food_items for insert to authenticated
  with check (source = 'user' and owner_id = (select auth.uid()));
create policy "food_items: update own custom food"
  on public.food_items for update to authenticated
  using (source = 'user' and owner_id = (select auth.uid()))
  with check (source = 'user' and owner_id = (select auth.uid()));
create policy "food_items: delete own custom food"
  on public.food_items for delete to authenticated
  using (source = 'user' and owner_id = (select auth.uid()));

-- Popularity: every logged item counts once for its food, unless the user is
-- a test profile (PRD section 5).
create function private.count_food_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.food_item_id is not null
     and not exists (select 1 from public.profiles where id = old.user_id and is_test) then
    update public.food_items set log_count = greatest(log_count - 1, 0) where id = old.food_item_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.food_item_id is not null
     and not exists (select 1 from public.profiles where id = new.user_id and is_test) then
    update public.food_items set log_count = log_count + 1 where id = new.food_item_id;
  end if;
  return null;
end;
$$;

revoke execute on function private.count_food_log() from public, anon, authenticated;

create trigger food_entry_items_count_food_log
  after insert or delete or update of food_item_id on public.food_entry_items
  for each row execute function private.count_food_log();

update public.food_items f
set log_count = c.n
from (
  select i.food_item_id, count(*)::integer as n
  from public.food_entry_items i
  join public.profiles p on p.id = i.user_id
  where i.food_item_id is not null and not p.is_test
  group by i.food_item_id
) c
where f.id = c.food_item_id;

-- ---------------------------------------------------------------------------
-- barcode_matches: the food a user picked after "Not this" (FOOD_LOOKUP_SPEC
-- 3), returned first on their next scan of that GTIN.
-- ---------------------------------------------------------------------------
create table public.barcode_matches (
  user_id uuid not null references public.profiles (id) on delete cascade,
  gtin text not null check (gtin ~ '^[0-9]{14}$'),
  food_item_id uuid not null references public.food_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, gtin)
);

alter table public.barcode_matches enable row level security;

create policy "barcode_matches: read own or assigned"
  on public.barcode_matches for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "barcode_matches: insert own"
  on public.barcode_matches for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "barcode_matches: update own"
  on public.barcode_matches for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "barcode_matches: delete own"
  on public.barcode_matches for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.barcode_matches from anon;

-- ---------------------------------------------------------------------------
-- barcode_scans: the scan log (FOOD_LOOKUP_SPEC "Admin view", "Test sets").
-- The server writes each lookup; the owner records what they did with it.
-- ---------------------------------------------------------------------------
create table public.barcode_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  raw_read text not null check (char_length(raw_read) between 1 and 64),
  gtin text check (gtin ~ '^[0-9]{14}$'),
  result text not null check (result in ('hit', 'miss')),
  source text check (source in ('user', 'cache', 'fdc', 'off')),
  food_item_id uuid references public.food_items (id) on delete set null,
  outcome text check (outcome in ('confirmed', 'not_this')),
  chosen_food_item_id uuid references public.food_items (id) on delete set null,
  reads_to_confirm smallint check (reads_to_confirm between 0 and 1000),
  ms_to_result integer check (ms_to_result >= 0),
  created_at timestamptz not null default now(),
  check ((result = 'hit') = (source is not null))
);

create index barcode_scans_user_created_idx on public.barcode_scans (user_id, created_at desc);

alter table public.barcode_scans enable row level security;

create policy "barcode_scans: read own or assigned"
  on public.barcode_scans for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach_of(user_id));
create policy "barcode_scans: owner records the outcome"
  on public.barcode_scans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.barcode_scans from anon;
revoke insert, update, delete on public.barcode_scans from authenticated;
grant update (outcome, chosen_food_item_id) on public.barcode_scans to authenticated;

-- ---------------------------------------------------------------------------
-- Events (standing approval): search_performed, barcode_scanned,
-- barcode_mismatch, label_scanned, custom_food_created.
-- ---------------------------------------------------------------------------
alter table public.events drop constraint events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent',
  'meal_copied', 'day_switched', 'streak_milestone', 'day_note_saved', 'macro_card_mode_changed',
  'progress_viewed', 'progress_week_changed', 'weight_range_changed',
  'quick_action_used', 'calendar_expanded',
  'search_performed', 'barcode_scanned', 'barcode_mismatch', 'label_scanned', 'custom_food_created'
));

-- ---------------------------------------------------------------------------
-- refresh_food_words(): rebuilds the word list from every searchable name.
-- Run by the import with the service role.
-- ---------------------------------------------------------------------------
create function public.refresh_food_words()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  truncate public.food_words;
  insert into public.food_words (word, n)
  select word, sum(ndoc)::integer
  from (
    select word, ndoc from pg_catalog.ts_stat('select search from public.fdc_foods')
    union all
    select word, ndoc from pg_catalog.ts_stat('select name_search from public.fdc_branded')
    union all
    select word, ndoc from pg_catalog.ts_stat(
      $q$select pg_catalog.to_tsvector('english', coalesce(brand, '') || ' ' || name) from public.food_items where owner_id is null$q$
    )
  ) w
  where char_length(word) between 2 and 40 and word !~ '^[0-9]+$'
  group by word;
  get diagnostics total = row_count;
  return total;
end;
$$;

revoke execute on function public.refresh_food_words() from public, anon, authenticated;
grant execute on function public.refresh_food_words() to service_role;

-- ---------------------------------------------------------------------------
-- search_food_index(): search as you type (FOOD_LOOKUP_SPEC 1, 2). Runs as
-- the user, so RLS decides which custom foods, history and favorites count.
-- Each query word becomes a prefix lexeme; a word no food starts with is
-- replaced by the closest known word (typos). Sections: mine (custom foods,
-- foods the user logged, favorites), brands (FDC Branded, curated chains,
-- cached Open Food Facts products), basic (Foundation, SR Legacy, FNDDS).
-- Score, in order of weight: user history, brand plus product match, data
-- completeness, gym-wide popularity, fuzzy similarity. An empty query
-- returns the user's most logged foods.
-- ---------------------------------------------------------------------------
create function public.search_food_index(p_query text, p_limit integer default 15)
returns table (
  section text,
  ref text,
  source text,
  source_id text,
  state text,
  barcode text,
  image_url text,
  food_item_id uuid,
  fdc_id integer,
  name text,
  brand text,
  data_type text,
  per_100g jsonb,
  serving jsonb,
  serving_size numeric,
  serving_unit text,
  household_serving text,
  portions jsonb,
  favorite_items jsonb,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := lower(left(coalesce(p_query, ''), 100));
  lim integer := least(greatest(coalesce(p_limit, 15), 1), 30);
  me uuid := (select auth.uid());
  words text[];
  lexemes text[] := '{}';
  w text;
  lex text;
  tsq tsquery;
  tsq_any tsquery;
  first_word text;
  first_two text;
begin
  -- Letters and digits only ("culver's" is "culvers"); one letter words carry no signal.
  q := private.norm_words(q);
  words := array(
    select t from pg_catalog.regexp_split_to_table(trim(q), '\s+') t
    where char_length(t) >= 2 or t ~ '^[0-9]$'
  );
  first_word := coalesce(words[1], '');
  first_two := array_to_string(words[1:2], ' ');

  foreach w in array words loop
    lex := (select x.lexeme from pg_catalog.unnest(pg_catalog.to_tsvector('english', w)) x limit 1);
    continue when lex is null; -- a stop word
    lexemes := lexemes || lex;
  end loop;

  if array_length(lexemes, 1) is null then
    if char_length(trim(q)) > 0 then return; end if;
    -- No query: the foods the user logged most.
    return query
      select 'mine'::text, 'item:' || fi.id, fi.source, fi.source_id, fi.state, fi.barcode, fi.image_url, fi.id, null::integer, fi.name, fi.brand, fi.data_type, fi.per_100g, fi.serving,
             null::numeric, null::text, null::text, null::jsonb, null::jsonb, h.n::real
      from (
        select i.food_item_id, count(*) as n
        from public.food_entry_items i
        where i.user_id = me and i.food_item_id is not null
        group by i.food_item_id
      ) h
      join public.food_items fi on fi.id = h.food_item_id
      order by h.n desc, fi.name
      limit lim;
    return;
  end if;

  tsq := (select string_agg(quote_literal(l) || ':*', ' & ')::tsquery from unnest(lexemes) l);
  tsq_any := (select string_agg(quote_literal(l) || ':*', ' | ')::tsquery from unnest(lexemes) l);

  -- Typos ("ascnet protien"): when no food has every word, each word may also
  -- be one of the two closest words that more foods use.
  if not exists (select 1 from public.fdc_branded b where b.name_search @@ tsq)
     and not exists (select 1 from public.fdc_foods f where f.search @@ tsq)
     and not exists (select 1 from public.food_items fi where fi.owner_id is null and fi.source = 'custom'
                     and pg_catalog.to_tsvector('english', coalesce(fi.brand, '') || ' ' || fi.name) @@ tsq) then
    tsq := (
      select string_agg('(' || quote_literal(l) || ':*' || coalesce((
        select string_agg(' | ' || quote_literal(v.word) || ':*', '')
        from (
          select fw.word from public.food_words fw
          where extensions.similarity(fw.word, l) >= 0.2 and fw.word <> l
            and fw.n > coalesce((select own.n from public.food_words own where own.word = l), 0)
          order by extensions.similarity(fw.word, l) desc, fw.n desc
          limit 2
        ) v
      ), '') || ')', ' & ')::tsquery
      from unnest(lexemes) l
    );
  end if;

  return query
  with
  history as (
    select i.food_item_id as id, count(*)::real as n
    from public.food_entry_items i
    where i.user_id = me and i.food_item_id is not null
    group by i.food_item_id
  ),
  -- food_items: the user's custom foods, curated chains, cached products and
  -- anything the user logged. Small enough to match row by row. A coach
  -- searching never sees clients' custom foods here.
  items as (
    select fi.id, fi.source, fi.source_id, fi.state, fi.barcode, fi.image_url, fi.name, fi.brand, fi.data_type, fi.per_100g, fi.serving, fi.log_count,
           coalesce(h.n, 0) as hist, (fi.owner_id = me or h.n is not null) as is_mine
    from public.food_items fi
    left join history h on h.id = fi.id
    where (fi.owner_id = me or (fi.owner_id is null and (fi.source in ('custom', 'off') or h.n is not null)))
      and (
        pg_catalog.to_tsvector('english', coalesce(fi.brand, '') || ' ' || fi.name) @@ tsq
        -- Curated chains are listed by component ("Chicken", "White Rice"):
        -- the chain named first plus any other word is enough.
        or (fi.source = 'custom' and first_word <> ''
            and private.norm_words(fi.brand) like first_word || '%'
            and pg_catalog.to_tsvector('english', fi.name) @@ tsq_any)
      )
  ),
  item_rows as (
    select case when it.is_mine then 'mine' else 'brands' end as section,
           'item:' || it.id as ref,
           it.source as source,
           it.source_id as source_id,
           it.state as state,
           it.barcode as barcode,
           it.image_url as image_url,
           it.id as food_item_id,
           case when it.source = 'usda' and it.source_id ~ '^[0-9]+$' then it.source_id::integer end as fdc_id,
           it.name as name,
           it.brand as brand,
           it.data_type as data_type,
           it.per_100g as per_100g,
           it.serving as serving,
           null::numeric as serving_size,
           null::text as serving_unit,
           null::text as household_serving,
           null::jsonb as portions,
           null::jsonb as favorite_items,
           (
             least(it.hist, 20) * 50
             + case when private.norm_words(it.brand) like first_two || '%' or (first_word <> '' and private.norm_words(it.brand) like first_word || '%') then 100 else 0 end
             + case when it.serving is not null or it.per_100g ?& array['kcal', 'protein_g', 'carbs_g', 'fat_g'] then 20 else 0 end
             + least(ln(1 + it.log_count) * 5, 15)
             + extensions.similarity(lower(coalesce(it.brand, '') || ' ' || it.name), q) * 10
           )::real as score
    from items it
  ),
  -- Branded candidates: products of the brand the query starts with, plus
  -- any product matching every word.
  branded as (
    (select b.* from public.fdc_branded b
     where lower(coalesce(nullif(b.brand_name, ''), b.brand_owner, '')) in (first_word, first_two) and b.name_search @@ tsq
     limit 200)
    union
    (select b.* from public.fdc_branded b where b.name_search @@ tsq limit 400)
  ),
  branded_rows as (
    select 'brands'::text as section,
           'fdc:' || b.fdc_id as ref,
           'fdc'::text as source,
           b.fdc_id::text as source_id,
           null::text as state,
           b.gtin as barcode,
           null::text as image_url,
           cached.id as food_item_id,
           b.fdc_id as fdc_id,
           b.description as name,
           coalesce(nullif(b.brand_name, ''), b.brand_owner) as brand,
           'Branded'::text as data_type,
           b.per_100g as per_100g,
           null::jsonb as serving,
           b.serving_size as serving_size,
           b.serving_unit as serving_unit,
           b.household_serving as household_serving,
           null::jsonb as portions,
           null::jsonb as favorite_items,
           (
             least(coalesce(h.n, 0), 20) * 50
             + case when private.norm_words(coalesce(nullif(b.brand_name, ''), b.brand_owner)) like first_two || '%'
                      or (first_word <> '' and private.norm_words(coalesce(nullif(b.brand_name, ''), b.brand_owner)) like first_word || '%')
                      or (first_word <> '' and private.norm_words(b.brand_owner) like first_word || '%') then 100 else 0 end
             + case when b.serving_size is not null and b.per_100g ?& array['kcal', 'protein_g', 'carbs_g', 'fat_g'] then 20 else 0 end
             + least(ln(1 + coalesce(cached.log_count, 0)) * 5, 15)
             + extensions.similarity(lower(coalesce(nullif(b.brand_name, ''), b.brand_owner, '') || ' ' || b.description), q) * 10
           )::real as score
    from branded b
    left join public.food_items cached on cached.source = 'usda' and cached.source_id = b.fdc_id::text
    left join history h on h.id = cached.id
  ),
  -- Generic candidates, shortest names first so "milk" keeps "Milk, whole".
  staple as (
    select st.fdc_id from public.food_staples st where st.term in (q, rtrim(q, 's'))
  ),
  generic as (
    (select f.* from public.fdc_foods f
     where f.search @@ tsq
     order by char_length(f.description)
     limit 400)
    union
    (select f.* from public.fdc_foods f where f.fdc_id in (select fdc_id from staple))
  ),
  generic_rows as (
    select 'basic'::text as section,
           'fdc:' || f.fdc_id as ref,
           'fdc'::text as source,
           f.fdc_id::text as source_id,
           null::text as state,
           null::text as barcode,
           null::text as image_url,
           cached.id as food_item_id,
           f.fdc_id as fdc_id,
           f.description as name,
           null::text as brand,
           f.data_type as data_type,
           f.per_100g as per_100g,
           null::jsonb as serving,
           null::numeric as serving_size,
           null::text as serving_unit,
           null::text as household_serving,
           f.portions as portions,
           null::jsonb as favorite_items,
           (
             least(coalesce(h.n, 0), 20) * 50
             + case when f.per_100g ?& array['kcal', 'protein_g', 'carbs_g', 'fat_g'] and jsonb_array_length(f.portions) > 0 then 20 else 0 end
             + least(ln(1 + coalesce(cached.log_count, 0)) * 5, 15)
             -- Generic names lead with the food ("Bananas, raw"): reward a match at the start.
             + case when first_word <> '' and lower(f.description) like first_word || '%' then 5 else 0 end
             -- The plain item for an everyday search ("egg", "rice"): first among basic foods.
             + case when f.fdc_id in (select fdc_id from staple) then 500 else 0 end
             -- The food itself, not a dish made with it: "Egg, whole" over "Egg burrito".
             + case when private.norm_words(split_part(f.description, ',', 1)) in (q, q || 's', rtrim(q, 's')) then 3 else 0 end
             + extensions.similarity(lower(f.description), q) * 10
           )::real as score
    from generic f
    left join public.food_items cached on cached.source = 'usda' and cached.source_id = f.fdc_id::text
    left join history h on h.id = cached.id
  ),
  favorite_rows as (
    select 'mine'::text as section,
           'fav:' || fv.id as ref,
           'favorite'::text as source,
           fv.id::text as source_id,
           null::text as state,
           null::text as barcode,
           null::text as image_url,
           null::uuid as food_item_id,
           null::integer as fdc_id,
           fv.title as name,
           null::text as brand,
           'Favorite'::text as data_type,
           null::jsonb as per_100g,
           null::jsonb as serving,
           null::numeric as serving_size,
           null::text as serving_unit,
           null::text as household_serving,
           null::jsonb as portions,
           fv.items as favorite_items,
           (1000 + extensions.similarity(lower(fv.title), q) * 10)::real as score
    from public.favorites fv
    where fv.user_id = me and pg_catalog.to_tsvector('english', fv.title) @@ tsq
  ),
  everything as (
    select * from item_rows
    union all select * from favorite_rows
    -- A food already shown from food_items is not repeated.
    union all select * from branded_rows br where br.food_item_id is null or not exists (select 1 from item_rows ir where ir.food_item_id = br.food_item_id)
    union all select * from generic_rows gr where gr.food_item_id is null or not exists (select 1 from item_rows ir where ir.food_item_id = gr.food_item_id)
  ),
  -- One row per name and brand in a section: FDC lists each package size of
  -- a product under its own GTIN. Shorter names break ties ("Banana, raw").
  deduped as (
    select e.*, row_number() over (
             partition by e.section, lower(e.name), lower(coalesce(e.brand, ''))
             order by e.score desc, char_length(e.name), e.ref
           ) as copy
    from everything e
  ),
  ranked as (
    select d.*, row_number() over (partition by d.section order by d.score desc, char_length(d.name), d.name) as rn
    from deduped d
    where d.copy = 1
  )
  select r.section, r.ref, r.source, r.source_id, r.state, r.barcode, r.image_url, r.food_item_id, r.fdc_id, r.name, r.brand, r.data_type, r.per_100g, r.serving,
         r.serving_size, r.serving_unit, r.household_serving, r.portions, r.favorite_items, r.score
  from ranked r
  where r.rn <= lim
  order by case r.section when 'mine' then 0 when 'brands' then 1 else 2 end, r.rn;
end;
$$;

revoke execute on function public.search_food_index(text, integer) from public, anon;
grant execute on function public.search_food_index(text, integer) to authenticated, service_role;

select public.refresh_food_words();

-- ---------------------------------------------------------------------------
-- search_fdc_branded(): P1 matching for an item with a brand (PM 2026-10-17,
-- Q67), in place of the FDC API. Every brand word must match; the food words
-- match on any word, best full text rank first, as search_fdc() does for
-- generic foods. The matcher re-ranks (modules/nutrition/parsing/match.ts).
-- ---------------------------------------------------------------------------
create function public.search_fdc_branded(p_brand text, p_query text, p_limit integer default 20)
returns setof public.fdc_branded
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      nullif(pg_catalog.plainto_tsquery('english', private.norm_words(p_brand))::text, '')::tsquery as brand,
      nullif(replace(pg_catalog.plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery as food
  )
  select b.*
  from public.fdc_branded b, q
  where q.brand is not null and b.name_search @@ q.brand
    and (q.food is null or b.name_search @@ q.food)
  order by pg_catalog.ts_rank_cd(b.name_search, coalesce(q.food, q.brand)) desc, b.fdc_id
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.search_fdc_branded(text, text, integer) from public, anon;
grant execute on function public.search_fdc_branded(text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fdc_import_runs: one row per dataset per import run (PM 2026-10-17, Q66):
-- the scheduled monthly refresh reports rows added, changed and removed.
-- Written by the import with the service role; the coach reads.
-- ---------------------------------------------------------------------------
create table public.fdc_import_runs (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('Foundation', 'SR Legacy', 'FNDDS', 'Branded')),
  release text not null,
  -- False when the latest release was already imported and nothing ran.
  imported boolean not null,
  added integer not null default 0 check (added >= 0),
  changed integer not null default 0 check (changed >= 0),
  removed integer not null default 0 check (removed >= 0),
  total integer check (total >= 0),
  trigger text not null check (trigger in ('schedule', 'manual')),
  ran_at timestamptz not null default now()
);

create index fdc_import_runs_dataset_ran_at_idx on public.fdc_import_runs (dataset, ran_at desc);

alter table public.fdc_import_runs enable row level security;

create policy "fdc_import_runs: coach reads"
  on public.fdc_import_runs for select to authenticated
  using (private.is_coach());

revoke all on public.fdc_import_runs from anon;
revoke insert, update, delete on public.fdc_import_runs from authenticated;
