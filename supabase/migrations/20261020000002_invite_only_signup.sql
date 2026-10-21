-- Invite-only signup (Sean, 2026-10-20; security audit M1). Supabase Auth
-- calls hook_before_user_created before it creates any user. A new account
-- is allowed only for an email with an open invite (not claimed, revoked or
-- expired). app_config.signup_allowlist ({"emails": [], "domains": []}) is
-- for local and CI test accounts; it is seeded only into local databases.
-- Existing users are not affected: the hook runs only when a user is created.
--
-- Hosted: enable the hook in the dashboard (Authentication, Hooks, Before User
-- Created, Postgres function public.hook_before_user_created). Locally,
-- supabase/config.toml enables it.

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(event #>> '{user,email}', '')));
  allow jsonb;
begin
  if v_email <> '' then
    if exists (
      select 1 from public.invites i
      where lower(i.email) = v_email and i.claimed_at is null and i.revoked_at is null and i.expires_at > now()
    ) then
      return '{}'::jsonb;
    end if;

    select value into allow from public.app_config where key = 'signup_allowlist';
    if allow is not null and (
      coalesce(allow -> 'emails', '[]'::jsonb) ? v_email
      or coalesce(allow -> 'domains', '[]'::jsonb) ? split_part(v_email, '@', 2)
    ) then
      return '{}'::jsonb;
    end if;
  end if;

  -- The sign in screen reads this message (app/sign-in/sign-in-form.tsx).
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'invite_required'));
end;
$$;

-- Only Supabase Auth may call it; never the API roles.
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Accepting an invite turns AI logging on (the coach can still turn it off
-- per client), recorded as changed by the coach who sent the invite.
create or replace function public.claim_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites%rowtype;
begin
  if uid is null then
    return 'signed_out';
  end if;
  select * into inv from public.invites
  where token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
  for update;
  if not found then
    return 'invalid';
  end if;
  if inv.claimed_at is not null then
    return case when inv.claimed_by = uid then 'yours' else 'used' end;
  end if;
  if inv.revoked_at is not null then
    return 'revoked';
  end if;
  if inv.expires_at <= now() then
    return 'expired';
  end if;
  if exists (select 1 from public.profiles where id = uid and role = 'coach') then
    return 'coach';
  end if;

  update public.profiles
  set coach_id = inv.coach_id, tier = 'paid', billing_source = inv.billing_source,
      ai_enabled = true, ai_enabled_changed_by = inv.coach_id, ai_enabled_changed_at = now()
  where id = uid;
  update public.invites
  set claimed_by = uid, claimed_email = (select auth.jwt() ->> 'email'), claimed_at = now()
  where id = inv.id;
  return 'claimed';
end;
$$;
