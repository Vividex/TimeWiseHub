-- ============================================================
-- TimeWiseHub — Schema 053: Nightly roster + timesheet crons
-- ============================================================
-- IMPORTANT (conductor): Before applying this migration, store the
-- CRON_SECRET value in the database so pg_cron can pass it.
-- Run in Supabase SQL editor (requires superuser / dashboard access):
--
--   alter database postgres set app.cron_secret = '<your CRON_SECRET value>';
--   select pg_reload_conf();
--
-- The value must match the CRON_SECRET env var set on Vercel.
-- ============================================================

-- Job 1: Generate next week's shifts from recurring templates.
-- Runs at 00:00 UTC nightly. Self-selects orgs whose week starts tomorrow.
select cron.schedule(
  'roster-template-generate-nightly',
  '0 0 * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/roster/generate-from-template',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    )
  )
  $$
);

-- Job 2: Auto-submit timesheets from published roster shifts.
-- Runs at 00:05 UTC nightly (5 min after job 1). Self-selects orgs whose week ended yesterday.
select cron.schedule(
  'roster-timesheet-generate-nightly',
  '5 0 * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/timesheets/generate-weekly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    )
  )
  $$
);
