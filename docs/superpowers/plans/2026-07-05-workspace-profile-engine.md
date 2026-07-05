# Workspace Profile Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Build the additive schema + code registry + resolver function that lets terminology vary
per Workspace Profile, with zero visible behaviour change to the app today.

**Architecture:** One migration adds `workspace_profile`/`setup_completed`/`setup_completed_at`
columns to `organisations` and `profiles` (both default to values that preserve current behaviour).
A code-based registry (`src/lib/workspace-profiles/`) maps a profile key to a terminology
dictionary. One resolver function looks up the current user's profile key (org membership first,
solo Pro fallback) and returns its config. Nothing in the existing UI calls the resolver yet.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No new UI changes in this phase — every existing page must render identically after this ships.
- No new RLS policies — confirmed via audit that existing `organisations`/`profiles` UPDATE
  policies already cover any new column.
- No test runner in this project — verification is `pnpm run build` (tsc + eslint) plus direct
  SQL checks (Supabase MCP `execute_sql`) and, for the resolver, a one-off local script run via
  `npx tsx` (not added as a project dependency, not committed).
- `workspace_profile` is plain `text`, not a Postgres enum — the registry in code is the only
  source of truth for valid keys.
- Migration file: `supabase/schema-083-workspace-profiles.sql` (next number after 082).
- Source spec: `docs/superpowers/specs/2026-07-05-workspace-profile-engine-design.md` — read it
  for the full rationale behind every decision below.

---

### Task 1: Database migration — Workspace Profile columns

**Files:**
- Create: `supabase/schema-083-workspace-profiles.sql`

**Interfaces:**
- Produces: `organisations.workspace_profile` (text, default `'generic'`),
  `organisations.setup_completed` (boolean, default `false`),
  `organisations.setup_completed_at` (timestamptz, nullable) — and the identical three columns on
  `profiles`. Task 2 and Task 3's code read/write these column names exactly.

