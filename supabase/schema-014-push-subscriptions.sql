-- ============================================================
-- TimeWiseHub — Schema 014: Push notification subscriptions
-- Run in Supabase SQL Editor
-- ============================================================

create table public.push_subscriptions (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users can manage their own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id);
