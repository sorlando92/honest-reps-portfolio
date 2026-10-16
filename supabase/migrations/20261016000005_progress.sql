-- Progress tab (docs/PROGRESS_SPEC.md). Additive: one column, one read-only
-- function, and the event name check widened with the three Progress events
-- (standing approval for PRD event names).

-- Demo and test accounts (pnpm seed:demo). Excluded from every metric, the
-- north star and the coach roster flags count. Users cannot set it: their
-- column grant on profiles stays display_name, units, timezone.
alter table public.profiles add column is_test boolean not null default false;

alter table public.events drop constraint events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent',
  'meal_copied', 'day_switched', 'streak_milestone', 'day_note_saved', 'macro_card_mode_changed',
  'progress_viewed', 'progress_week_changed', 'weight_range_changed'
));

-- Everything the Progress screen shows, in one call (PROGRESS_SPEC "Data and
-- performance"), built on daily_totals so Today and Progress agree:
--   today, units
--   week:      the 7 days from p_week_start (a Monday), as daily_totals rows
--   averages:  over the week's days up to today; calories and protein over
--              logged days only; on target and protein days are null before
--              targets exist (Q59); weighed share of entry items (Q57)
--   days30:    the last 30 local days ending today: logged, adherent, weighed
--   weight:    weigh-ins in the last p_weight_range days with their EWMA
--              trend (alpha from app_config "weight_trend"), the trend just
--              before the range (null when there is none), and goal weight
-- Security invoker: the owner and the assigned coach read the same summary;
-- anyone else gets empty days and no weigh-ins.
create function public.progress_summary(p_user_id uuid, p_week_start date, p_weight_range integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz text;
  today date;
  alpha numeric;
  range_start date;
  trend numeric;
  trend_before numeric;
  w record;
  points jsonb := '[]'::jsonb;
  week jsonb;
  averages jsonb;
  days30 jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_weight_range not in (7, 30, 90) then
    raise exception 'weight_range must be 7, 30 or 90' using errcode = '22023';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_start must be a Monday' using errcode = '22023';
  end if;

  tz := coalesce((select timezone from public.profiles where id = p_user_id), 'UTC');
  today := (now() at time zone tz)::date;
  alpha := coalesce((select (value ->> 'alpha')::numeric from public.app_config where key = 'weight_trend'), 0.1);
  range_start := today - (p_weight_range - 1);

  select coalesce(jsonb_agg(to_jsonb(d) order by d.local_date), '[]'::jsonb)
  into week
  from public.daily_totals(p_user_id, p_week_start, p_week_start + 6) d;

  select jsonb_build_object(
    'elapsed_days', count(*),
    'logged_days', count(*) filter (where d.logged),
    'avg_calories', avg(d.calories) filter (where d.logged),
    'avg_protein_g', avg(d.protein_g) filter (where d.logged),
    'days_on_target', case when bool_or(d.target_calories is not null) then count(*) filter (where d.adherent) end,
    'protein_days', case when bool_or(d.target_calories is not null) then count(*) filter (where d.protein_hit) end,
    'weighed_share', case when sum(d.items) > 0 then sum(d.weighed_items)::numeric / sum(d.items) end
  )
  into averages
  from public.daily_totals(p_user_id, p_week_start, least(p_week_start + 6, today)) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.local_date,
    'logged', d.logged,
    'adherent', coalesce(d.adherent, false),
    'weighed', d.weight_kg is not null
  ) order by d.local_date), '[]'::jsonb)
  into days30
  from public.daily_totals(p_user_id, today - 29, today) d;

  -- The trend runs over a year of weigh-ins so it has settled by the range.
  for w in
    select date, weight_kg
    from public.weights
    where user_id = p_user_id and date between today - 365 and today
    order by date
  loop
    trend := case when trend is null then w.weight_kg else trend + alpha * (w.weight_kg - trend) end;
    if w.date < range_start then
      trend_before := trend;
    else
      points := points || jsonb_build_object('date', w.date, 'kg', w.weight_kg, 'trend_kg', round(trend, 3));
    end if;
  end loop;

  return jsonb_build_object(
    'today', today,
    'units', (select units from public.profiles where id = p_user_id),
    'week', week,
    'averages', averages,
    'days30', days30,
    'weight', jsonb_build_object(
      'range_days', p_weight_range,
      'points', points,
      'trend_before_kg', round(trend_before, 3),
      'goal_kg', (select goal_weight_kg from public.nutrition_profiles where user_id = p_user_id)
    )
  );
end;
$$;

revoke all on function public.progress_summary(uuid, date, integer) from public, anon;
grant execute on function public.progress_summary(uuid, date, integer) to authenticated;
