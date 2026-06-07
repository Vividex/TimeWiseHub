# Payslip Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Staging note:** Authored by Claude; Codex commits this + the spec into `docs/superpowers/` and makes all file changes in `C:/GameForge/timewisehub`.

**Goal:** Admin uploads official payslip PDFs per employee; employees and admins access them in-app any time; managers/other employees cannot.

**Architecture:** Private Supabase Storage bucket `payslips` (`{employee_id}/{uuid}.pdf`) + a `payslips` table, RLS mirroring pay statements. Client-side upload via `supabase-browser`; download via 60s signed URLs. Surfaced in the admin portal (`CompanyFinanceView`, org scope) and the employee finance page (`EmployeeFinanceView`).

**Tech Stack:** Next.js 16, React 19, Supabase Storage + Postgres + RLS, TypeScript, Tailwind v4. pnpm.

---

## Verification approach
No test runner (intentional). `pnpm build` + `pnpm lint`; **table RLS via role simulation**; storage policies + end-to-end via manual smoke (admin uploads for the demo employee → employee downloads → manager cannot see). Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema-031-payslips.sql` | Bucket + storage policies + `payslips` table + RLS + indexes. |
| `src/components/finance/PayslipList.tsx` | Client; list rows + signed-URL download + optional delete. |
| `src/components/finance/PayslipUpload.tsx` | Client (admin); employee + label + pay date + PDF → upload. |
| `src/components/finance/EmployeeFinanceView.tsx` | (modify) own payslips section. |
| `src/components/finance/CompanyFinanceView.tsx` | (modify) admin upload + org payslip list. |

Build order: migration → list → upload → employee wiring → admin wiring → verify/docs.

---

### Task 1: Migration `schema-031-payslips.sql`

**Files:** Create `supabase/schema-031-payslips.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply** — `mcp__supabase__apply_migration`, name `payslips`, query = the SQL above.

- [ ] **Step 3: Verify policies** —
```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename='payslips' order by policyname;
select policyname, cmd from pg_policies where tablename='objects' and schemaname='storage' and policyname ilike '%payslip%';
```
Expect 3 table policies (`own_or_admin_read` SELECT, `admin_insert` INSERT, `admin_delete` DELETE) and 4 storage policies.

- [ ] **Step 4: Verify table RLS by role simulation** (rollback-only). Substitute the demo org id + the employee/manager/owner ids (look up: `select om.user_id, om.role from organisation_members om join organisations o on o.id=om.org_id where o.slug='vividex-demo'`).
```sql
begin;
  insert into public.payslips (org_id, user_id, label, pay_date, file_path, uploaded_by)
  values ('<ORG_ID>', '<EMP_ID>', 'Test', '2026-05-31', '<EMP_ID>/x.pdf', '<OWNER_ID>');

  select set_config('request.jwt.claims', json_build_object('sub','<EMP_ID>','role','authenticated')::text, true);
  set local role authenticated;
  select count(*) as emp_sees from public.payslips;            -- expect 1 (own)
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub','<MANAGER_ID>','role','authenticated')::text, true);
  set local role authenticated;
  select count(*) as mgr_sees from public.payslips;            -- expect 0
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub','<OWNER_ID>','role','authenticated')::text, true);
  set local role authenticated;
  select count(*) as owner_sees from public.payslips;          -- expect 1
  reset role;
rollback;
```

- [ ] **Step 5: Commit**
```bash
git add supabase/schema-031-payslips.sql
git commit -m "feat(payslips): payslips bucket + table with RLS (own/admin read, admin write)"
```

---

### Task 2: `PayslipList` (client)

**Files:** Create `src/components/finance/PayslipList.tsx`

Context: renders payslip rows; Download mints a 60s signed URL on click (same as `ExpenseList`); when `canDelete`, an admin can delete (removes file + row). `employeeName` is shown only when provided (admin view).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type PayslipRow = {
  id: string
  label: string
  pay_date: string
  file_path: string
  uploaded_at: string
  employeeName?: string
}

