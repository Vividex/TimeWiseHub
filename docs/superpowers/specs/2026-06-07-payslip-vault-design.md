# Payslip Vault — Design

> **Staging note:** Authored by Claude. Codex commits to `docs/superpowers/specs/2026-06-07-payslip-vault-design.md` and makes all file changes in `C:/GameForge/timewisehub`. Independent feature; builds on the finance role model (S1) and reuses the app's existing private-bucket storage pattern.

**Goal:** Give each organisation one in-app home for **official** payslips issued by their external payroll system. An **admin uploads** a payslip PDF for an employee; the **employee** and **admins** can access it any time; managers and other employees cannot. TimeWiseHub only *stores* these documents — it does not generate official payslips (Path C).

**Architecture:** A private Supabase Storage bucket `payslips` (path `{employee_id}/{uuid}.pdf`) plus a `payslips` metadata table, both with RLS mirroring the pay-statement privacy model (own-or-owner/admin to read; owner/admin to write). Admin uploads client-side via `supabase-browser`; everyone downloads via short-lived **signed URLs**. Surfaced in the admin portal (upload + manage) and on each employee's finance page (read-only list).

**Tech Stack:** Next.js 16, React 19, Supabase Storage + Postgres + RLS (`supabase-browser` for upload/signed URLs), TypeScript, Tailwind v4. pnpm.

---

## Scope

**In scope (v1):** admin upload of a payslip (employee + label + pay date + PDF); private storage; the `payslips` table + RLS; admin manage list (with delete); employee read-only list with download.

**Out of scope:**
- Generating official/compliant payslips (the external payroll owns that).
- Email/external sending — **kept in-app** per decision.
- **In-app notification on upload** — deferred to a fast-follow; the app has no in-app notification centre (only email + web-push), and the payslip appearing in the employee's list is the in-app surface for v1.
- Linking payslips to internal pay runs (decided: **standalone**).
- Manager visibility (never — payslips carry pay figures).

---

## Locked decisions
- **Admin-only upload.** Employees and managers cannot upload.
- **All in-app.** No emailing files; download via signed URLs inside the app.
- **Standalone payslips:** each has an employee, a free-text `label`, and a `pay_date`. Not tied to internal pay runs.
- **PDF files.**
- Visibility: employee sees **their own**; owner/admin see **all org**; managers see **none**.

---

## Data model — migration `schema-031-payslips.sql`

(`031` is the next free number after `schema-030-payroll.sql`.)

### Storage bucket + policies

```sql
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false);

-- Path convention: {employee_user_id}/{uuid}.pdf  → foldername[1] = the employee the payslip is FOR.

-- Employee can read files in their own folder.
create policy "Employee can view own payslips"
  on storage.objects for select
  using (
    bucket_id = 'payslips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner/admin can read any payslip file for a member of their org (NOT managers).
create policy "Admins can view org payslips"
  on storage.objects for select
  using (
    bucket_id = 'payslips'
    and exists (
      select 1
      from public.organisation_members viewer
      join public.organisation_members target
        on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );

-- Owner/admin can upload a payslip into a folder belonging to a member of their org.
create policy "Admins can upload org payslips"
  on storage.objects for insert
  with check (
    bucket_id = 'payslips'
    and exists (
      select 1
      from public.organisation_members viewer
      join public.organisation_members target
        on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );

-- Owner/admin can delete org payslip files.
create policy "Admins can delete org payslips"
  on storage.objects for delete
  using (
    bucket_id = 'payslips'
    and exists (
      select 1
      from public.organisation_members viewer
      join public.organisation_members target
        on target.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin')
        and target.user_id::text = (storage.foldername(name))[1]
    )
  );
```

### `payslips` table

```sql
create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,   -- the employee it's for
  label        text not null,
  pay_date     date not null,
  file_path    text not null,
  uploaded_by  uuid not null references public.profiles,                     -- the admin who uploaded
  uploaded_at  timestamptz not null default now()
);

alter table public.payslips enable row level security;

-- Employee reads own; owner/admin read all org payslips.
create policy "own_or_admin_read" on public.payslips for select
  using (
    user_id = auth.uid()
    or org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Owner/admin insert/delete only.
create policy "admin_insert" on public.payslips for insert
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "admin_delete" on public.payslips for delete
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create index payslips_user on public.payslips (user_id, pay_date desc);
create index payslips_org on public.payslips (org_id, pay_date desc);
```

