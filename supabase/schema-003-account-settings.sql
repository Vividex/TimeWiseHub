-- ============================================================
-- TimeWiseHub — Schema 003: Account settings
-- Run in Supabase SQL Editor
-- ============================================================

alter table public.profiles
  add column notification_preferences jsonb not null default '{
    "deadline_alerts": true,
    "priority_nudges": true,
    "daily_digest": true,
    "idle_alerts": true
  }'::jsonb;
