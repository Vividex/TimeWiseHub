# Workspace Profile Engine — Design (Phase 1 of the Workspace Profile roadmap)

## Background

`TimeWiseHub_Development_Specification.docx` (in this folder) lays out a 7-phase vision for
turning TimeWiseHub into a configuration-driven Business Operations Platform — terminology,
navigation, dashboard layout, onboarding, and eventually branding all adapt per industry via
"Workspace Profiles," rather than the app being permanently tailored to one field.

**Decided scope for the overall roadmap (2026-07-05 brainstorm):**
- One product, one brand (TimeWiseHub) for now. Phase 7 (separately-branded products —
  BuilderHub, TutorHub, etc. — and their marketing landing pages) is explicitly deferred, not
  part of the current plan.
- Driven by two real prospects (tutoring, personal training) — not speculative. Scope decisions
  below favor building real depth for those two plus the existing default, and cheap placeholders
  for everything else in the doc's 10-category list.
- No current customers besides the user's own org, so there's no migration-disruption risk to
  design around — future phases can be as direct as the doc proposes.
- Workspace Profile must work for solo Pro users (no organisation), not just team orgs — matches
  the existing nullable-`org_id` dual-ownership pattern already used for `clients`/`client_messages`.

**This document specs only Phase 1** — the engine (schema + a terminology registry + one resolver
function). Phases 2-6 (setup wizard, dynamic terminology consuming this data in the UI, dynamic
navigation, dashboard personalisation, dynamic tutorial) are each their own future brainstorm/spec/
plan cycle, built on top of what Phase 1 establishes. **No UI changes happen in this phase** — the
app behaves identically to today after this ships; only new, currently-unused data plumbing exists.

## Guiding constraint: as non-invasive as possible

This is deliberately the smallest possible slice: additive columns with safe defaults, one new
code module, no RLS changes, nothing wired into any existing page. Confirmed via audit:
- `organisations` already has a **permissive UPDATE policy** (`schema-043`: owners/admins can
  update any column) and `profiles` already has **"users can update their own profile"**
  (`schema-001`, any column). New columns on both tables are covered automatically — zero new RLS
  policies needed.
- Every existing row gets `workspace_profile = 'generic'` by default, which is defined to have
  *identical* terminology to what's on screen today. Nothing changes for the one existing org
  (Vividex) or any other current data.

## Database schema

New migration: `supabase/schema-083-workspace-profiles.sql`.

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

`workspace_profile` is plain `text`, not a Postgres enum — the registry (below) is the single
source of truth for valid keys, entirely in code. Adding a new industry later is a code change +
deploy, never a migration. This mirrors how the codebase already treats similarly
developer-authored config (`NAV_GROUPS` in `SidebarNav.tsx`, `TUTORIAL_STEPS` in
`tutorial-steps.ts` — both hardcoded TS, not DB-driven).

`setup_completed` / `setup_completed_at` are inert in this phase (nothing sets them, nothing reads
them) — they exist now so Phase 2's setup wizard has a column to write to without another
migration. Every existing row defaults to `false`, which is exactly what Phase 2 needs to know who
to walk through the wizard.

## Code architecture

New directory: `src/lib/workspace-profiles/`.

**`types.ts`:**
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

`TerminologyKey` is a closed set matching the doc's own examples (Client, Session, Program,
Project) — not a loose `Record<string, string>`. A typo'd key becomes a compile error, not a
silent runtime miss. Extend this union in a later phase if dynamic terminology (Phase 3) needs to
cover more terms (e.g. "invoice", "quote") — don't guess now.

Deliberately **not** included yet: `enabledModules`, `navigation`, `dashboard`, `tutorial`,
`branding`. Their shapes depend on design decisions Phases 4-6 haven't made yet; adding them now
means guessing and likely redoing it. Adding a field to `WorkspaceProfileConfig` later is a
one-file change — nothing about this phase blocks it.

**`registry.ts`:**
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

Only `generic`, `tutoring`, and `personal_training` get real terminology — the two validated
prospects, plus the default that preserves today's behaviour. The other 7 categories from the doc
exist as full registry entries (so a future picker can show a credible 10-option list) but their
terminology is `GENERIC_TERMINOLOGY` — identical to today, just a different label. When a real
prospect shows up in one of those fields, fleshing out that one entry is a small, isolated change.
"Other/Custom" from the doc is folded into `generic` itself (same terminology, relabelled) rather
than a separate, functionally-identical key.

`getWorkspaceProfile()` falls back to `generic` for any unrecognised key — belt-and-suspenders in
case a DB row ever has a stale/invalid value (e.g. after a profile is renamed in code).

**`resolve.ts`:**
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

One resolver, one lookup point — org membership wins for team accounts, falls back to the user's
own `profiles.workspace_profile` for solo Pro. This is the only function later phases (3-6) will
call; "avoid scattered if-statements" per the doc's own instruction.

## Out of scope for this phase (explicitly deferred)

- Any UI change — no page renders differently after this ships.
- The setup wizard (Phase 2) — including actually setting `workspace_profile` to anything other
  than the default for any row.
- Dynamic terminology consuming the registry anywhere in the UI (Phase 3) — confirmed via audit
  this is a ~2,600-occurrence, 326-file effort, entirely separate from this phase.
- `enabledModules` / navigation / dashboard / tutorial / branding config shapes (Phases 4-6).
- Deep terminology for the 7 unvalidated industries — stubbed to generic until real demand exists.
- Phase 7 and the multi-brand endgame — out of scope for the whole roadmap right now, not just
  this phase.

## Verification

No test runner in this project (per `CLAUDE.md`) — verification is:
1. `pnpm run build` passes clean (tsc + eslint) — proves the new module compiles and nothing
   existing broke.
2. Direct SQL check post-migration: confirm every existing `organisations`/`profiles` row has
   `workspace_profile = 'generic'` and `setup_completed = false` (defaults applied retroactively,
   not just for new rows).
3. A one-off manual check (e.g. a throwaway script or Node REPL call) that
   `getWorkspaceProfileForUser()` returns the `generic` config for the existing org, and that
   manually setting a test row's `workspace_profile` to `'tutoring'` and re-running returns the
   Student/Lesson/Course/Learning-Plan dictionary. No automated test suite for this, consistent
   with the rest of the project.
