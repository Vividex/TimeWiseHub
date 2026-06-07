-- ============================================================
-- TimeWiseHub — Schema 031: Payslip vault (store official payslips, Path C)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false);

-- Path convention: {employee_user_id}/{uuid}.pdf  → foldername[1] = the employee.

create policy "Employee can view own payslips"
  on storage.objects for select
  using (
    bucket_id = 'payslips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Admins can view org payslips"
  on storage.objects for select
  using (
    bucket_id = 'payslips'
    and exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy "Admins can upload org payslips"
  on storage.objects for insert
  with check (
    bucket_id = 'payslips'
    and exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy "Admins can delete org payslips"
  on storage.objects for delete
  using (
    bucket_id = 'payslips'
    and exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );

create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  label        text not null,
  pay_date     date not null,
  file_path    text not null,
  uploaded_by  uuid not null references public.profiles,
  uploaded_at  timestamptz not null default now()
);

alter table public.payslips enable row level security;

create policy "own_or_admin_read" on public.payslips for select
  using (
    user_id = auth.uid()
    or org_id in (select org_id from public.organisation_members
                  where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "admin_insert" on public.payslips for insert
  with check (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "admin_delete" on public.payslips for delete
  using (
    org_id in (select org_id from public.organisation_members
               where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create index payslips_user on public.payslips (user_id, pay_date desc);
create index payslips_org on public.payslips (org_id, pay_date desc);
