# Workspace Profile Engine

## Goal
Build the additive schema + code registry + resolver function that lets terminology vary per
Workspace Profile, with zero visible behaviour change to the app today. Phase 1 of a larger
multi-phase roadmap (setup wizard, dynamic terminology, dynamic navigation, dashboard
personalisation, dynamic tutorial — each a future separate brainstorm/spec/plan/handover cycle).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-workspace-profile-engine-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-workspace-profile-engine.md`
- One product, one brand (TimeWiseHub) for now — no separate branded products (BuilderHub,
  TutorHub, etc.) and no industry marketing landing pages in scope. Driven by two real prospects
  (tutoring, personal training), not speculative.
- `workspace_profile` is plain `text`, not a Postgres enum — the code registry is the only source
  of truth for valid keys. Only `generic`/`tutoring`/`personal_training` get real terminology; the
  other 7 categories from the roadmap doc are stubbed to generic terminology until real demand
  exists.
- No new RLS policies needed — confirmed via audit that `organisations`' existing "Owners and
  admins can update organisation settings" policy and `profiles`' existing "Users can update their
  own profile" policy already cover any column, including the new ones.
- Works for solo Pro users (no organisation) too, not just team orgs — columns added to both
  `organisations` and `profiles`, resolver checks org membership first, falls back to the user's
  own profile row.
- No UI changes in this phase. Nothing calls the resolver from any existing page yet.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-3's functional verification script is conductor-only, throwaway (scratchpad, never committed,
  run via `npx tsx` — not added as a project dependency).

---

## C-1 — Database migration: Workspace Profile columns

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-083-workspace-profiles.sql`:
  ```sql
  alter table public.organisations
    add column workspace_profile text not null default 'generic',
    add column setup_completed boolean not null default false,
    add column setup_completed_at timestamptz;

  alter table public.profiles
    add column workspace_profile text not null default 'generic',
    add column setup_completed boolean not null default false,
    add column setup_completed_at timestamptz;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `workspace_profile_columns`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('organisations', 'profiles')
    and column_name in ('workspace_profile', 'setup_completed', 'setup_completed_at')
  order by table_name, column_name;
  ```
  Expected: 6 rows, `workspace_profile` default `'generic'::text`, `setup_completed` default
  `false`, `setup_completed_at` nullable with no default. Then:
  ```sql
  select workspace_profile, setup_completed from public.organisations;
  select workspace_profile, setup_completed from public.profiles;
  ```
  Expected: every existing row shows `generic` / `false`. Result: confirmed — 1/1 organisations,
  7/7 profiles match the default exactly.
- [x] Commit: `git add supabase/schema-083-workspace-profiles.sql && git commit -m "feat: workspace profile engine — database migration"`

---

## C-2 — Workspace Profile types and registry

*Codex edits:*
- [x] Create `src/lib/workspace-profiles/types.ts`:
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
- [x] Create `src/lib/workspace-profiles/registry.ts`:
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
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "feat: workspace profile engine — types and registry"`

---

## C-3 — Resolver function

*Codex edits:*
- [ ] Create `src/lib/workspace-profiles/resolve.ts`:
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
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] One-off functional verification (not committed): write a throwaway script to the scratchpad
  directory, run via `npx tsx` (not added as a project dependency), using the service-role client
  to call `getWorkspaceProfileForUser` for a real org's member — confirm it returns `generic`
  terminology by default, then confirm it returns the `tutoring` dictionary after manually setting
  that org's `workspace_profile` to `'tutoring'`, then revert the row and confirm via MCP
  `execute_sql` that it's back to `generic`. This phase must not leave any real data mutated.
- [ ] Commit: `git add src/lib/workspace-profiles/resolve.ts && git commit -m "feat: workspace profile engine — resolver function"`

---

## Acceptance checklist
- [x] C-1: `workspace_profile`/`setup_completed`/`setup_completed_at` columns on `organisations`
  and `profiles`, defaults verified applied to existing rows
- [x] C-2: `src/lib/workspace-profiles/types.ts` + `registry.ts` created, build passes
- [ ] C-3: `src/lib/workspace-profiles/resolve.ts` created, build passes, functional verification
  confirms correct terminology resolution and no data left mutated

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project. C-3's resolver is verified via a throwaway `npx tsx` script (conductor-only, never
committed) since nothing in the existing UI calls it yet.
