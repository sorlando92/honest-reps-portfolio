-- MVP step 1: edit a logged entry (PRD F2 "Edit and delete any entry").
-- Replaces an entry's items in one transaction so an edit never leaves an
-- entry half saved. Security invoker: RLS on both tables still applies, so a
-- user can only replace items on their own entries.

create function public.replace_food_entry_items(p_entry_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.food_entries where id = p_entry_id;
  if owner is null or owner <> (select auth.uid()) then
    raise exception 'Entry not found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An entry needs at least one item' using errcode = '22023';
  end if;

  delete from public.food_entry_items where entry_id = p_entry_id;

  insert into public.food_entry_items (
    entry_id, user_id, position, food_item_id, name, amount, unit, grams,
    amount_source, state, calories, protein_g, carbs_g, fat_g, flagged, flag_reason
  )
  select
    p_entry_id, owner, (ordinality - 1)::smallint,
    nullif(i ->> 'food_item_id', '')::uuid, i ->> 'name', (i ->> 'amount')::numeric, i ->> 'unit',
    (i ->> 'grams')::numeric, i ->> 'amount_source', nullif(i ->> 'state', ''),
    (i ->> 'calories')::numeric, (i ->> 'protein_g')::numeric, (i ->> 'carbs_g')::numeric, (i ->> 'fat_g')::numeric,
    (i ->> 'flag_reason') is not null, i ->> 'flag_reason'
  from jsonb_array_elements(p_items) with ordinality as t (i, ordinality);

  update public.food_entries set updated_at = now() where id = p_entry_id;
end;
$$;

revoke execute on function public.replace_food_entry_items(uuid, jsonb) from public, anon;
grant execute on function public.replace_food_entry_items(uuid, jsonb) to authenticated;
