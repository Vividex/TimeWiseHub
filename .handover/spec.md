# Task: Phase 5.5b — Confidential Document Access Control

## Context
Today every org member can see every document on every org project:
`project_documents` RLS grants `ALL` to any org member (schema-008), and the
storage `project-documents` SELECT policy grants read to any org member of the
uploader's org (schema-024). There is no way to restrict a sensitive file.

**Goal:** A document can be marked **confidential**. A confidential document is
visible only to its **uploader** plus org **owner/admin/manager**, and is fully
hidden from regular employees (no row, name, or count). The uploader may set the
flag at upload time; only owner/admin/manager may change it afterward.

Full design + rationale: `docs/superpowers/specs/2026-06-08-confidential-document-access-design.md`
Full step plan: `docs/superpowers/plans/2026-06-08-confidential-document-access.md`

## Key files (read before touching)
- `supabase/schema-008-projects.sql` — defines `project_documents` + its open `ALL` policy (reference)
- `supabase/schema-024-fix-project-storage.sql` — current storage SELECT policy (reference)
- `supabase/schema-028-project-entitlements.sql` — trigger pattern to mirror (reference)
- `src/app/dashboard/projects/[id]/page.tsx` — fetches membership (org_id only) + renders DocumentPanel
- `src/components/projects/DocumentPanel.tsx` — upload/view/delete; no search box today
- `src/components/ui/SearchInput.tsx`, `src/lib/use-text-filter.ts` — shared search pattern (reference)

## Acceptance checklist

- [ ] **C1: DB migration** — create `supabase/schema-035-confidential-documents.sql`
  containing, in order: (1) `alter table public.project_documents add column if
  not exists confidential boolean not null default false;`  (2) drop the
  schema-008 policy `"Project members can manage documents"` and create four new
  `project_documents` policies — SELECT `"View documents (confidential gated)"`,
  INSERT `"Add documents"`, UPDATE `"Modify documents (uploader or management)"`,
  DELETE `"Remove documents (uploader or management)"`;  (3) a `security definer`
  function `enforce_confidential_change()` + `before update of confidential`
  trigger `project_documents_confidential_guard` that raises `'Only managers can
  change document confidentiality'` when a non-(owner/admin/manager) changes the
  flag, with execute revoked from public/anon/authenticated;  (4) drop the
  schema-024 storage policy `"Org members can view project documents"` and create
  `"View project document objects (confidential gated)"` on `storage.objects`
  joining `d.storage_path = storage.objects.name`. **Use the exact SQL from the
  plan file's Task 1 (Steps 1–3).** Apply via the Supabase MCP `apply_migration`
  tool (name: `confidential_documents`) — the **conductor** runs this.
  Management = `om.role in ('owner','admin','manager')`. Non-confidential docs
  remain visible to all org members exactly as before.

- [ ] **C2: Role plumbing** — update `src/app/dashboard/projects/[id]/page.tsx`.
  Change the membership query from `.select('org_id')` to `.select('org_id, role')`.
  After `const orgId = membership?.org_id ?? null`, add:
  ```ts
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null
  ```
  Pass `isOrgProject={isOrgProject}` and `canManageConfidential={canManageConfidential}`
  to `<DocumentPanel />`. No other changes to this page.

- [ ] **C3: Upload checkbox + lock badge** — update `src/components/projects/DocumentPanel.tsx`.
  Add `import { Lock } from 'lucide-react'`. Extend the `Doc` type with
  `confidential: boolean`. Add props `isOrgProject: boolean` and
  `canManageConfidential: boolean`. Add state `const [uploadConfidential,
  setUploadConfidential] = useState(false)`. Include `confidential: isOrgProject
  && uploadConfidential` in the `project_documents` insert. Render a
  **"Confidential"** checkbox next to the `+ Upload` control, shown only when
  `isOrgProject`. Render a `🔒 Confidential` amber pill on rows where
  `doc.confidential` (badge style `rounded-xl px-2 py-0.5 text-xs font-black
  uppercase tracking-wide`, `bg-amber-100 text-amber-700`, with the `Lock` icon).
  **Use the exact JSX from the plan file's Task 3.**

- [ ] **C4: Document search + management-only filter** — update
  `src/components/projects/DocumentPanel.tsx`. Add `import { useTextFilter } from
  '@/lib/use-text-filter'` and `import SearchInput from '@/components/ui/SearchInput'`.
  Add state `const [confFilter, setConfFilter] = useState<'all' | 'confidential'
  | 'standard'>('all')`. Derive `nameFiltered` via `useTextFilter(docs, d =>
  d.name)` then `visibleDocs` applying `confFilter`. Render a `SearchInput`
  (placeholder "Search documents…") and, only when `canManageConfidential`, a
  `<select>` dropdown with options **All / Confidential only / Standard only**.
  Map the list over `visibleDocs`; add a "No matches" state distinct from "No
  documents uploaded yet." **Use the exact code from the plan file's Task 4.**

## Verification
- Conductor runs after each item: `pnpm lint` (no new errors) and
  `npx tsc --noEmit` (no type errors). Note: Task 2/C2 alone leaves a temporary
  tsc prop error that C3 closes — commit C2+C3 together.
- C1: conductor confirms via Supabase MCP `execute_sql` that the `confidential`
  column exists, `project_documents` has 4 policies, the storage policy exists,
  and the trigger exists (see plan Task 1 Step 5). Two-account RLS smoke (plan
  Task 1 Step 6): employee cannot see/open a confidential doc; manager + uploader
  can; a non-manager flag change is rejected.
- C2/C3: confidential checkbox appears only on org projects; ticking it then
  uploading produces a row with the amber lock badge; an employee (non-uploader)
  does not see that row after reload.
- C4: search narrows the list live by name; the All/Confidential only/Standard
  only dropdown appears only for management and filters correctly; employees see
  neither the dropdown nor any confidential row.

## Out of scope
- Per-person document ACLs or multi-tier sensitivity levels.
- Confidential tasks (documents only).
- Changes to the client → project → document navigation (already exists).
- Cross-user storage deletion (manager removing another user's file from the
  bucket) — known orphan-object limitation, documented, not solved here.
- No new npm dependencies (`lucide-react` is already installed); no billing,
  auth, or Stripe changes.
