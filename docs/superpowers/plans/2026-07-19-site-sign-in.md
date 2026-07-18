# Site Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a worker sign into a job site for the day and, by doing so, gain access to that
site's SWMS/JSA safety documents even without a manager having pre-assigned them as Project Crew.
Notify everyone who should sign a newly-generated SWMS/JSA (assigned crew + anyone signed in that
day) and surface it on their Dashboard under "Today."

**Architecture:** `projects.site_id` (nullable FK to `client_sites`) resolves "which project's
SWMS/JSA applies at this site" — `client_sites` today is client-scoped with no project link at
all. A new `site_sign_ins` table records a daily, idempotent sign-in per site/worker. Three
existing RLS policies (`project_swms_documents` SELECT, `project_swms_acknowledgments` INSERT,
`project-swms` storage SELECT) each gain an additional `OR` clause granting access to anyone
signed into the project's site that day — supplementing, not replacing, the existing
`project_members`-based access. A Dashboard widget lets a worker sign in; a new "Today" item
surfaces pending signatures; a notification helper (mirroring the existing `notifyTaskAssigned`
pattern) fires on new document creation.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`), existing
`web-push`/`push_subscriptions` infrastructure.

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- Migration file: `supabase/schema-111-site-sign-ins.sql`, applied via Supabase MCP
  `apply_migration` (name: `site_sign_ins`) — conductor-only, not a Codex text-edit task.
- **Timezone correctness matters here.** This app already has `getTodaySydneyDateString()` /
  `getTodayBoundsSydney()` (`src/lib/today.ts`) specifically because Postgres's bare `current_date`
  (server/DB timezone, typically UTC) does not line up with the Australia/Sydney calendar day the
  app means by "today" — Sydney is UTC+10/+11, so for roughly half of each Sydney business day
  UTC's current_date is off by one. Every "signed in today" check — in SQL (RLS, the table
  default) and in application code — must use Sydney-local date logic, not bare `current_date` or
  `new Date().toISOString().slice(0,10)`. In SQL this means
  `(now() at time zone 'Australia/Sydney')::date`, not `current_date`.
- No new npm dependencies.
- Source spec: `docs/superpowers/specs/2026-07-19-site-sign-in-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-111-site-sign-ins.sql`

**Interfaces:**
- Produces: `projects.site_id` column; `site_sign_ins` table; additive RLS on
  `project_swms_documents`, `project_swms_acknowledgments`, and `storage.objects`
  (`project-swms` bucket).

*Conductor-only — no Codex turn, pure SQL applied via Supabase MCP.*

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 111: Site sign-in
-- Lets a project optionally point at a client_sites row (client_sites is
-- client-scoped today with no project link at all), and adds a daily,
-- idempotent per-site sign-in that supplements (doesn't replace)
-- project_members as an access grant to that project's SWMS/JSA documents.
-- "Today" here means the Australia/Sydney calendar day, matching the rest
-- of this app's date handling (src/lib/today.ts) -- NOT Postgres's bare
-- current_date, which is off by roughly half a day against Sydney time.
-- Run via Supabase MCP apply_migration (name: site_sign_ins)
-- ============================================================

alter table public.projects
  add column site_id uuid references public.client_sites(id);

create table public.site_sign_ins (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.client_sites(id),
  user_id        uuid not null references auth.users,
  sign_in_date   date not null default ((now() at time zone 'Australia/Sydney')::date),
  signed_in_at   timestamptz not null default now(),
  unique (site_id, user_id, sign_in_date)
);

alter table public.site_sign_ins enable row level security;

create policy "Users can sign themselves in"
  on public.site_sign_ins for insert
  with check (user_id = auth.uid());

create policy "Users can view their own sign-ins"
  on public.site_sign_ins for select
  using (user_id = auth.uid());

create policy "Org managers can view sign-ins for their org's sites"
  on public.site_sign_ins for select
  using (
    exists (
      select 1 from public.client_sites cs
      join public.clients c on c.id = cs.client_id
      join public.organisation_members om on om.org_id = c.org_id
      where cs.id = site_sign_ins.site_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create index site_sign_ins_site_date on public.site_sign_ins (site_id, sign_in_date);
create index site_sign_ins_user_recent on public.site_sign_ins (user_id, signed_in_at desc);

-- Supplement project_swms_documents SELECT with "signed into this project's site today"
drop policy "Crew and managers can view SWMS documents" on public.project_swms_documents;

create policy "Crew and managers can view SWMS documents"
  on public.project_swms_documents for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_swms_documents.project_id and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      where p.id = project_swms_documents.project_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_swms_documents.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.projects p
      join public.site_sign_ins ssi on ssi.site_id = p.site_id
      where p.id = project_swms_documents.project_id
        and ssi.user_id = auth.uid()
        and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
    )
  );

-- Supplement project_swms_acknowledgments INSERT with the same condition
drop policy "Crew members can acknowledge for themselves" on public.project_swms_acknowledgments;

create policy "Crew members can acknowledge for themselves"
  on public.project_swms_acknowledgments for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.project_swms_documents d
        join public.project_members pm on pm.project_id = d.project_id
        where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.project_swms_documents d
        join public.projects p on p.id = d.project_id
        join public.site_sign_ins ssi on ssi.site_id = p.site_id
        where d.id = project_swms_acknowledgments.swms_document_id
          and ssi.user_id = auth.uid()
          and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
      )
    )
  );

-- Supplement the project-swms storage SELECT policy with the same condition
drop policy "Crew and managers can view SWMS objects" on storage.objects;

create policy "Crew and managers can view SWMS objects"
  on storage.objects for select
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
          or exists (
            select 1 from public.site_sign_ins ssi
            where ssi.site_id = p.site_id
              and ssi.user_id = auth.uid()
              and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
          )
        )
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`** (name: `site_sign_ins`)

