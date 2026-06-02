-- ============================================================
-- TimeWiseHub — Schema 007: Recurring expenses / subscriptions
-- Run in Supabase SQL Editor
-- ============================================================

create type public.recurrence_interval as enum ('weekly', 'fortnightly', 'monthly', 'annually');

alter table public.expenses
  add column is_recurring boolean not null default false,
  add column recurrence_interval public.recurrence_interval,
  add column next_billing_date date;

-- Index for subscription dashboard queries
create index expenses_recurring on public.expenses (user_id, is_recurring, next_billing_date)
  where is_recurring = true;
