# Confidential Document Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org document be marked confidential so it is visible only to its uploader plus org owner/admin/manager, and fully hidden from regular employees.

**Architecture:** Add one `confidential` boolean to `project_documents`. Enforce the management-only rule at three independent points — the `project_documents` SELECT policy, the `storage.objects` SELECT policy (joined on `storage_path`), and a `BEFORE UPDATE` trigger guarding the flag — and tighten UPDATE/DELETE from "any org member" to "uploader or management". Then surface it in `DocumentPanel`: a confidential upload checkbox (org projects only), a lock badge, a document search box, and a management-only All/Confidential/Standard filter.

**Tech Stack:** Next.js 16 (App Router, React 19, server + client components), TypeScript, Tailwind v4, Supabase (Postgres + RLS + Storage), `lucide-react` icons, pnpm. No test runner in this repo — verification is SQL structural checks + a two-account RLS smoke test + `pnpm lint` / `npx tsc --noEmit` / manual UI smoke.

**Spec:** `docs/superpowers/specs/2026-06-08-confidential-document-access-design.md`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/schema-035-confidential-documents.sql` | The whole DB change: column, metadata RLS (select/insert/update/delete), flag-change trigger, storage SELECT policy | Create |
| `src/app/dashboard/projects/[id]/page.tsx` | Fetch the viewer's role; pass `isOrgProject` + `canManageConfidential` into `DocumentPanel` | Modify |
| `src/components/projects/DocumentPanel.tsx` | All confidential UI: upload checkbox, lock badge, document search, management-only filter | Modify |

No new tables, no new components, no new dependencies (`lucide-react` is already installed).

---

## Task 1: Database migration (column + RLS + trigger + storage)

**Files:**
- Create: `supabase/schema-035-confidential-documents.sql`

This task is one cohesive migration. Steps build the file section by section, then apply and verify each enforcement point.

- [ ] **Step 1: Create the migration file with the column + metadata RLS**

Create `supabase/schema-035-confidential-documents.sql` with this content:

```sql
-- ============================================================
-- TimeWiseHub — Schema 035: Confidential project documents
-- Phase 5.5b — role-gated (management-only) document confidentiality.
-- Run via Supabase MCP apply_migration (name: confidential_documents)
-- ============================================================

-- ── 1. Column ────────────────────────────────────────────────
alter table public.project_documents
  add column if not exists confidential boolean not null default false;

-- ── 2. Metadata RLS ──────────────────────────────────────────
-- Replace the single open ALL policy from schema-008.
drop policy if exists "Project members can manage documents" on public.project_documents;

-- SELECT: project visibility AND (not confidential OR uploader OR management)
create policy "View documents (confidential gated)"
  on public.project_documents for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.project_members pm
                   where pm.project_id = project_documents.project_id
                     and pm.user_id = auth.uid())
        or exists (select 1 from public.organisation_members om
                   where om.org_id = p.org_id and om.user_id = auth.uid())
      )
    )
    and (
      confidential = false
      or uploaded_by = auth.uid()
      or exists (
        select 1 from public.projects p
        join public.organisation_members om on om.org_id = p.org_id
        where p.id = project_documents.project_id
          and om.user_id = auth.uid()
          and om.role in ('owner', 'admin', 'manager')
      )
    )
  );

-- INSERT: any project owner/member or org member may add (and may set
-- confidential = true on their own upload at insert time).
create policy "Add documents"
  on public.project_documents for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.project_members pm
                   where pm.project_id = project_documents.project_id
                     and pm.user_id = auth.uid())
        or exists (select 1 from public.organisation_members om
                   where om.org_id = p.org_id and om.user_id = auth.uid())
      )
    )
  );

-- UPDATE: uploader OR management
create policy "Modify documents (uploader or management)"
  on public.project_documents for update
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

-- DELETE: uploader OR management
create policy "Remove documents (uploader or management)"
  on public.project_documents for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );
