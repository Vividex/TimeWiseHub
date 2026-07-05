# Dynamic Terminology — Clients Section (Phase 3, first slice)

## Background

Phase 1 (`docs/superpowers/specs/2026-07-05-workspace-profile-engine-design.md`) shipped a
terminology registry and `getWorkspaceProfileForUser()` resolver, unused by any UI. Phase 2
(`docs/superpowers/specs/2026-07-05-organisation-setup-wizard-design.md`) shipped a wizard that
sets an org's/user's `workspace_profile`. This phase is the first real *consumer* of the
terminology data: making the word "Client" configurable ("Student" for tutoring, "Member" for
personal training) somewhere a user actually sees it.

**Scope decided during brainstorming (2026-07-05):** the roadmap doc's Phase 3 ("Dynamic
Terminology... refactor existing UI to consume the provider") is, in its full form, a
2,609-occurrence, 326-file effort (confirmed via audit) — far too large for one spec/plan/pass.
This phase converts **only the Clients section** as a first vertical slice / proof of concept.
Everything else stays "Client"/"Session"/"Program"/"Project" for now, rolled out incrementally in
future phases. Sidebar navigation labels are explicitly **not** part of this phase — the roadmap
doc's own Phase 4 ("Dynamic Navigation... Order, Icons, Labels, Visibility, Grouping") owns that.

## Terminology shape change

The existing `Terminology` type (Phase 1, `src/lib/workspace-profiles/types.ts`) stores one
capitalized string per term (`client: 'Student'`). Real UI text needs both forms — "Student name"
(singular) and "No students yet" (plural, lowercase mid-sentence). Rather than guess-pluralize at
each call site (fragile — English plurals are irregular in general, even though our current three
real terms happen to be regular), the type changes to store both explicitly:

```typescript
export type TerminologyEntry = { singular: string; plural: string }
export type Terminology = Record<TerminologyKey, TerminologyEntry>
```

This is a safe change — nothing outside `src/lib/workspace-profiles/` currently destructures
`Terminology`'s old shape (confirmed: `IndustryPicker.tsx` only reads `.label`, `resolve.ts` just
passes the object through unchanged). All ten registry entries (`generic`, `tutoring`,
`personal_training`, and the seven stub categories) get updated to the new shape — for the seven
stubs, this just means writing out `{ singular: 'Client', plural: 'Clients' }` etc. instead of
reusing a flat string constant.

Registry values for the three real profiles:

```typescript
generic:           client: { singular: 'Client',       plural: 'Clients' }
                    session: { singular: 'Session',      plural: 'Sessions' }
                    program: { singular: 'Program',      plural: 'Programs' }
                    project: { singular: 'Project',      plural: 'Projects' }

tutoring:          client: { singular: 'Student',       plural: 'Students' }
                    session: { singular: 'Lesson',       plural: 'Lessons' }
                    program: { singular: 'Course',       plural: 'Courses' }
                    project: { singular: 'Learning Plan', plural: 'Learning Plans' }

personal_training: client: { singular: 'Member',        plural: 'Members' }
                    session: { singular: 'Appointment',  plural: 'Appointments' }
                    program: { singular: 'Training Plan', plural: 'Training Plans' }
                    project: { singular: 'Package',      plural: 'Packages' }
```

Lowercase, mid-sentence usage (e.g. "Add your first client.") is handled at the call site via
`.toLowerCase()` on the resolved string — the registry stores Title Case only, matching how the
existing hardcoded strings are written today. This avoids doubling the registry's size with a
separate lowercase field for a need that's purely about sentence position, not the word itself.

## Data flow

Every file in scope is a server component page, or a client component rendered directly under one
within the same request. Server pages call the existing `getWorkspaceProfileForUser(supabase,
user.id)` (Phase 1, its first real consumer), destructure `.terminology.client`, and either use it
directly in their own JSX or pass it down as a plain `clientLabel: TerminologyEntry` prop to client
children — the same way this codebase already threads server-resolved data into client components
everywhere. No new data-fetching pattern, no client-side hook, no context provider.

Client components receive **only** `clientLabel: TerminologyEntry`, not the full `Terminology`
object — this phase only touches the "client" term. If a later phase revisits, say,
`NewSessionModal.tsx` for "session" terminology, it gains a `sessionLabel` prop then, not now.

## Files in scope

**Server pages** (call `getWorkspaceProfileForUser`, use/pass down `terminology.client`):
- `src/app/dashboard/clients/page.tsx` — "Clients (N)" heading, "No clients yet. Add your first."
  empty state
- `src/app/dashboard/clients/[id]/page.tsx` — "← Clients" back link
- `src/app/dashboard/clients/[id]/invoices/page.tsx` — "No invoices for this client yet."
- `src/app/dashboard/clients/[id]/quotes/page.tsx` — "No quotes for this client yet."
- `src/app/dashboard/clients/[id]/projects/page.tsx` — "No projects yet for this client."
- `src/app/dashboard/clients/[id]/messages/page.tsx` — "Client messaging is a Pro feature", "email
  with clients right from their record", "no client login required"
- `src/app/dashboard/quotes/new/page.tsx` — "Client is optional — you can create a free-standing
  quote..."
- `src/app/dashboard/invoices/new/page.tsx` — doesn't display "Client" text itself, but renders
  `NewInvoiceForm` (below) which now requires the prop — must resolve and pass it through even
  though this page isn't conceptually "Clients section"

**Client components** (gain a `clientLabel: TerminologyEntry` prop):
- `src/components/clients/ClientForm.tsx` — "+ Add client" button, "Client name *" label, "Save
  client" button
- `src/components/clients/EditClientModal.tsx` — "Edit client" heading, "Client name *" label
- `src/components/clients/DeleteClientButton.tsx` — "removed from your active client list" dialog
  copy
- `src/components/clients/ClientMessagesThread.tsx` — "Add an email address to this client...",
  "Client" sender label
- `src/components/clients/NewSessionModal.tsx` — "...pre-filled from this client's saved
  template..."
- `src/components/invoices/NewInvoiceForm.tsx` — "Client & period" heading, "Client" label, "—
  Select client —" option (shared with both `quotes/new` and `invoices/new`)

**Explicitly not touched:** `src/components/clients/ClientList.tsx` (dead code, not imported
anywhere — confirmed via audit); `src/components/nav/SidebarNav.tsx`'s "Clients" nav item
(Phase 4's job); every other file among the 326 referencing Client/Session/Program/Project outside
this list.

## Out of scope

- Sessions, Programs, Projects terminology anywhere (including inside the Clients section's own
  child pages, e.g. `clients/[id]/projects/page.tsx` keeps saying "Projects" as a heading — only
  its one "Client" string changes).
- Sidebar navigation, dashboard widgets, invoices/quotes UI beyond the single "Client" string each
  already lists above.
- Any admin/settings UI for editing terminology beyond what Phase 2 already built (the Industry
  picker) — there is no plan to expose per-word overrides.

## Verification

No test runner in this project — verification is `pnpm run build` (tsc + eslint) plus manual
browser testing: view the Clients section as the Vividex owner (currently `workspace_profile =
builder_construction`, which is a stub inheriting generic terminology — so as a build-time check,
temporarily setting it to `tutoring` via Settings, confirming "Student"/"Students" appears
correctly throughout the 14 files, then setting it back to `builder_construction` afterward) is the
most direct way to confirm every string actually changes correctly.