This task is **conductor-only** (DB migrations always are in this project — Codex's sandbox can't
run `apply_migration`).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 083: Workspace Profile columns
-- Phase 1 of the Workspace Profile roadmap — additive only, no RLS changes
-- needed (organisations' existing "Owners and admins can update organisation
-- settings" policy and profiles' existing "Users can update their own
-- profile" policy already cover any column, including these new ones).
-- Run via Supabase MCP apply_migration (name: workspace_profile_columns)
-- ============================================================

alter table public.organisations
  add column workspace_profile text not null default 'generic',
  add column setup_completed boolean not null default false,
  add column setup_completed_at timestamptz;

alter table public.profiles
  add column workspace_profile text not null default 'generic',
  add column setup_completed boolean not null default false,
  add column setup_completed_at timestamptz;
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Name: `workspace_profile_columns`, project id `sdwwlnnsijcadkdwsvud`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organisations', 'profiles')
  and column_name in ('workspace_profile', 'setup_completed', 'setup_completed_at')
order by table_name, column_name;
```

Expected: 6 rows (3 columns × 2 tables), `workspace_profile` default `'generic'::text`,
`setup_completed` default `false`, `setup_completed_at` nullable with no default.

```sql
select workspace_profile, setup_completed from public.organisations;
select workspace_profile, setup_completed from public.profiles;
```

Expected: every existing row shows `generic` / `false` — confirms the defaults applied
retroactively to pre-existing rows, not just future inserts.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-083-workspace-profiles.sql
git commit -m "feat: workspace profile engine — database migration"
```

---

### Task 2: Workspace Profile types and registry

**Files:**
- Create: `src/lib/workspace-profiles/types.ts`
- Create: `src/lib/workspace-profiles/registry.ts`

**Interfaces:**
- Consumes: nothing (pure, no DB access in this task).
- Produces: `WorkspaceProfileKey` (union type), `Terminology` (type), `WorkspaceProfileConfig`
  (type, fields `key: WorkspaceProfileKey`, `label: string`, `terminology: Terminology`),
  `WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig>`,
  `getWorkspaceProfile(key: string): WorkspaceProfileConfig`. Task 3's resolver calls
  `getWorkspaceProfile` by exactly this name and signature.

- [ ] **Step 1: Write `src/lib/workspace-profiles/types.ts`**

```typescript
export type WorkspaceProfileKey =
  | 'generic'
  | 'tutoring'
  | 'personal_training'
  | 'builder_construction'
  | 'trades_field_services'
  | 'consulting'
  | 'healthcare'
  | 'real_estate'
  | 'cleaning_maintenance'
  | 'creative_agencies'

export type TerminologyKey = 'client' | 'session' | 'program' | 'project'

export type Terminology = Record<TerminologyKey, string>

export type WorkspaceProfileConfig = {
  key: WorkspaceProfileKey
  label: string
  terminology: Terminology
}
```

- [ ] **Step 2: Write `src/lib/workspace-profiles/registry.ts`**

```typescript
import type { WorkspaceProfileConfig, WorkspaceProfileKey } from './types'

const GENERIC_TERMINOLOGY = {
  client: 'Client',
  session: 'Session',
  program: 'Program',
  project: 'Project',
} as const

export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
  generic: {
    key: 'generic',
    label: 'Other / Not Listed',
    terminology: GENERIC_TERMINOLOGY,
  },
  tutoring: {
    key: 'tutoring',
    label: 'Tutoring & Education',
    terminology: { client: 'Student', session: 'Lesson', program: 'Course', project: 'Learning Plan' },
  },
  personal_training: {
    key: 'personal_training',
    label: 'Personal Training & Fitness',
    terminology: { client: 'Member', session: 'Appointment', program: 'Training Plan', project: 'Package' },
  },
  builder_construction: { key: 'builder_construction', label: 'Builder & Construction', terminology: GENERIC_TERMINOLOGY },
  trades_field_services: { key: 'trades_field_services', label: 'Trades & Field Services', terminology: GENERIC_TERMINOLOGY },
  consulting: { key: 'consulting', label: 'Consulting & Professional Services', terminology: GENERIC_TERMINOLOGY },
  healthcare: { key: 'healthcare', label: 'Healthcare & Allied Health', terminology: GENERIC_TERMINOLOGY },
  real_estate: { key: 'real_estate', label: 'Real Estate & Property', terminology: GENERIC_TERMINOLOGY },
  cleaning_maintenance: { key: 'cleaning_maintenance', label: 'Cleaning & Maintenance', terminology: GENERIC_TERMINOLOGY },
  creative_agencies: { key: 'creative_agencies', label: 'Creative Agencies & Marketing', terminology: GENERIC_TERMINOLOGY },
}

export function getWorkspaceProfile(key: string): WorkspaceProfileConfig {
  return WORKSPACE_PROFILES[key as WorkspaceProfileKey] ?? WORKSPACE_PROFILES.generic
}
```

- [ ] **Step 3: Report back** (Codex turn) — list files changed, confirm no other files touched.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean (these are new, unimported files — tsc/eslint should have nothing to flag
beyond confirming they parse and type-check standalone).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts
git commit -m "feat: workspace profile engine — types and registry"
```

---

### Task 3: Resolver function

**Files:**
- Create: `src/lib/workspace-profiles/resolve.ts`

**Interfaces:**
- Consumes: `getWorkspaceProfile(key: string): WorkspaceProfileConfig` from
  `./registry` (Task 2).
- Produces: `getWorkspaceProfileForUser(supabase: SupabaseClient, userId: string): Promise<WorkspaceProfileConfig>` —
  this exact name and signature is what Phases 2+ will import and call. Nothing calls it yet in
  this phase.

- [ ] **Step 1: Write `src/lib/workspace-profiles/resolve.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { getWorkspaceProfile } from './registry'
import type { WorkspaceProfileConfig } from './types'

export async function getWorkspaceProfileForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceProfileConfig> {
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (membership?.org_id) {
    const { data: org } = await supabase
      .from('organisations')
      .select('workspace_profile')
      .eq('id', membership.org_id)
      .maybeSingle()
    return getWorkspaceProfile(org?.workspace_profile ?? 'generic')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_profile')
    .eq('id', userId)
    .maybeSingle()
  return getWorkspaceProfile(profile?.workspace_profile ?? 'generic')
}
```

- [ ] **Step 2: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 4: One-off functional verification (not committed)**

No test runner exists, and this function isn't wired into any page yet, so prove it works against
real data with a throwaway script run via `npx tsx` (not added to `package.json` — `npx` runs it
without installing a project dependency, same as this project's existing ad hoc `npx vercel`
usage). Write to the scratchpad directory, not the repo:

```typescript
// scratchpad-only, e.g. C:\Users\<you>\AppData\Local\Temp\claude\...\verify-workspace-profile.ts
import { createClient } from '@supabase/supabase-js'
import { getWorkspaceProfileForUser } from '../../../../GameForge/TimeWiseHub/src/lib/workspace-profiles/resolve'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: anyMember } = await supabase.from('organisation_members').select('user_id').limit(1).maybeSingle()
  if (!anyMember) throw new Error('no organisation_members row to test with')
  const before = await getWorkspaceProfileForUser(supabase, anyMember.user_id)
  console.log('BEFORE (expect generic):', before.key, before.terminology)

  const { data: membership } = await supabase.from('organisation_members').select('org_id').eq('user_id', anyMember.user_id).single()
  await supabase.from('organisations').update({ workspace_profile: 'tutoring' }).eq('id', membership!.org_id)
  const after = await getWorkspaceProfileForUser(supabase, anyMember.user_id)
  console.log('AFTER (expect tutoring):', after.key, after.terminology)

  // revert — this script must not leave test data behind
  await supabase.from('organisations').update({ workspace_profile: 'generic' }).eq('id', membership!.org_id)
}
main()
```

Run: `npx tsx <path-to-scratchpad-script>` with the project's env vars loaded (same
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` used elsewhere in this project's scripts).

Expected output:
```
BEFORE (expect generic): generic { client: 'Client', session: 'Session', program: 'Program', project: 'Project' }
AFTER (expect tutoring): tutoring { client: 'Student', session: 'Lesson', program: 'Course', project: 'Learning Plan' }
```

Then confirm via MCP `execute_sql` (`select workspace_profile from public.organisations where id = '<the org id>'`)
that the script's revert actually ran and the row is back to `generic` — this phase must not leave
any real data mutated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-profiles/resolve.ts
git commit -m "feat: workspace profile engine — resolver function"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), registry/types (Task 2), resolver (Task 3) — all three
  spec sections have a task. The spec's "out of scope" list (UI, wizard, dynamic terminology
  consumption, nav/dashboard/tutorial config, deep terminology for unvalidated industries) has no
  corresponding task, correctly, since it's explicitly deferred.
- **Placeholder scan:** none — every step has real, complete code.
- **Type consistency:** `WorkspaceProfileKey`, `Terminology`, `WorkspaceProfileConfig` (Task 2)
  match exactly what Task 3's `resolve.ts` imports and uses; `getWorkspaceProfile` name/signature
  matches between Task 2's export and Task 3's import.
