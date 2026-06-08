# Task: Phase 5.5a — Clients & Project Visibility

## Context
Currently, org members (employees) cannot create clients or org projects — only
admins can. Projects have no visual distinction between personal and org scope.
Employees who join an org see no projects unless they own them. Clients are
admin-only to create.

**Goal:** Any org member can create clients and projects (personal or org-scoped).
Projects are clearly separated into Personal and Organisation sections. Clients are
org-scoped when created by an org member and visible to all members.

## Key files (read before touching)
- `supabase/schema-008-projects.sql` — existing projects RLS (reference only)
- `supabase/schema-018-clients-billable-budgets.sql` — existing clients RLS (reference only)
- `src/app/api/projects/route.ts` — blocks employees from creating org projects
- `src/components/projects/ProjectForm.tsx` — no personal/org toggle
- `src/app/dashboard/projects/page.tsx` — no personal/org separation
- `src/components/projects/ProjectCard.tsx` — no scope badge

## Acceptance checklist

- [ ] C1: **DB migration** — create `supabase/schema-029-member-project-client-access.sql`.
  Add two RLS policies (do NOT drop existing ones, do NOT touch other tables):
  ```sql
  -- Allow any org member to create clients for their org
  create policy "Org members can insert org clients"
    on public.clients for insert
    with check (
      org_id is not null and
      exists (
        select 1 from public.organisation_members om
        where om.org_id = clients.org_id and om.user_id = auth.uid()
      )
    );

  -- Allow any org member to create projects for their org
  create policy "Org members can insert org projects"
    on public.projects for insert
    with check (
      org_id is not null and
      exists (
        select 1 from public.organisation_members om
        where om.org_id = projects.org_id and om.user_id = auth.uid()
      )
    );
  ```
  Apply via the Supabase MCP `apply_migration` tool (migration name:
  `member_project_client_access`).

- [ ] C2: **API route** — update `src/app/api/projects/route.ts`.
  Replace the `['owner', 'admin'].includes(membership.role)` 403 check with a
  check that the org's owner has a Team plan:
  1. Query `organisation_members` for `role = 'owner'` in `orgId` → get `ownerUserId`
  2. Call `getSubscription(ownerUserId)` → check `isTeamPlan`
  3. If the org owner is NOT on Team plan → return 402 `"Team plan required for organisation projects"`
  4. Any org member (any role) may then proceed to insert.
  Personal projects (`org_id = null`) keep existing individual subscription +
  project-limit logic completely unchanged.

- [ ] C3: **ProjectForm toggle** — update `src/components/projects/ProjectForm.tsx`.
  When `orgId` is present, add a **"Scope"** row above the project name field with
  two pill-style toggle buttons: **Personal** and **Organisation** (default:
  Organisation). Local state: `scope: 'personal' | 'org'` (default `'org'`).
  - When Personal → POST body includes `org_id: null`
  - When Organisation → POST body includes `org_id: orgId` (as now)
  Remove the `canCreateOrgProject` prop — it is no longer needed (API enforces).
  Remove the "Organisation projects require the Team plan" warning paragraph.
  All other fields (name, description, colour, due date, client, budget) unchanged.

- [ ] C4: **Projects page separation** — update `src/app/dashboard/projects/page.tsx`.
  Split the project list into two groups after fetching:
  - `personalProjects` — where `project.org_id === null`
  - `orgProjects` — where `project.org_id !== null`
  Apply the active/archived split within each group. Render:
  ```
  <ProjectForm … />          {/* unchanged — stays at top */}

  <section>
    <h2>Organisation Projects (N)</h2>
    {/* active org projects grid, then archived */}
  </section>

  <section>
    <h2>Personal Projects (N)</h2>
    {/* active personal projects grid, then archived */}
  </section>
  ```
  Pass `scope="org"` to each org ProjectCard and `scope="personal"` to each
  personal ProjectCard. Do not alter the query itself — just split the existing
  result array. Remove the `canCreateOrgProject` prop from `<ProjectForm>`.

- [ ] C5: **ProjectCard scope badge** — update `src/components/projects/ProjectCard.tsx`.
  Accept an optional `scope?: 'personal' | 'org'` prop (default: `'personal'`).
  Render a small pill badge inside the card (top-right corner, or below the
  project name — whichever fits cleanly):
  - `'personal'` → grey pill: `bg-gray-100 text-gray-500`, label `"Personal"`
  - `'org'` → cyan pill: `bg-cyan-100 text-cyan-700`, label `"Organisation"`
  Style: `rounded-xl px-2 py-0.5 text-xs font-black uppercase tracking-wide`
  No other changes to card layout or behaviour.

## Verification
- After each item: `npm run lint` — no new errors. `npx tsc --noEmit` — no type errors.
- C1: SQL file exists with both policies; migration applied successfully.
- C2: A non-admin org member can create an org project via POST `/api/projects`.
  A user outside the org still cannot.
- C3: ProjectForm shows scope toggle when orgId is present. Selecting Personal
  sends `org_id: null`; Organisation sends the real orgId.
- C4: Projects page renders two sections with correct headings and counts.
  A project with org_id appears under Organisation; one without appears under Personal.
- C5: Cards display the correct colour-coded scope badge.

## Out of scope
- Confidential documents and access control (Phase 5.5b — planned separately).
- Changing any existing admin/owner UPDATE or DELETE permissions.
- Clients page UI changes — the new RLS INSERT policy makes the existing create
  flow work for all org members with no UI changes needed.
- No new npm dependencies.
- No billing, auth, or Stripe changes.
