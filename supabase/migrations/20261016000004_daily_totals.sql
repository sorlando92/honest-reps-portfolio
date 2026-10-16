-- Daily aggregates for Today and Progress (docs/PROGRESS_SPEC.md "Data and
-- performance", ARCHITECTURE.md "Daily aggregates and Progress"). Additive:
-- two read-only functions.
--
-- Security invoker, so RLS decides whose rows come back: the owner reads
-- their own days, the assigned coach reads the same days (step 5 client week
-- view), anyone else gets days with nothing logged and no targets.

-- One row per local date from p_from to p_to (at most 400 days), in the
-- user's profile timezone: food totals from final entries, the targets in
-- effect at the end of that local day, the adherence results (app_config
-- "adherence"), and the weigh-in. adherent and protein_hit are null when no
-- targets existed yet that day.
create function public.daily_totals(p_user_id uuid, p_from date, p_to date)
returns table (
  local_date date,
  logged boolean,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  items integer,
  weighed_items integer,
  target_calories integer,
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer,
  adherent boolean,
  protein_hit boolean,
  weight_kg numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  p as (
    select coalesce((select timezone from public.profiles where id = p_user_id), 'UTC') as tz
  ),
  cfg as (
    select
      coalesce((select (value ->> 'calorie_tolerance_pct')::numeric from public.app_config where key = 'adherence'), 10) as tol,
      coalesce((select (value ->> 'protein_hit_pct')::numeric from public.app_config where key = 'adherence'), 90) as hit
  ),
  days as (
    select d::date as local_date
    from generate_series(p_from, least(p_to, p_from + 399), interval '1 day') d
  ),
  food as (
    select
      (e.logged_at at time zone p.tz)::date as local_date,
      sum(i.calories) as calories,
      sum(i.protein_g) as protein_g,
      sum(i.carbs_g) as carbs_g,
      sum(i.fat_g) as fat_g,
      count(i.id)::integer as items,
      (count(i.id) filter (where i.amount_source = 'weighed'))::integer as weighed_items
    from p, public.food_entries e
    join public.food_entry_items i on i.entry_id = e.id
    where e.user_id = p_user_id
      and e.status = 'final'
      and e.logged_at >= (p_from::timestamp at time zone p.tz)
      and e.logged_at < ((least(p_to, p_from + 399) + 1)::timestamp at time zone p.tz)
    group by 1
  )
  select
    d.local_date,
    f.local_date is not null as logged,
    coalesce(f.calories, 0),
    coalesce(f.protein_g, 0),
    coalesce(f.carbs_g, 0),
    coalesce(f.fat_g, 0),
    coalesce(f.items, 0),
    coalesce(f.weighed_items, 0),
    t.calories,
    t.protein_g,
    t.carbs_g,
    t.fat_g,
    case when t.calories is null then null
      else f.local_date is not null and abs(f.calories - t.calories) <= t.calories * cfg.tol / 100 end,
    case when t.protein_g is null then null
      else f.local_date is not null and f.protein_g >= t.protein_g * cfg.hit / 100 end,
    w.weight_kg
  from days d
  cross join p
  cross join cfg
  left join food f on f.local_date = d.local_date
  left join lateral (
    select calories, protein_g, carbs_g, fat_g
    from public.targets
    where user_id = p_user_id
      and effective_from < ((d.local_date + 1)::timestamp at time zone p.tz)
    order by effective_from desc
    limit 1
  ) t on true
  left join public.weights w on w.user_id = p_user_id and w.date = d.local_date
  order by d.local_date
$$;

-- The logging streak (docs/TODAY_SPEC.md 4): consecutive local days with at
-- least one final entry, ending on p_today, or on the day before when
-- p_today has nothing yet (a streak does not break until the day ends).
create function public.logging_streak(p_user_id uuid, p_today date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with
  p as (
    select coalesce((select timezone from public.profiles where id = p_user_id), 'UTC') as tz
  ),
  logged as (
    select distinct (e.logged_at at time zone p.tz)::date as local_date
    from p, public.food_entries e
    where e.user_id = p_user_id
      and e.status = 'final'
      and e.logged_at < ((p_today + 1)::timestamp at time zone p.tz)
      and e.logged_at >= ((p_today - 400)::timestamp at time zone p.tz)
  ),
  anchor as (
    select case when exists (select 1 from logged where local_date = p_today) then p_today else p_today - 1 end as d
  ),
  -- Each logged day minus its rank: days in an unbroken run share a group.
  runs as (
    select local_date, local_date - (row_number() over (order by local_date))::integer as grp
    from logged
  )
  select coalesce((
    select count(*)::integer
    from runs
    where grp = (select r.grp from runs r, anchor a where r.local_date = a.d)
  ), 0)
$$;

revoke all on function public.daily_totals(uuid, date, date) from public, anon;
revoke all on function public.logging_streak(uuid, date) from public, anon;
grant execute on function public.daily_totals(uuid, date, date) to authenticated;
grant execute on function public.logging_streak(uuid, date) to authenticated;
