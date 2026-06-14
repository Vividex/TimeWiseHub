-- ============================================================
-- TimeWiseHub — Schema 052: Configurable pay-week start day
-- ============================================================

-- 0=Sun, 1=Mon(default), 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
alter table public.organisations
  add column pay_week_start_day smallint not null default 1
    check (pay_week_start_day between 0 and 6);

-- Drop the Monday-only constraint on timesheets.week_start.
-- Existing rows are all Mondays so no rows are invalidated.
-- The constraint was auto-named from the inline check in schema-020.
alter table public.timesheets
  drop constraint if exists timesheets_week_start_check;
