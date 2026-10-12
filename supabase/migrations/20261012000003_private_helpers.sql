-- Supabase security advisor (lints 0028, 0029): SECURITY DEFINER functions
-- in the public schema are callable over /rest/v1/rpc. Move the RLS helpers
-- and the signup trigger function into a schema the API does not expose.
-- Policies and the trigger reference functions by OID, so they keep working.

create schema if not exists private;
revoke all on schema private from public, anon;
-- Policy expressions run as the querying user, who needs to reach the helpers.
grant usage on schema private to authenticated;

alter function public.is_coach() set schema private;
alter function public.is_coach_of(uuid) set schema private;
alter function public.my_coach_id() set schema private;
alter function public.handle_new_user() set schema private;

-- is_coach_of called public.is_coach() by name; point it at the new schema.
create or replace function private.is_coach_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_coach() and exists (
    select 1 from public.profiles
    where id = target and coach_id = (select auth.uid())
  );
$$;

-- The trigger function is only ever fired by the trigger on auth.users.
revoke execute on function private.handle_new_user() from public, anon, authenticated;