```

- [ ] **Step 2: Append the flag-change trigger to the migration file**

Add to the same file:

```sql
-- ── 3. Flag-change trigger ───────────────────────────────────
-- RLS cannot compare old vs new; enforce "only management changes the
-- confidential flag" here. INSERT is untouched, so an uploader may still
-- set confidential = true when first creating the row.
create or replace function public.enforce_confidential_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confidential is distinct from old.confidential then
    if not exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = new.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    ) then
      raise exception 'Only managers can change document confidentiality';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_documents_confidential_guard on public.project_documents;
create trigger project_documents_confidential_guard
  before update of confidential on public.project_documents
  for each row execute function public.enforce_confidential_change();

revoke execute on function public.enforce_confidential_change() from public, anon, authenticated;
```

- [ ] **Step 3: Append the storage SELECT policy to the migration file**

Add to the same file:

```sql
-- ── 4. Storage RLS ───────────────────────────────────────────
-- Gate the actual file objects the same way (join on exact storage path).
-- INSERT (own folder) and DELETE (own folder) policies are left unchanged.
drop policy if exists "Org members can view project documents" on storage.objects;

create policy "View project document objects (confidential gated)"
  on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1
      from public.project_documents d
      join public.projects p on p.id = d.project_id
      where d.storage_path = storage.objects.name
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm
                     where pm.project_id = d.project_id and pm.user_id = auth.uid())
          or exists (select 1 from public.organisation_members om
                     where om.org_id = p.org_id and om.user_id = auth.uid())
        )
        and (
          d.confidential = false
          or d.uploaded_by = auth.uid()
          or exists (select 1 from public.organisation_members om
                     where om.org_id = p.org_id
                       and om.user_id = auth.uid()
                       and om.role in ('owner', 'admin', 'manager'))
        )
    )
  );
```

- [ ] **Step 4: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool:
- name: `confidential_documents`
- query: the full contents of `supabase/schema-035-confidential-documents.sql`

Expected: success, no error.

- [ ] **Step 5: Verify the structural changes (column, policies, trigger)**

Run via Supabase MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_name = 'project_documents' and column_name = 'confidential') as has_column,
  (select count(*) from pg_policies
     where tablename = 'project_documents') as doc_policies,
  (select count(*) from pg_policies
     where tablename = 'objects' and policyname = 'View project document objects (confidential gated)') as storage_policy,
  (select count(*) from pg_trigger
     where tgname = 'project_documents_confidential_guard') as has_trigger;
```

Expected: `has_column = 1`, `doc_policies = 4` (View/Add/Modify/Remove), `storage_policy = 1`, `has_trigger = 1`.

- [ ] **Step 6: Verify RLS behaviour with a two-account smoke test**

Manual, requires an org with at least one **manager/owner** account and one **employee** account, and a project that belongs to that org.

1. As the employee: open the org project, upload a document with the (soon-to-exist) confidential flag OFF — confirm it appears. *(Until Task 3 ships the checkbox, set `confidential = true` directly via `execute_sql` on that row to simulate: `update public.project_documents set confidential = true where id = '<doc-id>';` run as service role.)*
2. As the employee (browser, normal auth): reload the project — the confidential doc must **not** appear in the list, and `createSignedUrl` on its `storage_path` must fail.
3. As the manager: reload the same project — the confidential doc **must** appear and View must work.
4. As the employee: attempt `update public.project_documents set confidential = false where id = '<doc-id>'` through the app's authenticated client — expect the error `Only managers can change document confidentiality`. *(The uploader is the employee here; this proves even the uploader cannot flip it post-insert.)*

Expected: employee never sees or downloads the confidential doc; manager does; flag change by non-manager is rejected.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-035-confidential-documents.sql
git commit -m "feat(db): schema-035 confidential project documents (RLS + trigger + storage)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pass the viewer's role into DocumentPanel

**Files:**
- Modify: `src/app/dashboard/projects/[id]/page.tsx`

- [ ] **Step 1: Select `role` in the membership query**

In `src/app/dashboard/projects/[id]/page.tsx`, the `Promise.all` membership query currently selects only `org_id` (line ~23). Change it to also select `role`:

