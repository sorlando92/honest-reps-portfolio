-- Onboarding saves in one transaction and is safe to retry (bug 2026-10-16:
-- a coach account with no coach failed half way and blamed the connection).
-- Additive: one function. Only the server calls it, with the service role,
-- after it has checked the session and computed the targets.
--
-- Retrying with the same answers changes nothing: the weigh-in is one per day
-- (upsert), consents are added only when that kind and version is missing,
-- and a targets row is added only when it differs from the latest one.

create function public.complete_onboarding(p_user_id uuid, p jsonb)
returns boolean -- true the first time this user finishes onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_time boolean;
  latest public.targets%rowtype;
  t jsonb := p -> 'targets';
  consent_kind text;
begin
  select onboarding_completed_at is null into first_time from public.profiles where id = p_user_id for update;
  if first_time is null then
    raise exception 'No profile for %', p_user_id using errcode = 'P0002';
  end if;

  update public.profiles set
    units = p ->> 'units',
    -- Set once; a retry or a later run never changes it.
    date_of_birth = coalesce(date_of_birth, (p ->> 'date_of_birth')::date),
    -- A medical yes stays until the coach reviews it (Q20).
    medical_flag = medical_flag or (p ->> 'medical')::boolean,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = p_user_id;

  insert into public.nutrition_profiles (user_id, goal, sex, height_cm, activity_level, goal_weight_kg, has_scale, updated_at)
  values (
    p_user_id, p ->> 'goal', p ->> 'sex', (p ->> 'height_cm')::numeric, p ->> 'activity_level',
    nullif(p ->> 'goal_weight_kg', '')::numeric, (p ->> 'has_scale')::boolean, now()
  )
  on conflict (user_id) do update set
    goal = excluded.goal, sex = excluded.sex, height_cm = excluded.height_cm, activity_level = excluded.activity_level,
    goal_weight_kg = excluded.goal_weight_kg, has_scale = excluded.has_scale, updated_at = now();

  insert into public.weights (user_id, date, weight_kg)
  values (p_user_id, (p ->> 'local_date')::date, (p ->> 'weight_kg')::numeric)
  on conflict (user_id, date) do update set weight_kg = excluded.weight_kg, updated_at = now();

  select * into latest from public.targets where user_id = p_user_id order by effective_from desc, created_at desc limit 1;
  if latest.id is null
    or latest.calories <> (t ->> 'calories')::int or latest.protein_g <> (t ->> 'protein_g')::int
    or latest.carbs_g <> (t ->> 'carbs_g')::int or latest.fat_g <> (t ->> 'fat_g')::int
    or latest.set_by <> 'formula'
  then
    insert into public.targets (user_id, calories, protein_g, carbs_g, fat_g, set_by, note, created_by)
    values (p_user_id, (t ->> 'calories')::int, (t ->> 'protein_g')::int, (t ->> 'carbs_g')::int, (t ->> 'fat_g')::int, 'formula', t ->> 'note', p_user_id);
  end if;

  for consent_kind in select jsonb_object_keys(p -> 'consent_versions') loop
    insert into public.consents (user_id, kind, version)
    select p_user_id, consent_kind, p -> 'consent_versions' ->> consent_kind
    where not exists (
      select 1 from public.consents c where c.user_id = p_user_id and c.kind = consent_kind and c.version = p -> 'consent_versions' ->> consent_kind
    );
  end loop;

  return first_time;
end;
$$;

revoke execute on function public.complete_onboarding(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_onboarding(uuid, jsonb) to service_role;
