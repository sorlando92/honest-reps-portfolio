-- Today v2 (docs/TODAY_SPEC.md 6): copy a meal. Additive (one function), but
-- it depends on 20261015000004_meals, so it ships with it.
--
-- Copies the caller's final entries of one meal between two instants into new
-- entries at p_logged_at: same items, amounts, amount sources and flags. No
-- model call; the copy keeps the source's title (or its typed first line) and
-- links back through copied_from_entry_id. One transaction; security invoker,
-- so RLS limits it to the caller's own entries. Returns the entries copied.

create function public.copy_meal(p_from timestamptz, p_to timestamptz, p_meal text, p_logged_at timestamptz)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  src record;
  new_id uuid;
  copied integer := 0;
begin
  if me is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  for src in
    select id, title, raw_input
    from public.food_entries
    where user_id = me and status = 'final' and meal = p_meal and logged_at >= p_from and logged_at < p_to
    order by logged_at, created_at
  loop
    insert into public.food_entries (user_id, logged_at, meal, title, method, client_uuid, copied_from_entry_id)
    values (
      me,
      -- A millisecond apart, so the copies keep their order in the section.
      p_logged_at + make_interval(secs => copied / 1000.0),
      p_meal,
      coalesce(src.title, left(nullif(btrim(regexp_replace(split_part(src.raw_input, E'\n', 1), '\s+', ' ', 'g')), ''), 200)),
      'quick_add',
      gen_random_uuid(),
      src.id
    )
    returning id into new_id;

    insert into public.food_entry_items (
      entry_id, user_id, position, food_item_id, name, amount, unit, grams,
      amount_source, state, calories, protein_g, carbs_g, fat_g, flagged, flag_reason
    )
    select new_id, me, position, food_item_id, name, amount, unit, grams,
      amount_source, state, calories, protein_g, carbs_g, fat_g, flagged, flag_reason
    from public.food_entry_items
    where entry_id = src.id;

    copied := copied + 1;
  end loop;

  return copied;
end;
$$;

revoke execute on function public.copy_meal(timestamptz, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.copy_meal(timestamptz, timestamptz, text, timestamptz) to authenticated;