> **FK-ambiguity note (pre-empted):** `payslips` has **two** FKs to `profiles` (`user_id` + `uploaded_by`). Any PostgREST `profiles(...)` embed on `payslips` MUST use the hint `profiles!payslips_user_id_fkey(...)`, or it errors at runtime (the bug class fixed across the app in the embeds-fix task).

---

## Flows

### Upload (admin, client-side `supabase-browser`)
1. Admin selects an **employee** (from org members), enters **label** + **pay_date**, picks a **PDF**.
2. Build path: `${employeeUserId}/${crypto.randomUUID()}.pdf`.
3. `supabase.storage.from('payslips').upload(path, file)`.
4. Insert a `payslips` row (`org_id`, `user_id = employee`, `label`, `pay_date`, `file_path = path`, `uploaded_by = current user`).
5. Refresh the list. On upload failure, surface the error and do **not** insert the row; on insert failure after a successful upload, remove the orphaned file.

### Download (employee or admin)
`supabase.storage.from('payslips').createSignedUrl(file_path, 60)` → open the signed URL in a new tab. (Same pattern as `ExpenseList`/`ManagerExpenseView`.)

### Delete (admin)
`supabase.storage.from('payslips').remove([file_path])` then delete the `payslips` row.

---

## UI

- **`PayslipList`** (client) — renders rows (`label`, `pay_date`, uploaded date) with a **Download** button (signed URL on click). Accepts an `canDelete` prop; when true (admin), shows a Delete button.
- **`PayslipUpload`** (client, admin only) — form: employee `<select>` (org members), label, pay date, PDF file → runs the upload flow.
- **Admin portal** (`CompanyFinanceView`, org scope): a **"Payslips"** subsection under Payroll — `PayslipUpload` + a `PayslipList` of **all org payslips** (showing employee name; `canDelete`). Employee names resolved via `profiles!payslips_user_id_fkey(full_name, email)`.
- **Employee finance view** (`EmployeeFinanceView`): a **"Payslips"** section — `PayslipList` of **their own** payslips, download only (`canDelete={false}`).

Server components fetch the rows (RLS scopes them) and pass them to the client `PayslipList`; signed URLs are minted client-side on download.

---

## Error handling
- Non-admin attempting upload: blocked by RLS (table + storage) and the UI hides the control.
- Orphaned file (upload ok, row insert fails): remove the file, report the error.
- Missing/expired signed URL: regenerate on each Download click (60s TTL), so links never go stale.
- No payslips: each list shows an empty state.

---

## Verification
No test runner (intentional). Verify with `pnpm build` + `pnpm lint`; **RLS via role simulation** (employee reads only own payslips; manager reads none; owner/admin read all; only owner/admin insert) plus a storage-policy check; manual smoke: admin uploads a PDF for the demo employee, employee logs in and downloads it, manager cannot see it.

---

## Files
- Create: `supabase/schema-031-payslips.sql`
- Create: `src/components/finance/PayslipList.tsx` (client)
- Create: `src/components/finance/PayslipUpload.tsx` (client, admin)
- Modify: `src/components/finance/CompanyFinanceView.tsx` (org scope: Payslips subsection — fetch org payslips, render upload + list)
- Modify: `src/components/finance/EmployeeFinanceView.tsx` (Payslips section — fetch own, render read-only list)

---

## Resolved facts (verified against the codebase)
1. Storage pattern: private buckets (`receipts` public=false), path-based `storage.objects` RLS keyed on `(storage.foldername(name))[1] = auth.uid()`, client `.upload()`, `createSignedUrl(path, 60)` for download, `.remove([path])` for delete (`schema-006-storage.sql`, `ExpenseForm`/`ExpenseList`/`ManagerExpenseView`/`DocumentPanel`).
2. Role model + financial roles (owner/admin) reused from S1; `resolveRole()` available.
3. App "notifications" are email + web-push only (no in-app centre) → upload notification deferred.
4. `payslips` will have two FKs to `profiles` → embeds need `profiles!payslips_user_id_fkey`.
5. Next migration number: `schema-031`.
