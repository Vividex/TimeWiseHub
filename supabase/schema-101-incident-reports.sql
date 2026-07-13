-- ============================================================
-- TimeWiseHub — Schema 101: Incident reports
-- Workplace safety incident reports (injury / near-miss / hazard).
-- Filed by owner/admin/manager only. Permanent once closed — no UPDATE
-- policy matches a closed row, and there is no DELETE policy at all on
-- either table. This is a deliberate compliance-record design, not an
-- oversight (see docs/superpowers/specs/2026-07-13-incident-reports-design.md).
--
-- Visibility (via can_access_incident_report()):
--   - owner/admin: always, org-wide.
--   - manager: reports where the employee is unassigned to any crew, in no
--     crew, or in a crew THIS manager runs — same crew-scoping shape as
--     can_access_vehicle().
--   - anyone: if they are the report's employee_id, or listed in
--     witness_ids (read-only either way — the RLS UPDATE policy separately
--     requires owner/admin/manager, so this alone never grants write access).
-- Run via Supabase MCP apply_migration (name: incident_reports)
-- ============================================================

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('injury', 'near_miss', 'hazard')),
  severity text not null check (severity in ('minor', 'moderate', 'serious', 'critical')),
  occurred_at timestamptz not null,
  location text,
  description text not null,
  employee_id uuid references auth.users(id) on delete set null,
  witness_ids uuid[] not null default '{}',
  body_part text,
  first_aid_given boolean,
  medical_treatment_required boolean,
  time_off_work boolean,
  root_cause text,
  corrective_action text,
  status text not null default 'open' check (status in ('open', 'closed')),
  filed_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index incident_reports_org_id_idx on public.incident_reports(org_id);
create index incident_reports_employee_id_idx on public.incident_reports(employee_id);

create table public.incident_report_photos (
  id uuid primary key default gen_random_uuid(),
  incident_report_id uuid not null references public.incident_reports(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index incident_report_photos_report_id_idx on public.incident_report_photos(incident_report_id);

alter table public.incident_reports enable row level security;
alter table public.incident_report_photos enable row level security;

create or replace function public.can_access_incident_report(
  p_org_id uuid,
  p_employee_id uuid,
  p_witness_ids uuid[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from organisation_members om
      where om.org_id = p_org_id and om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or (
          om.role = 'manager'
          and (
            p_employee_id is null
            or not exists (select 1 from crew_members cm where cm.user_id = p_employee_id)
            or exists (
              select 1 from crew_members cm
              join crews c on c.id = cm.crew_id
              where cm.user_id = p_employee_id and c.manager_id = auth.uid()
            )
          )
        )
      )
    )
    or p_employee_id = auth.uid()
    or auth.uid() = any(p_witness_ids);
$$;

create policy "Users can view accessible incident reports"
  on public.incident_reports for select
  using (can_access_incident_report(org_id, employee_id, witness_ids));

create policy "Managers+ can file incident reports"
  on public.incident_reports for insert
  with check (
    filed_by = auth.uid()
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
  );

-- USING sees the OLD row: only an open report can be the target of an update
-- at all, which is what makes "closed = locked" hold even for the owner.
-- WITH CHECK sees the NEW row: if the write is closing the report (setting
-- status = 'closed'), reviewed_by must be the person doing it — you cannot
-- attribute a close action to someone else.
create policy "Managers+ can update open incident reports they can access"
  on public.incident_reports for update
  using (
    status = 'open'
    and can_access_incident_report(org_id, employee_id, witness_ids)
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    can_access_incident_report(org_id, employee_id, witness_ids)
    and exists (
      select 1 from organisation_members om
      where om.org_id = incident_reports.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and (status = 'open' or reviewed_by = auth.uid())
  );

-- No delete policy on incident_reports at all — RLS default-denies DELETE
-- when a table has RLS enabled and no matching policy. This is intentional.

create policy "Users can view photos for accessible incident reports"
  on public.incident_report_photos for select
  using (
    exists (
      select 1 from incident_reports ir
      where ir.id = incident_report_photos.incident_report_id
      and can_access_incident_report(ir.org_id, ir.employee_id, ir.witness_ids)
    )
  );

create policy "Managers+ can add photos to open incident reports"
  on public.incident_report_photos for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from incident_reports ir
      join organisation_members om on om.org_id = ir.org_id and om.user_id = auth.uid()
      where ir.id = incident_report_photos.incident_report_id
      and ir.status = 'open'
      and om.role in ('owner', 'admin', 'manager')
    )
  );

-- No delete/update policy on incident_report_photos either — append-only,
-- same shape as vehicle_notes.

insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', false)
on conflict (id) do nothing;

-- Storage path convention: {incident_report_id}/{filename} — mirrors the
-- existing path-based storage RLS pattern used for worksheet-stickers.
create policy "Users can view incident photos for accessible reports"
  on storage.objects for select
  using (
    bucket_id = 'incident-photos'
    and exists (
      select 1 from incident_reports ir
      where ir.id::text = (storage.foldername(name))[1]
      and can_access_incident_report(ir.org_id, ir.employee_id, ir.witness_ids)
    )
  );

create policy "Managers+ can upload incident photos"
  on storage.objects for insert
  with check (
    bucket_id = 'incident-photos'
    and exists (
      select 1 from incident_reports ir
      join organisation_members om on om.org_id = ir.org_id and om.user_id = auth.uid()
      where ir.id::text = (storage.foldername(name))[1]
      and ir.status = 'open'
      and om.role in ('owner', 'admin', 'manager')
    )
  );
