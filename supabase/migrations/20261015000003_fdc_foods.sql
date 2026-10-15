-- QUESTIONS.md Q40: USDA FoodData Central Foundation, SR Legacy and FNDDS
-- imported into Postgres and searched locally, replacing the FDC search API
-- for generic foods. Branded foods are not imported (brand queries still use
-- the API). Loaded by scripts/import-fdc.mts; reference data, read only.

create table public.fdc_foods (
  fdc_id integer primary key,
  data_type text not null check (data_type in ('Foundation', 'SR Legacy', 'Survey (FNDDS)')),
  description text not null,
  -- kcal, protein_g, carbs_g, fat_g per 100 g, as the API reported them.
  per_100g jsonb not null,
  -- Common household portions, most common first: [{label, grams}].
  portions jsonb not null default '[]'::jsonb,
  -- The FDC release the row came from, for example "SR Legacy 2018-04".
  release text not null,
  search tsvector generated always as (to_tsvector('english', description)) stored
);

create index fdc_foods_search_idx on public.fdc_foods using gin (search);

alter table public.fdc_foods enable row level security;

create policy "fdc_foods: signed in users read"
  on public.fdc_foods for select to authenticated
  using (true);

revoke all on public.fdc_foods from anon;
revoke insert, update, delete on public.fdc_foods from authenticated;

-- Candidates for the matcher: foods sharing any word with the query, best
-- full text rank first. The app re-ranks them (modules/nutrition/parsing/match.ts).
create function public.search_fdc(p_query text, p_limit integer default 100)
returns setof public.fdc_foods
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select nullif(replace(pg_catalog.plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery as query
  )
  select f.*
  from public.fdc_foods f, q
  where q.query is not null and f.search @@ q.query
  order by pg_catalog.ts_rank_cd(f.search, q.query) desc, f.fdc_id
  limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.search_fdc(text, integer) from public, anon;
grant execute on function public.search_fdc(text, integer) to authenticated, service_role;