- [ ] **Step 3: Verify**

Run via `mcp__supabase__execute_sql`:
```sql
select column_name from information_schema.columns where table_name = 'projects' and column_name = 'site_id';
select count(*) from information_schema.tables where table_name = 'site_sign_ins';
select policyname from pg_policies where tablename = 'site_sign_ins';
select policyname from pg_policies where tablename = 'project_swms_documents' and policyname = 'Crew and managers can view SWMS documents';
select policyname from pg_policies where tablename = 'project_swms_acknowledgments' and policyname = 'Crew members can acknowledge for themselves';
```
Expected: `site_id` column exists; `site_sign_ins` table exists; three `site_sign_ins` policies
listed; both updated policies re-exist under their original names (confirming the drop+recreate
succeeded, not just the drop).

Also run this sanity check (verifies the Sydney-date expression actually parses and returns a
plausible value, not a Postgres error):
```sql
select (now() at time zone 'Australia/Sydney')::date as sydney_today, current_date as utc_today;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-111-site-sign-ins.sql
git commit -m "handover: SS-1 site sign-in migration (projects.site_id, site_sign_ins, supplemental RLS)"
```

---

### Task 2: SWMS/JSA access supplemented by site sign-in

**Files:**
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`

**Interfaces:**
- Consumes: `projects.site_id`, `site_sign_ins` (Task 1).
- Produces: `ProjectSwmsPanel` gains a `hasSignedInToday: boolean` prop, used everywhere the
  component currently gates on `isCrewMember` alone for acknowledgment.

- [ ] **Step 1: Compute `hasSignedInToday` in the project detail page**

Find:
```typescript
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
```
Replace with:
```typescript
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { getTodaySydneyDateString } from '@/lib/today'
```

Find:
```typescript
  let crew: CrewMemberOption[] = []
  let availableMembers: CrewMemberOption[] = []
  let swmsDocuments: SwmsDocument[] = []
  let isCrewMember = false
  let hasSignature = false

  if (supportsSwms) {
    const { data: currentProfile } = await supabase.from('profiles').select('signature_path').eq('id', user.id).maybeSingle()
    hasSignature = !!currentProfile?.signature_path
  }

  if (supportsSwms) {
    const allOrgMembers = mappedOrgMembers ?? []
    const { data: crewRows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const crewUserIds = new Set((crewRows ?? []).map(r => r.user_id as string))
    crew = allOrgMembers.filter(m => crewUserIds.has(m.userId))
    availableMembers = allOrgMembers.filter(m => !crewUserIds.has(m.userId))
    isCrewMember = crewUserIds.has(user.id)
```
Replace with:
```typescript
  let crew: CrewMemberOption[] = []
  let availableMembers: CrewMemberOption[] = []
  let swmsDocuments: SwmsDocument[] = []
  let isCrewMember = false
  let hasSignature = false
  let hasSignedInToday = false

  if (supportsSwms) {
    const { data: currentProfile } = await supabase.from('profiles').select('signature_path').eq('id', user.id).maybeSingle()
    hasSignature = !!currentProfile?.signature_path
  }

  if (supportsSwms && project.site_id) {
    const { data: signIn } = await supabase
      .from('site_sign_ins')
      .select('id')
      .eq('site_id', project.site_id)
      .eq('user_id', user.id)
      .eq('sign_in_date', getTodaySydneyDateString())
      .maybeSingle()
    hasSignedInToday = !!signIn
  }

  if (supportsSwms) {
    const allOrgMembers = mappedOrgMembers ?? []
    const { data: crewRows } = await supabase.from('project_members').select('user_id').eq('project_id', projectId)
    const crewUserIds = new Set((crewRows ?? []).map(r => r.user_id as string))
    crew = allOrgMembers.filter(m => crewUserIds.has(m.userId))
    availableMembers = allOrgMembers.filter(m => !crewUserIds.has(m.userId))
    isCrewMember = crewUserIds.has(user.id)
```

(`project.site_id` is available for free — the existing `projects` query already selects `'*'`.)

Find the `<ProjectSwmsPanel` usage and add the new prop:
```tsx
            <ProjectSwmsPanel
              clientId={id}
              projectId={project.id}
              hasSignature={hasSignature}
```
Replace with:
```tsx
            <ProjectSwmsPanel
              clientId={id}
              projectId={project.id}
              hasSignature={hasSignature}
              hasSignedInToday={hasSignedInToday}
```

- [ ] **Step 2: Use it in `ProjectSwmsPanel.tsx`**

Find:
```tsx
export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
  hasSignature,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
  hasSignature: boolean
}) {
```
Replace with:
```tsx
export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
  hasSignature,
  hasSignedInToday,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
  hasSignature: boolean
  hasSignedInToday: boolean
}) {
```

Find (the two spots gating on `isCrewMember` for the acknowledge button and status):
```tsx
                    {isCrewMember && !hasAcknowledged && (
                      <button
                        onClick={() => handleAcknowledgeClick(doc.id)}
                        disabled={ackingId === doc.id}
                        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                      >
                        {ackingId === doc.id ? 'Saving…' : "I've read and understood this"}
                      </button>
                    )}
                    {isCrewMember && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
```
Replace with:
```tsx
                    {(isCrewMember || hasSignedInToday) && !hasAcknowledged && (
                      <button
                        onClick={() => handleAcknowledgeClick(doc.id)}
                        disabled={ackingId === doc.id}
                        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                      >
                        {ackingId === doc.id ? 'Saving…' : "I've read and understood this"}
                      </button>
                    )}
                    {(isCrewMember || hasSignedInToday) && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx" src/components/projects/ProjectSwmsPanel.tsx
git commit -m "handover: SS-2 SWMS/JSA access supplemented by same-day site sign-in"
```

---

### Task 3: Site sign-in widget on the Dashboard

**Files:**
- Create: `src/components/dashboard/SiteSignInWidget.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `site_sign_ins`, `projects.site_id` (Task 1).
- Produces: `SiteSignInWidget` — a client component taking `sites: SignInSite[]` (already ordered,
  most-recently-relevant first) and `userId`, rendering the top 3 with a "show more" expansion.

- [ ] **Step 1: Create the widget**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { getTodaySydneyDateString } from '@/lib/today'

export type SignInSite = {
  id: string
  label: string
  clientName: string
  signedInToday: boolean
}

export default function SiteSignInWidget({ sites, userId }: { sites: SignInSite[]; userId: string }) {
  const router = useRouter()
  const [signingInId, setSigningInId] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<Set<string>>(new Set(sites.filter(s => s.signedInToday).map(s => s.id)))
  const [showAll, setShowAll] = useState(false)

  if (sites.length === 0) return null

  async function handleSignIn(siteId: string) {
    setSigningInId(siteId)
    const supabase = createClient()
    const { error } = await supabase.from('site_sign_ins').insert({
      site_id: siteId,
      user_id: userId,
      sign_in_date: getTodaySydneyDateString(),
    })
    setSigningInId(null)
    // 23505 = unique_violation -- already signed in today, treat as success
    if (!error || error.code === '23505') {
      setSignedIn(prev => new Set(prev).add(siteId))
      router.refresh()
    }
  }

  const visible = showAll ? sites : sites.slice(0, 3)
  const remaining = sites.length - visible.length

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Site sign-in</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visible.map((site, i) => {
          const isSignedIn = signedIn.has(site.id)
          return (
            <div
              key={site.id}
              className={`flex items-center gap-4 px-5 py-4 ${i < visible.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <MapPin size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{site.label}</p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-500">{site.clientName}</p>
              </div>
              {isSignedIn ? (
                <span className="shrink-0 text-xs font-bold text-green-600 dark:text-green-400">✓ Signed in</span>
              ) : (
                <button
                  onClick={() => handleSignIn(site.id)}
                  disabled={signingInId === site.id}
                  className="shrink-0 rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                >
                  {signingInId === site.id ? 'Signing in…' : 'Sign In'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {!showAll && remaining > 0 && (
        <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
          Show {remaining} more site{remaining === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Fetch and order sites in `src/app/dashboard/page.tsx`, and render the widget**

Find:
```typescript
import QuickActions from '@/components/dashboard/QuickActions'
```
Replace with:
```typescript
import QuickActions from '@/components/dashboard/QuickActions'
import SiteSignInWidget, { type SignInSite } from '@/components/dashboard/SiteSignInWidget'
```

Find:
```typescript
import { getTodayBoundsSydney, getTodaySydneyDateString } from '@/lib/today'
```
(This import already exists with both named exports — no change needed here, `getTodaySydneyDateString` is already imported.)

Find:
```typescript
  const workspaceProfile = await getWorkspaceProfileForUser(supabase, user.id)
  const isTutoring = workspaceProfile.key === 'tutoring'
```
Replace with:
```typescript
  const workspaceProfile = await getWorkspaceProfileForUser(supabase, user.id)
  const isTutoring = workspaceProfile.key === 'tutoring'

  let signInSites: SignInSite[] = []
  if (workspaceProfile.supportsSwms) {
    const clientQuery = orgId
      ? supabase.from('clients').select('id').eq('org_id', orgId).eq('archived', false)
      : supabase.from('clients').select('id').eq('owner_id', user.id).eq('archived', false)
    const { data: myClients } = await clientQuery
    const clientIds = (myClients ?? []).map(c => c.id)

    if (clientIds.length > 0) {
      const [{ data: sites }, { data: mySignIns }, { data: todaySignIns }] = await Promise.all([
        supabase.from('client_sites').select('id, label, client_id, clients(name)').in('client_id', clientIds).eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('site_sign_ins').select('site_id, signed_in_at').eq('user_id', user.id).order('signed_in_at', { ascending: false }).limit(50),
        supabase.from('site_sign_ins').select('site_id').eq('user_id', user.id).eq('sign_in_date', getTodaySydneyDateString()),
      ])

      const todaySignedInIds = new Set((todaySignIns ?? []).map(s => s.site_id as string))
      const recentSiteIds: string[] = []
      for (const s of mySignIns ?? []) {
        if (!recentSiteIds.includes(s.site_id as string)) recentSiteIds.push(s.site_id as string)
      }

      type SiteRow = { id: string; label: string; client_id: string; clients: { name: string } | null }
      const allSites = (sites ?? []) as unknown as SiteRow[]
      const siteMap = new Map(allSites.map(s => [s.id, s]))

      const orderedIds = [
        ...recentSiteIds.filter(id => siteMap.has(id)),
        ...allSites.map(s => s.id).filter(id => !recentSiteIds.includes(id)),
      ]

      signInSites = orderedIds.map(id => {
        const s = siteMap.get(id)!
        return {
          id: s.id,
          label: s.label,
          clientName: s.clients?.name ?? 'Client',
          signedInToday: todaySignedInIds.has(s.id),
        }
      })
    }
  }
```

Note: this block references `orgId`, which is already computed earlier in the file (`const orgId
= membership?.org_id ?? null`, ahead of the `workspaceProfile` line) — no reordering needed, just
confirm that's still true when you read the file before editing.

Find:
```tsx
        {/* Quick actions */}
        <QuickActions rosterManaged={rosterManaged} showNewStudent={isTutoring} />

        {/* Today's agenda: meetings, sessions, calendar events, task deadlines, pending approvals */}
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```
Replace with:
```tsx
        {/* Quick actions */}
        <QuickActions rosterManaged={rosterManaged} showNewStudent={isTutoring} />

        {signInSites.length > 0 && (
          <SiteSignInWidget sites={signInSites} userId={user.id} />
        )}

        {/* Today's agenda: meetings, sessions, calendar events, task deadlines, pending approvals */}
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SiteSignInWidget.tsx src/app/dashboard/page.tsx
git commit -m "handover: SS-3 site sign-in widget on the Dashboard"
```

- [ ] **Step 5: Manual smoke (deferred to the user)**

As a trades/construction-profile worker, confirm the widget shows up to 3 sites with "Show more"
if there are more than 3; sign into a site; confirm it flips to "✓ Signed in" and re-clicking
"Sign In" isn't possible; confirm a site you've signed into before shows up first the next time you
load the dashboard.

---

### Task 4: Dashboard "Today" item for pending SWMS/JSA signatures

**Files:**
- Create: `src/lib/swms-awaiting-signature.ts`
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `site_sign_ins`, `projects.site_id` (Task 1); the RLS access-model change (Task 1)
  which makes this query actually return the right documents for signed-in-but-unassigned workers.
- Produces: `getSwmsAwaitingSignature(userId)` — consumed by `dashboard/page.tsx`; `DashboardUpcoming`
  gains a `swmsAwaitingSignature` prop.

- [ ] **Step 1: Create the fetch helper**

```typescript
import { createClient } from '@/lib/supabase-server'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import { getTodaySydneyDateString } from '@/lib/today'
import type { UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'

/** Active projects' authored SWMS/JSA documents this user has access to (Project Crew or
 *  signed into the project's site today) and hasn't yet acknowledged. RLS on
 *  project_swms_documents already enforces the access check -- this just resolves which
 *  project IDs to look at and filters out already-acknowledged documents. */
export async function getSwmsAwaitingSignature(userId: string): Promise<UpcomingSwmsAck[]> {
  const supabase = await createClient()

  const [{ data: crewRows }, { data: signInRows }] = await Promise.all([
    supabase.from('project_members').select('project_id').eq('user_id', userId),
    supabase.from('site_sign_ins').select('site_id').eq('user_id', userId).eq('sign_in_date', getTodaySydneyDateString()),
  ])

  const crewProjectIds = (crewRows ?? []).map(r => r.project_id as string)
  const signedInSiteIds = (signInRows ?? []).map(r => r.site_id as string)

  let siteProjectIds: string[] = []
  if (signedInSiteIds.length > 0) {
    const { data: siteProjects } = await supabase
      .from('projects').select('id').in('site_id', signedInSiteIds).eq('status', 'active')
    siteProjectIds = (siteProjects ?? []).map(p => p.id as string)
  }

  const accessibleProjectIds = Array.from(new Set([...crewProjectIds, ...siteProjectIds]))
  if (accessibleProjectIds.length === 0) return []

  const { data: docs } = await supabase
    .from('project_swms_documents')
    .select('id, category, doc_type, project_id, projects(name, client_id, status)')
    .in('project_id', accessibleProjectIds)
    .eq('source', 'authored')

  type DocRow = {
    id: string
    category: string | null
    doc_type: 'swms' | 'jsa'
    project_id: string
    projects: { name: string; client_id: string; status: string } | null
  }
  const activeDocs = ((docs ?? []) as unknown as DocRow[]).filter(d => d.projects?.status === 'active' && d.category)
  if (activeDocs.length === 0) return []

  const docIds = activeDocs.map(d => d.id)
  const { data: myAcks } = await supabase
    .from('project_swms_acknowledgments')
    .select('swms_document_id')
    .eq('user_id', userId)
    .in('swms_document_id', docIds)
  const ackedIds = new Set((myAcks ?? []).map(a => a.swms_document_id as string))

  return activeDocs
    .filter(d => !ackedIds.has(d.id))
    .map(d => {
      const categoryLabel = d.doc_type === 'jsa'
        ? JSA_HAZARD_LABELS[d.category as keyof typeof JSA_HAZARD_LABELS]
        : HRCW_CATEGORY_LABELS[d.category as keyof typeof HRCW_CATEGORY_LABELS]
      return {
        id: d.id,
        projectId: d.project_id,
        clientId: d.projects?.client_id ?? '',
        projectName: d.projects?.name ?? 'Project',
        docType: d.doc_type,
        categoryLabel,
      }
    })
}
```

- [ ] **Step 2: Add the type and prop to `DashboardUpcoming.tsx`**

Find:
```tsx
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench, ShieldAlert, Award } from 'lucide-react'
```
Replace with:
```tsx
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench, ShieldAlert, Award, ShieldCheck } from 'lucide-react'
```

Find:
```tsx
export type UpcomingIncidentReport = {
  id: string
  type: 'injury' | 'near_miss' | 'hazard'
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  occurred_at: string
}
```
Replace with:
```tsx
export type UpcomingIncidentReport = {
  id: string
  type: 'injury' | 'near_miss' | 'hazard'
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  occurred_at: string
}
export type UpcomingSwmsAck = {
  id: string
  projectId: string
  clientId: string
  projectName: string
  docType: 'swms' | 'jsa'
  categoryLabel: string
}
```

Find:
```tsx
  vehiclesDue,
  certsDue,
  incidentReportsDue,
  currentUserId,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
  dueExpenses: UpcomingDueExpense[]
  dueBusinessExpenses: UpcomingDueExpense[]
  vehiclesDue: UpcomingVehicleDue[]
  certsDue: UpcomingCertDue[]
  incidentReportsDue: UpcomingIncidentReport[]
  currentUserId: string
}) {
```
Replace with:
```tsx
  vehiclesDue,
  certsDue,
  incidentReportsDue,
  swmsAwaitingSignature,
  currentUserId,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
  dueExpenses: UpcomingDueExpense[]
  dueBusinessExpenses: UpcomingDueExpense[]
  vehiclesDue: UpcomingVehicleDue[]
  certsDue: UpcomingCertDue[]
  incidentReportsDue: UpcomingIncidentReport[]
  swmsAwaitingSignature: UpcomingSwmsAck[]
  currentUserId: string
}) {
```

- [ ] **Step 3: Extend the empty-check, the `timedItems` border logic, and add the render block**

Find:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && certsDue.length === 0 && incidentReportsDue.length === 0) return null
```
Replace with:
```tsx
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && certsDue.length === 0 && incidentReportsDue.length === 0 && swmsAwaitingSignature.length === 0) return null
```

Find (the `timedItems.map` block — appending the new category means only this one border
condition needs updating, since `timedItems` currently renders last):
```tsx
        {timedItems.map((item, i) => (
          <div
            key={`${item.kind}-${item.id}`}
            className={`flex items-center gap-4 px-5 py-4 ${i < timedItems.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
```
Replace with:
```tsx
        {timedItems.map((item, i) => (
          <div
            key={`${item.kind}-${item.id}`}
            className={`flex items-center gap-4 px-5 py-4 ${i < timedItems.length - 1 || swmsAwaitingSignature.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
```

Find the end of the `timedItems.map` block (the closing of that `.map()` call, right before the
component's final closing tags):
```tsx
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```
Replace with:
```tsx
            )}
          </div>
        ))}
        {swmsAwaitingSignature.map((item, i) => (
          <Link
            key={`swms-${item.id}`}
            href={`/dashboard/clients/${item.clientId}/projects/${item.projectId}`}
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${i < swmsAwaitingSignature.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              <ShieldCheck size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                {item.projectName} — {item.docType === 'jsa' ? 'JSA' : 'SWMS'}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-slate-500">{item.categoryLabel}</p>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              Sign
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `src/app/dashboard/page.tsx`**

Find:
```typescript
import DashboardUpcoming from '@/components/dashboard/DashboardUpcoming'
```
Replace with:
```typescript
import DashboardUpcoming from '@/components/dashboard/DashboardUpcoming'
import { getSwmsAwaitingSignature } from '@/lib/swms-awaiting-signature'
```

Find:
```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingCertDue, UpcomingIncidentReport } from '@/components/dashboard/DashboardUpcoming'
```
Replace with:
```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingCertDue, UpcomingIncidentReport, UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'
```

Find:
```typescript
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]
```
Replace with:
```typescript
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]
  const swmsAwaitingSignature: UpcomingSwmsAck[] = workspaceProfile.supportsSwms
    ? await getSwmsAwaitingSignature(user.id)
    : []
```

Find:
```tsx
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} currentUserId={user.id} />
```
Replace with:
```tsx
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} swmsAwaitingSignature={swmsAwaitingSignature} currentUserId={user.id} />
```

- [ ] **Step 5: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/swms-awaiting-signature.ts src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx
git commit -m "handover: SS-4 Dashboard Today item for pending SWMS/JSA signatures"
```

---

### Task 5: Notification on new SWMS/JSA

**Files:**
- Create: `src/lib/swms-notifications.ts`
- Modify: `src/app/api/projects/[projectId]/swms/route.ts`

**Interfaces:**
- Consumes: `sendPushToUser` (`@/lib/push`, existing); `site_sign_ins`, `projects.site_id`
  (Task 1).
- Produces: `notifySwmsAwaitingSignature(documentId, projectId, docType, preparedById)` — called
  once, only on new-document creation (not the edit-in-place path).

- [ ] **Step 1: Create the notification helper**

```typescript
import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'
import { getTodaySydneyDateString } from '@/lib/today'

export async function notifySwmsAwaitingSignature(
  documentId: string,
  projectId: string,
  docType: 'swms' | 'jsa',
  preparedById: string,
) {
  const service = createServiceClient()

  const { data: project } = await service
    .from('projects')
    .select('name, site_id, client_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return

  const [{ data: crewRows }, { data: siteSignIns }] = await Promise.all([
    service.from('project_members').select('user_id').eq('project_id', projectId),
    project.site_id
      ? service.from('site_sign_ins').select('user_id').eq('site_id', project.site_id).eq('sign_in_date', getTodaySydneyDateString())
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ])

  const recipientIds = new Set<string>()
  ;(crewRows ?? []).forEach(r => recipientIds.add(r.user_id as string))
  ;(siteSignIns ?? []).forEach(r => recipientIds.add(r.user_id as string))
  recipientIds.delete(preparedById)

  if (recipientIds.size === 0) return

  const label = docType === 'jsa' ? 'JSA' : 'SWMS'
  const url = `/dashboard/clients/${project.client_id}/projects/${projectId}`

  await Promise.allSettled(
    Array.from(recipientIds).map(userId =>
      sendPushToUser(userId, {
        title: `New ${label} to sign — ${project.name}`,
        body: 'A new safety document needs your acknowledgment.',
        url,
        tag: `swms-awaiting:${documentId}`,
      })
    )
  )
}
```

- [ ] **Step 2: Call it from the SWMS/JSA POST route, new-document path only**

Find:
```typescript
  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `${label} — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      doc_type: docType,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```
Replace with:
```typescript
  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `${label} — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      doc_type: docType,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await notifySwmsAwaitingSignature(data.id, projectId, docType, user.id)

  return NextResponse.json(data)
}
```

Add the import alongside the other imports at the top of the file:
```typescript
import { notifySwmsAwaitingSignature } from '@/lib/swms-notifications'
```

(The `editableExistingPath` branch above this, which returns earlier in the function for an
in-place edit before any acknowledgment exists, is untouched — no notification fires for that
path, matching the design's "don't re-notify for a typo fix" decision.)

- [ ] **Step 3: Run the build**

```bash
pnpm run build
```
Expected: passes clean. This completes the phase.

- [ ] **Step 4: Commit**

```bash
git add src/lib/swms-notifications.ts "src/app/api/projects/[projectId]/swms/route.ts"
git commit -m "handover: SS-5 notify crew + signed-in workers when a new SWMS/JSA is generated"
```

- [ ] **Step 5: Manual smoke (deferred to the user)**

Generate a new JSA on a project with a site assigned; confirm both the assigned Project Crew and
anyone signed into that site today appear on their Dashboard "Today" under the new item, and (if
push-enabled in their browser) receive a notification. Confirm editing an unacknowledged document
in place does **not** re-trigger a notification. Confirm a worker with neither Project Crew
membership nor a same-day sign-in still can't see or acknowledge the project's SWMS/JSA.

---

## Acceptance checklist

- [ ] Site sign-in supplements (doesn't replace) Project Crew access to SWMS/JSA — verified via
  Task 2/5's manual smoke.
- [ ] Dashboard sign-in widget shows the 3 most recently relevant sites with a working "show more."
- [ ] Dashboard "Today" surfaces pending SWMS/JSA signatures for both Project Crew and same-day
  site sign-ins.
- [ ] New SWMS/JSA creation notifies the right recipient set, once, only on genuine new-document
  creation.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke per Task 3 Step 5 and Task 5 Step 5 — user follow-up, not the conductor's to
  complete.
