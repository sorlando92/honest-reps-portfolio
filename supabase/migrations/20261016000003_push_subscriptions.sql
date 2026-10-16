-- Web Push subscriptions (PRD F1 install step, F17). Additive. One row per
-- browser endpoint; a user has one per installed device. Only the owner reads
-- and writes; the server sends with the service role.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: read own"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push_subscriptions: insert own"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push_subscriptions: update own"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