```ts
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
```

- [ ] **Step 2: Derive the two flags**

Just after `const orgId = membership?.org_id ?? null` (line ~29), add:

```ts
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null
```

- [ ] **Step 3: Pass the flags to DocumentPanel**

Update the `<DocumentPanel />` render (line ~117) to:

```tsx
        <DocumentPanel
          projectId={project.id}
          userId={user.id}
          initialDocuments={documents ?? []}
          isOrgProject={isOrgProject}
          canManageConfidential={canManageConfidential}
        />
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: this will report that `DocumentPanel` does not accept `isOrgProject` / `canManageConfidential` yet (those props are added in Task 3). That single expected error is fine at this checkpoint — do not commit until Task 3 closes it. Confirm there are **no other** new errors in `page.tsx`.

(No separate commit — Task 2 and Task 3 are committed together since the prop contract spans both. Proceed to Task 3.)

---

## Task 3: DocumentPanel — confidential type, upload checkbox, lock badge

**Files:**
- Modify: `src/components/projects/DocumentPanel.tsx`

- [ ] **Step 1: Extend the `Doc` type and component props**

In `src/components/projects/DocumentPanel.tsx`, add the `Lock` icon import and update the `Doc` type and the function signature.

Add to the imports at the top:

```ts
import { Lock } from 'lucide-react'
```

Change the `Doc` type (line ~8) to include `confidential`:

```ts
type Doc = { id: string; name: string; storage_path: string; size_bytes: number | null; created_at: string; confidential: boolean }
```

Change the component signature (line ~17) to accept the new props:

```tsx
export default function DocumentPanel({ projectId, userId, initialDocuments, isOrgProject, canManageConfidential }: {
  projectId: string
  userId: string
  initialDocuments: Doc[]
  isOrgProject: boolean
  canManageConfidential: boolean
}) {
```

- [ ] **Step 2: Add upload-confidential state and include it in the insert**

Add a state hook alongside the existing ones (after `const [pendingDelete, ...]`, line ~26):

```tsx
  const [uploadConfidential, setUploadConfidential] = useState(false)
```

In `handleUpload`, add `confidential` to the insert payload (line ~40-46):

```tsx
    const { data: doc, error: dbError } = await supabase.from('project_documents').insert({
      project_id: projectId,
      uploaded_by: userId,
      name: file.name,
      storage_path: path,
      size_bytes: file.size,
      confidential: isOrgProject && uploadConfidential,
    }).select().single()
```

- [ ] **Step 3: Render the confidential checkbox next to the upload button**

In the header `div` that holds the title + upload label (line ~72-78), add the checkbox before the upload `<label>` but only on org projects. Replace that header block with:

```tsx
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Documents</h2>
        <div className="flex items-center gap-3">
          {isOrgProject && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={uploadConfidential}
                onChange={e => setUploadConfidential(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
              />
              Confidential
            </label>
          )}
          <label className={`cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? 'Uploading...' : '+ Upload'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>
```

- [ ] **Step 4: Render a lock badge on confidential rows**

In the document list item (`<li>`, line ~87-96), add a badge after the document name. Replace the name/meta block (the inner `<div className="flex-1 min-w-0">`) with:

```tsx
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{doc.name}</p>
                  {doc.confidential && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-100 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-amber-700">
                      <Lock className="h-3 w-3" /> Confidential
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-500">{formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</p>
              </div>
```

- [ ] **Step 5: Verify lint and types**

Run: `pnpm lint`
Expected: no new errors.

Run: `npx tsc --noEmit`
Expected: no errors (the Task 2 prop mismatch is now resolved).

- [ ] **Step 6: Manual smoke test**

On an org project: the "Confidential" checkbox is visible next to Upload; tick it, upload a file, and confirm the new row shows the amber `🔒 Confidential` badge. On a personal project: the checkbox is absent. Reload as an employee (non-uploader): the confidential row is gone.

- [ ] **Step 7: Commit (Tasks 2 + 3 together)**

```bash
git add src/app/dashboard/projects/[id]/page.tsx src/components/projects/DocumentPanel.tsx
git commit -m "feat(docs): confidential upload checkbox + lock badge + role plumbing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: DocumentPanel — document search + management-only filter

**Files:**
- Modify: `src/components/projects/DocumentPanel.tsx`

- [ ] **Step 1: Import the shared search hook + input and add filter state**

In `src/components/projects/DocumentPanel.tsx`, add to the imports:

```ts
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
```

Add the confidential-filter state alongside the other hooks (after `uploadConfidential`):

```tsx
  const [confFilter, setConfFilter] = useState<'all' | 'confidential' | 'standard'>('all')
```

- [ ] **Step 2: Derive the filtered list**

The component keeps documents in `docs` (the `useState(initialDocuments)` at line ~23). Add the name filter and confidential filter just before the `return` (after `handleDelete`):

```tsx
  const { query, setQuery, filtered: nameFiltered } = useTextFilter(docs, d => d.name)
  const visibleDocs = nameFiltered.filter(d =>
    confFilter === 'all' ? true
    : confFilter === 'confidential' ? d.confidential
    : !d.confidential,
  )
```

- [ ] **Step 3: Render the search box and management-only filter dropdown**

Immediately below the header `div` (the one closed in Task 3 Step 3) and above the error paragraph, insert:

```tsx
      <div className="mb-3 flex items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search documents…" />
        {canManageConfidential && (
          <select
            value={confFilter}
            onChange={e => setConfFilter(e.target.value as 'all' | 'confidential' | 'standard')}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="all">All</option>
            <option value="confidential">Confidential only</option>
            <option value="standard">Standard only</option>
          </select>
        )}
      </div>
```

- [ ] **Step 4: Map over the filtered list and add a "No matches" state**

Replace the list-rendering conditional (the `{docs.length === 0 ? (...) : (<ul>...)}` block, line ~82-99) so it maps over `visibleDocs` and distinguishes "nothing uploaded" from "no matches":

```tsx
      {docs.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No documents uploaded yet.</p>
      ) : visibleDocs.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No matches.</p>
      ) : (
        <ul className="space-y-2">
          {visibleDocs.map(doc => (
```

(The `<li>` body — including the Task 3 badge — is unchanged; only the array being mapped changes from `docs` to `visibleDocs`. Ensure the closing `))}` and `</ul>` still match.)

- [ ] **Step 5: Verify lint and types**

Run: `pnpm lint`
Expected: no new errors.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke test**

As a manager on an org project with both confidential and standard docs: the search box narrows the list live by name; the dropdown (All/Confidential only/Standard only) appears and filters correctly. As an employee: the dropdown is absent and only standard docs are present; the search box still works.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/DocumentPanel.tsx
git commit -m "feat(docs): document search + management-only confidential filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `pnpm lint` — no new errors.
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] Two-account RLS smoke (from Task 1 Step 6) still passes end-to-end through the real UI: employee cannot see/open a confidential doc; manager can; non-manager cannot flip the flag.
- [ ] Personal project: no confidential checkbox, no filter dropdown.
- [ ] Update `GOALS.md` Phase 5 note if tracking 5.5b there (optional, not a code change).

## Notes for the implementer

- **Why a trigger and not just RLS for the flag:** RLS `WITH CHECK` cannot see the *old* row value, so it cannot tell "the confidential column changed". The `BEFORE UPDATE OF confidential` trigger is the only place that comparison is available. It is `security definer` and has execute revoked from `authenticated`, matching the existing `enforce_project_entitlements` pattern in schema-028.
- **Why the storage join works:** `project_documents.storage_path` stores the exact `storage.objects.name`, so the storage policy joins on string equality — no path parsing. Supabase evaluates this SELECT policy before issuing a signed URL, so the existing `createSignedUrl` browser flow needs no change.
- **Known limitation (documented, not fixed):** a manager deleting *another* user's confidential doc removes the metadata row (new DELETE policy allows it) but not the storage object (storage DELETE is folder-owner only), leaving an orphan. Out of scope for this phase.
