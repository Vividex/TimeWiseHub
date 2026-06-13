create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule nightly cert expiry notifications at 8 AM UTC
select cron.schedule(
  'cert-expiry-notify-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://sdwwlnnsijcadkdwsvud.supabase.co/functions/v1/cert-expiry-notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
