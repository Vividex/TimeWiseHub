-- ============================================================
-- TimeWiseHub - Schema 023: Scheduled report email preference
-- Run in Supabase SQL Editor
-- ============================================================

alter table public.profiles
  alter column notification_preferences set default '{
    "deadline_alerts": true,
    "priority_nudges": true,
    "daily_digest": true,
    "scheduled_reports": true,
    "idle_alerts": true
  }'::jsonb;

update public.profiles
set notification_preferences = notification_preferences || '{"scheduled_reports": true}'::jsonb
where not (notification_preferences ? 'scheduled_reports');
