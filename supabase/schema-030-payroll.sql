-- ============================================================
-- TimeWiseHub — Schema 030: Payroll / pay statements (Path C, informational)
-- ============================================================

-- Per-org payroll settings (governed by existing org-settings UPDATE policy).
alter table public.organisations
  add column pay_cadence text not null default 'fortnightly'
    check (pay_cadence in ('weekly', 'fortnightly', 'monthly')),
  add column super_rate numeric(5,2) not null default 12.0
    check (super_rate >= 0 and super_rate <= 100);

-- Per-person remembered tax estimate % (self-editable via profiles own-row policy).
alter table public.profiles
  add column tax_estimate_pct numeric(5,2)
    check (tax_estimate_pct is null or (tax_estimate_pct >= 0 and tax_estimate_pct <= 100));

-- Pay runs: one per org per period.
create table public.pay_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  period_start date not null,
  period_end   date not null,
  created_by   uuid not null references public.profiles,
  created_at   timestamptz not null default now(),
  unique (org_id, period_start, period_end)
);

alter table public.pay_runs enable row level security;

create policy "org_financial_manage_runs" on public.pay_runs for all
  using (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  )
  with check (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Pay statements.
create table public.pay_statements (
  id               uuid primary key default gen_random_uuid(),
  pay_run_id       uuid not null references public.pay_runs on delete cascade,
  org_id           uuid not null references public.organisations on delete cascade,
  user_id          uuid not null references public.profiles on delete cascade,
  period_start     date not null,
  period_end       date not null,
  approved_seconds integer not null default 0 check (approved_seconds >= 0),
  hourly_rate      numeric(10,2) not null,
  gross            numeric(12,2) not null,
  super_rate       numeric(5,2) not null,
  super_amount     numeric(12,2) not null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.pay_statements enable row level security;

-- SELECT: own row OR owner/admin of the org.
create policy "own_or_financial_read" on public.pay_statements for select
  using (
    user_id = auth.uid()
    or org_id in (select org_id from public.organisation_members
                  where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- INSERT/UPDATE/DELETE: owner/admin only.
create policy "financial_insert" on public.pay_statements for insert
  with check (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "financial_delete" on public.pay_statements for delete
  using (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create index pay_statements_user on public.pay_statements (user_id, period_start desc);
create index pay_statements_org on public.pay_statements (org_id, period_start desc);
