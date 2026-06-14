-- ============================================================
-- TimeWiseHub — Schema 053: Nightly roster + timesheet crons
-- ============================================================
-- Note: app.cron_secret GUC requires superuser (not available via MCP
-- or Supabase Dashboard). Secret is inlined here instead. The CRON_SECRET
-- only protects against premature cron triggering, not data access.
-- ============================================================

-- Job 1: Generate next week's shifts from recurring templates.
-- Runs at 00:00 UTC nightly. Self-selects orgs whose week starts tomorrow.
select cron.schedule(
  'roster-template-generate-nightly',
  '0 0 * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/roster/generate-from-template',
    headers := '{"Content-Type":"application/json","x-cron-secret":"484975b6-1f16-484a-a991-5f51b963a32f"}'::jsonb
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
    headers := '{"Content-Type":"application/json","x-cron-secret":"484975b6-1f16-484a-a991-5f51b963a32f"}'::jsonb
  )
  $$
);
