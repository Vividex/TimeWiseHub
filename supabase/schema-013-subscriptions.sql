-- ============================================================
-- TimeWiseHub — Schema 013: Subscriptions & billing
-- Run in Supabase SQL Editor
-- ============================================================

create type public.subscription_plan   as enum ('free', 'pro', 'team');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid');

create table public.subscriptions (
  id                     uuid default gen_random_uuid() primary key,
  user_id                uuid not null references public.profiles on delete cascade unique,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plan                   public.subscription_plan   not null default 'free',
  status                 public.subscription_status,
  seats                  integer not null default 1,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Webhook handler uses service role key — bypasses RLS automatically.
-- No additional policy needed for server-side writes.

create index subscriptions_stripe_customer on public.subscriptions (stripe_customer_id);
create index subscriptions_stripe_sub      on public.subscriptions (stripe_subscription_id);