export default function PayslipList({
  payslips,
  canDelete = false,
}: {
  payslips: PayslipRow[]
  canDelete?: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(path: string) {
    setError(null)
    const supabase = createClient()
    const { data, error: e } = await supabase.storage.from('payslips').createSignedUrl(path, 60)
    if (e || !data) {
      setError('Could not open payslip.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function remove(row: PayslipRow) {
    setBusyId(row.id)
    setError(null)
    const supabase = createClient()
    await supabase.storage.from('payslips').remove([row.file_path])
    const { error: e } = await supabase.from('payslips').delete().eq('id', row.id)
    if (e) {
      setError(e.message)
      setBusyId(null)
      return
    }
    router.refresh()
    setBusyId(null)
  }

  if (payslips.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-4 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        No payslips yet.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {error && <p className="px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-slate-800">
            {payslips.some(p => p.employeeName) && (
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Employee</th>
            )}
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Payslip</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Pay date</th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payslips.map(p => (
            <tr key={p.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
              {payslips.some(x => x.employeeName) && (
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.employeeName ?? ''}</td>
              )}
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.label}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.pay_date}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => download(p.file_path)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600">Download</button>
                  {canDelete && (
                    <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      {busyId === p.id ? '…' : 'Delete'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds.
- [ ] **Step 3: Commit**
```bash
git add src/components/finance/PayslipList.tsx
git commit -m "feat(payslips): PayslipList with signed-URL download and admin delete"
```

---

### Task 3: `PayslipUpload` (client, admin)

**Files:** Create `src/components/finance/PayslipUpload.tsx`

Context: admin picks an employee + label + pay date + PDF; uploads to `payslips/{employeeId}/{uuid}.pdf`, then inserts the metadata row. On insert failure after upload, the orphaned file is removed.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type OrgMemberOption = { user_id: string; name: string }

export default function PayslipUpload({
  orgId,
  uploadedBy,
  members,
}: {
  orgId: string
  uploadedBy: string
  members: OrgMemberOption[]
}) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState(members[0]?.user_id ?? '')
  const [label, setLabel] = useState('')
  const [payDate, setPayDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!employeeId || !label.trim() || !payDate || !file) {
      setError('All fields and a PDF are required.')
      return
    }
    if (file.type !== 'application/pdf') {
      setError('Payslip must be a PDF.')
      return
    }

    setLoading(true); setError(null); setDone(false)
    const supabase = createClient()
    const path = `${employeeId}/${crypto.randomUUID()}.pdf`

    const { error: upErr } = await supabase.storage.from('payslips').upload(path, file)
    if (upErr) {
      setError(upErr.message); setLoading(false); return
    }

    const { error: rowErr } = await supabase.from('payslips').insert({
      org_id: orgId,
      user_id: employeeId,
      label: label.trim(),
      pay_date: payDate,
      file_path: path,
      uploaded_by: uploadedBy,
    })

    if (rowErr) {
      await supabase.storage.from('payslips').remove([path]) // avoid orphaned file
      setError(rowErr.message); setLoading(false); return
    }

    setLabel(''); setPayDate(''); setFile(null); setDone(true)
    router.refresh()
    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Upload payslip</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ps-emp" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Employee</label>
          <select id="ps-emp" value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ps-date" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Pay date</label>
          <input id="ps-date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ps-label" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Label</label>
          <input id="ps-label" type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Fortnight ending 31 May 2026" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ps-file" className="block text-xs font-bold text-gray-500 dark:text-slate-400">PDF</label>
          <input id="ps-file" type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm text-slate-600 dark:text-slate-300" />
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {done && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">Payslip uploaded.</p>}
      <button type="submit" disabled={loading} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
        {loading ? 'Uploading…' : 'Upload payslip'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds.
- [ ] **Step 3: Commit**
```bash
git add src/components/finance/PayslipUpload.tsx
git commit -m "feat(payslips): admin PayslipUpload (PDF → storage + metadata row)"
```

---

### Task 4: Employee payslips section (`EmployeeFinanceView`)

**Files:** Modify `src/components/finance/EmployeeFinanceView.tsx`

Context: add a read-only "Payslips" section above the pay statements. Fetch own rows (RLS scopes to own).

- [ ] **Step 1: Add the import** (top of file):
```tsx
import PayslipList, { type PayslipRow } from '@/components/finance/PayslipList'
```

- [ ] **Step 2: Fetch own payslips.** Add to the existing `Promise.all` in the component (it already destructures `statementsData`, `profile`, `tsData` — add a fourth):
```tsx
    supabase
      .from('payslips')
      .select('id, label, pay_date, file_path, uploaded_at')
      .eq('user_id', userId)
      .order('pay_date', { ascending: false }),
```
and capture it: `const payslips = (payslipsData ?? []) as PayslipRow[]` (name the destructured value `payslipsData`).

- [ ] **Step 3: Render the section** just above the "Your pay statements" block:
```tsx
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Payslips</h2>
          <PayslipList payslips={payslips} />
        </div>
```

- [ ] **Step 4: Verify build** — `pnpm build` → succeeds.
- [ ] **Step 5: Commit**
```bash
git add src/components/finance/EmployeeFinanceView.tsx
git commit -m "feat(payslips): employee read-only payslips section"
```

---

### Task 5: Admin payslips section (`CompanyFinanceView`)

**Files:** Modify `src/components/finance/CompanyFinanceView.tsx`

Context: org scope only — add upload + a list of all org payslips (with employee names). Embeds use the `profiles!payslips_user_id_fkey` / `profiles!organisation_members_user_id_fkey` hints.

- [ ] **Step 1: Add imports**
```tsx
import PayslipUpload, { type OrgMemberOption } from '@/components/finance/PayslipUpload'
import PayslipList, { type PayslipRow } from '@/components/finance/PayslipList'
```

- [ ] **Step 2: Fetch payslips + members (org scope).** Inside the existing `if (scope.type === 'org') { ... }` block, extend the `Promise.all` with two more queries and capture them:
```tsx
      supabase
        .from('payslips')
        .select('id, label, pay_date, file_path, uploaded_at, user_id, profiles!payslips_user_id_fkey(full_name, email)')
        .eq('org_id', scope.orgId)
        .order('pay_date', { ascending: false }),
      supabase
        .from('organisation_members')
        .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
        .eq('org_id', scope.orgId),
```
Then, after the Promise.all, build the view models:
```tsx
    const payslipRows: PayslipRow[] = ((payslipsData ?? []) as unknown as {
      id: string; label: string; pay_date: string; file_path: string; uploaded_at: string
      profiles: { full_name: string | null; email: string } | null
    }[]).map(p => ({
      id: p.id, label: p.label, pay_date: p.pay_date, file_path: p.file_path, uploaded_at: p.uploaded_at,
      employeeName: p.profiles?.full_name ?? p.profiles?.email ?? 'Unknown',
    }))
    payslipMembers = ((membersForPayslips ?? []) as unknown as {
      user_id: string; profiles: { full_name: string | null; email: string } | null
    }[]).map(m => ({ user_id: m.user_id, name: m.profiles?.full_name ?? m.profiles?.email ?? 'Unknown' }))
```
Declare the holders before the `if` block (so they're in scope for the JSX): `let payslipRows: PayslipRow[] = []` and `let payslipMembers: OrgMemberOption[] = []`. (Assign `payslipRows` inside the block too — move its `let` outside.)

- [ ] **Step 3: Render under the Payroll section** (inside the `scope.type === 'org'` JSX block, after the pay-runs list / before the Net profit card is fine):
```tsx
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Payslips</h3>
              <PayslipUpload orgId={scope.orgId} uploadedBy={currentUserId} members={payslipMembers} />
              <PayslipList payslips={payslipRows} canDelete />
            </div>
```

- [ ] **Step 4: Verify build + lint** — `pnpm build` && `pnpm lint` → no new issues.
- [ ] **Step 5: Commit**
```bash
git add src/components/finance/CompanyFinanceView.tsx
git commit -m "feat(payslips): admin upload + org payslip list in finance portal"
```

---

### Task 6: Final verification + docs

**Files:** Create `docs/superpowers/specs/2026-06-07-payslip-vault-design.md` + `docs/superpowers/plans/2026-06-07-payslip-vault.md` (from staging)

- [ ] **Step 1: Full build** — `pnpm build` → succeeds.
- [ ] **Step 2: Manual smoke** — as admin: finance → Payslips → pick the demo employee, label + date, upload a PDF → it appears in the admin list. As the employee (incognito): finance → Payslips → Download works. As the manager: no payslips visible anywhere.
- [ ] **Step 3: Copy staged docs + commit**
```bash
git add docs/superpowers/specs/2026-06-07-payslip-vault-design.md docs/superpowers/plans/2026-06-07-payslip-vault.md
git commit -m "docs(payslips): payslip vault design spec + implementation plan"
```
- [ ] **Step 4: Push** — `git push origin master` (redeploys via Vercel).

---

## Self-Review

**1. Spec coverage:** bucket + table + RLS → Task 1; download/delete → Task 2; admin upload → Task 3; employee view → Task 4; admin view → Task 5. Admin-only write enforced by RLS (Task 1) + UI placement (Tasks 3/5). Standalone label+pay_date, PDF-only, in-app, no notification → all reflected. ✓

**2. Placeholder scan:** none; error paths (orphaned file, signed-URL failure, validation) handled.

**3. Type consistency:** `PayslipRow` (Task 2) imported in Tasks 4 & 5; `OrgMemberOption` (Task 3) used in Task 5; both `profiles` embeds use the `!..._user_id_fkey` hint (avoids the PGRST201 bug). `uploadedBy={currentUserId}` matches `CompanyFinanceView`'s existing `currentUserId` prop.

---

## Notes for the executor
- Reuses the established private-bucket pattern (`receipts`/`project-documents`): client `.upload()`, `createSignedUrl(path, 60)`, `.remove([path])`.
- Apply the migration (Task 1) via Supabase MCP and verify RLS before the UI tasks.
- Managers must never see payslips — both the table and storage SELECT policies exclude them; do not add a manager policy.
