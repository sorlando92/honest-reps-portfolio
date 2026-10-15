-- Today v2 (docs/TODAY_SPEC.md "Data", QUESTIONS.md Q49): every entry has a
-- meal. NOT ADDITIVE: renames food_entries.meal_tag and rewrites every row's
-- meal, so it needs PM approval before it runs on hosted.

-- 1. The old optional tag becomes the meal. The check constraint and the
--    user's update grant follow the column through the rename.
alter table public.food_entries rename column meal_tag to meal;

-- 2. Backfill from logged_at in the owner's timezone with the spec's windows:
--    breakfast 4:00 to 10:59, lunch 11:00 to 15:59, dinner 16:00 to 21:59,
--    otherwise snack. Rows already tagged keep their tag.
update public.food_entries e
set meal = case
  when extract(hour from e.logged_at at time zone p.timezone) between 4 and 10 then 'breakfast'
  when extract(hour from e.logged_at at time zone p.timezone) between 11 and 15 then 'lunch'
  when extract(hour from e.logged_at at time zone p.timezone) between 16 and 21 then 'dinner'
  else 'snack'
end
from public.profiles p
where p.id = e.user_id and e.meal is null;

alter table public.food_entries alter column meal set not null;

-- 3. Copied meals keep a link to what they were copied from (analytics).
alter table public.food_entries
  add column copied_from_entry_id uuid references public.food_entries (id) on delete set null;
