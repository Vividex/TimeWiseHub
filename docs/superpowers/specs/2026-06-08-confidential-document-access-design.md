# Phase 5.5b — Confidential Document Access Control — Design

> Authored 2026-06-08. Builds directly on Phase 5.5a (clients & project
> visibility, schema-034). Documents already belong to a specific project
> (`project_documents.project_id`); this phase adds per-document
> confidentiality so sensitive files are visible only to management.

## Goal

Today every org member can see every document on every org project
(`project_documents` RLS grants `ALL` to any org member; the storage SELECT
policy grants read to any org member of the uploader's org). This phase lets a
document be marked **confidential**, after which it is visible only to the
**uploader** plus org **owner/admin/manager** — and fully hidden from regular
employees (they don't see the row, the name, or the count).

## Locked decisions

- **Access model:** role-gated, management-only. Confidential = visible to
  uploader + `owner`/`admin`/`manager`. Not per-person ACLs, not sensitivity
  tiers.
- **Who sets the flag:** the uploader may mark their own upload confidential at
  upload time; only `owner`/`admin`/`manager` may change the flag afterward (an
  employee cannot later un-confidential something management locked).
- **Employee experience:** confidential docs are **fully hidden** — the row is
  not returned by RLS, so there is no placeholder, name, or count leak.
- **Manager find affordance:** a confidential filter (chevron dropdown) on a new
  document search box inside the project detail's `DocumentPanel`, with options
  **All / Confidential only / Standard only**. Rendered only for
  `owner`/`admin`/`manager`.
- **Default:** new uploads are non-confidential (org-wide), exactly as today.
- **Personal projects:** confidential controls appear only on org-scoped
  projects. Personal projects (`org_id is null`) have no other viewers, so the
  concept is a no-op there.

## Current state (reference — read before touching)

- `supabase/schema-008-projects.sql` — defines `project_documents` and its
  single open `ALL` policy ("Project members can manage documents") granting
  full access to project owner, project members, OR any org member of the
  project's org.
- `supabase/schema-024-fix-project-storage.sql` — storage `project-documents`
  bucket SELECT policy: uploader OR any org member of the uploader's org.
  INSERT/DELETE: folder owner only (`{user_id}/...`).
- `supabase/schema-028-project-entitlements.sql` — existing `BEFORE INSERT OR
  UPDATE` trigger pattern (`enforce_project_entitlements`) to mirror for the
  flag-change trigger.
- `src/app/dashboard/projects/[id]/page.tsx` — fetches the project, tasks,
  documents (`select('*')`), and `membership` (currently selects `org_id`
  only); renders `<DocumentPanel projectId userId initialDocuments />`.
- `src/components/projects/DocumentPanel.tsx` — client component; uploads
  directly to storage at `{userId}/{projectId}/{ts}-{name}`, inserts the
  metadata row, views via `createSignedUrl`, deletes from both. **No search box
  today.**
- `src/components/ui/SearchInput.tsx` + `src/lib/use-text-filter.ts` — shared
  client-side as-you-type substring filter used by Clients/Projects/Tasks.

Role enum (`schema-001-auth.sql`): `member_role` = `owner | admin | manager |
employee`. Management = `owner`/`admin`/`manager`, matching the gating already
used in schema-004/005/006.

---

## Architecture

The same management-only rule is enforced at **three independent points** —
defence in depth around one logical rule. All three are required:

| # | Enforcement point | What it stops |
|---|---|---|
| 1 | `project_documents` SELECT policy | Confidential row appearing in an employee's document list |
| 2 | `storage.objects` SELECT policy | Confidential file being fetched via a signed URL even if the path is known/guessed |
| 3 | `BEFORE UPDATE` trigger on `project_documents` | A non-manager (incl. the uploader) changing the `confidential` column after upload |

Layer 2 is the security-critical one: a signed URL is only minted if the
storage SELECT policy passes for the requesting user. Because
`project_documents.storage_path` stores the exact object name, the storage
policy can join `storage.objects.name = project_documents.storage_path` and
apply the same confidential rule — no fragile path-string parsing, and the
existing browser `createSignedUrl` "View" flow keeps working unchanged.

---

## Data model

New migration: `supabase/schema-035-confidential-documents.sql`
(apply via Supabase MCP `apply_migration`, migration name
`confidential_documents`).

```sql
alter table public.project_documents
  add column confidential boolean not null default false;
```

No new tables. No index needed at current scale (documents are fetched per
project; filtering is client-side).

---

## RLS changes (`project_documents`)

Drop the single open policy and replace with split per-command policies.

**Helper expression** — "viewer is management in this document's project's org":
```sql
exists (
  select 1
  from public.projects p
  join public.organisation_members om on om.org_id = p.org_id
  where p.id = project_documents.project_id
    and om.user_id = auth.uid()
    and om.role in ('owner', 'admin', 'manager')
)
```

**SELECT** — non-confidential stays org-wide; confidential is uploader +
management:
```sql
create policy "View documents (confidential gated)"
  on public.project_documents for select
  using (
    exists (  -- caller can see the project at all (owner / member / org member)
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
      or exists (  -- management in the project's org
        select 1 from public.projects p
        join public.organisation_members om on om.org_id = p.org_id
        where p.id = project_documents.project_id
          and om.user_id = auth.uid()
          and om.role in ('owner', 'admin', 'manager')
      )
    )
  );
```

**INSERT** — any org member or project owner/member may add a document (and may
set `confidential = true` on their own upload at insert time):
```sql
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
```

**UPDATE / DELETE** — tightened from "any org member" to **uploader OR
management** (one policy each, same `using` expression):
```sql
create policy "Modify documents (uploader or management)"
  on public.project_documents for update
  using ( uploaded_by = auth.uid() or <management-helper> )
  with check ( uploaded_by = auth.uid() or <management-helper> );

create policy "Remove documents (uploader or management)"
  on public.project_documents for delete
  using ( uploaded_by = auth.uid() or <management-helper> );
```
(`<management-helper>` = the management exists-clause above.)

---

## Flag-change trigger

RLS cannot compare old vs new column values, so a trigger enforces "only
management may change `confidential`":

```sql
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

Note: the uploader sets `confidential` at **INSERT**, which this `BEFORE UPDATE`
trigger does not touch — so an employee can still protect their own upload at
creation time, but cannot flip it afterward.

---

## Storage RLS changes (`project-documents` bucket)

Replace the schema-024 SELECT policy so confidential objects are gated the same
way. Join on exact path equality:

```sql
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
          -- caller can see the project
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

INSERT (own folder) and DELETE (own folder) storage policies from schema-024 are
**unchanged**. Known limitation: a manager deleting another user's confidential
document removes the metadata row (allowed by the new metadata DELETE policy)
but cannot remove the storage object (folder-owner only), leaving an orphaned
object. Rare; documented, not solved in this phase.

---

## UI changes

### `src/app/dashboard/projects/[id]/page.tsx`
- Extend the membership query to select `role` as well as `org_id`.
- Compute `canManageConfidential = ['owner','admin','manager'].includes(role)`.
- Pass to `DocumentPanel`: `orgId` (or an `isOrgProject` boolean derived from
  `project.org_id`) and `canManageConfidential`.

### `src/components/projects/DocumentPanel.tsx`
New props: `isOrgProject: boolean`, `canManageConfidential: boolean`. The `Doc`
type gains `confidential: boolean`.

1. **Upload confidential checkbox** — when `isOrgProject`, render a
   **"Confidential"** checkbox next to the `+ Upload` control. Its state is
   passed as `confidential` in the `project_documents` insert. Hidden on
   personal projects.
2. **Confidential badge** — confidential rows show a small lock pill,
   `🔒 Confidential`, styled like existing pills
   (`rounded-xl px-2 py-0.5 text-xs font-black uppercase tracking-wide`,
   amber/red tone). Only present on rows the viewer received (employees never
   get confidential rows).
3. **Document search** — add the shared `SearchInput` + `useTextFilter`
   (filter on `doc.name`), same pattern as `ClientList`/`TaskList`. Visible to
   everyone. Show a "No matches" state distinct from the "No documents yet"
   empty state.
4. **Confidential filter chevron (management only)** — when
   `canManageConfidential`, render a small dropdown beside the search:
   **All / Confidential only / Standard only**, filtering the (already
   name-filtered) list by `confidential`. Not rendered for employees.

No change to the upload path, signed-URL view, or delete flow beyond passing the
new `confidential` value on insert.

---

## Verification

- `npm run lint` — no new errors. `npx tsc --noEmit` — no type errors.
- **DB:** migration applies; `confidential` column exists, default `false`.
- **SELECT gating:** an employee querying `project_documents` for a project with
  a confidential doc does **not** receive that row; an owner/admin/manager and
  the uploader **do**.
- **Storage gating:** an employee calling `createSignedUrl` on a confidential
  doc's path is refused; management and the uploader succeed.
- **Trigger:** an employee `update`-ing `confidential` raises
  "Only managers can change document confidentiality"; a manager succeeds.
  Uploader setting `confidential = true` at insert succeeds.
- **UI:** confidential checkbox appears only on org projects; confidential badge
  shows on gated rows; document search narrows live; the All/Confidential
  only/Standard only dropdown appears only for management and filters correctly;
  employees see neither the dropdown nor any confidential row.

## Out of scope

- Per-person document ACLs and multi-tier sensitivity levels.
- Confidential **tasks** (this phase is documents only).
- Changes to the client → project → document navigation (already exists).
- Cross-user storage deletion (a manager removing another user's confidential
  file from storage) — see known limitation above.
- No new npm dependencies; no billing, auth, or Stripe changes.
