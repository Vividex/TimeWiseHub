# Dynamic Terminology — Clients Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Make the word "Client" configurable (Student/Member/etc.) across the Clients section —
list page, detail page, all sub-pages, and their forms/modals — as the first working consumer of
Phase 1's terminology registry.

**Architecture:** Server pages call the existing `getWorkspaceProfileForUser()` and pass
`terminology.client` down as a plain `clientLabel: TerminologyEntry` prop to any client components
they render. No new data-fetching pattern, no context provider, no client-side hook.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` (tsc + eslint) plus manual
  browser testing.
- Client components receive only `clientLabel: TerminologyEntry`, never the full `Terminology`
  object — this phase only touches the "client" term.
- Lowercase, mid-sentence usage is handled via `.toLowerCase()` at the call site — the registry
  stores Title Case only.
- Sidebar navigation, dashboard, Sessions/Programs/Projects headings, and everything outside the
  15 files below stay unchanged — explicitly deferred to future phases.
- Source spec: `docs/superpowers/specs/2026-07-05-dynamic-terminology-clients-design.md`.
- Two files not identified during brainstorming were found while reading the actual code and are
  included below: `src/app/dashboard/clients/[id]/sessions/page.tsx` (the real parent of
  `NewSessionModal`, not `clients/[id]/page.tsx` as initially assumed) and
  `src/components/clients/EditClientButton.tsx` (a thin pass-through wrapper around
  `EditClientModal` that also needs the new prop).

---

### Task 1: Terminology type — singular/plural shape

**Files:**
- Modify: `src/lib/workspace-profiles/types.ts`
- Modify: `src/lib/workspace-profiles/registry.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TerminologyEntry = { singular: string; plural: string }`,
  `Terminology = Record<TerminologyKey, TerminologyEntry>`. Every later task reads
  `terminology.client.singular` / `terminology.client.plural` — this exact shape is what all of
  them depend on.

- [ ] **Step 1: Edit `src/lib/workspace-profiles/types.ts`** — replace:
  ```typescript
  export type Terminology = Record<TerminologyKey, string>
  ```
  with:
  ```typescript
  export type TerminologyEntry = { singular: string; plural: string }

  export type Terminology = Record<TerminologyKey, TerminologyEntry>
  ```

- [ ] **Step 2: Edit `src/lib/workspace-profiles/registry.ts`** — replace the entire file with:
  ```typescript
  import type { WorkspaceProfileConfig, WorkspaceProfileKey, Terminology } from './types'

  const GENERIC_TERMINOLOGY: Terminology = {
    client: { singular: 'Client', plural: 'Clients' },
    session: { singular: 'Session', plural: 'Sessions' },
    program: { singular: 'Program', plural: 'Programs' },
    project: { singular: 'Project', plural: 'Projects' },
  }

  export const WORKSPACE_PROFILES: Record<WorkspaceProfileKey, WorkspaceProfileConfig> = {
    generic: {
      key: 'generic',
      label: 'Other / Not Listed',
      terminology: GENERIC_TERMINOLOGY,
    },
    tutoring: {
      key: 'tutoring',
      label: 'Tutoring & Education',
      terminology: {
        client: { singular: 'Student', plural: 'Students' },
        session: { singular: 'Lesson', plural: 'Lessons' },
        program: { singular: 'Course', plural: 'Courses' },
        project: { singular: 'Learning Plan', plural: 'Learning Plans' },
      },
    },
    personal_training: {
      key: 'personal_training',
      label: 'Personal Training & Fitness',
      terminology: {
        client: { singular: 'Member', plural: 'Members' },
        session: { singular: 'Appointment', plural: 'Appointments' },
        program: { singular: 'Training Plan', plural: 'Training Plans' },
        project: { singular: 'Package', plural: 'Packages' },
      },
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

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean. Nothing outside `src/lib/workspace-profiles/` currently destructures
`Terminology`'s old flat-string shape (`IndustryPicker.tsx` only reads `.label`, `resolve.ts` just
passes the object through) — if the build fails here, the error will point at an unexpected
consumer of the old shape that wasn't caught during the design audit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts
git commit -m "feat: dynamic terminology — singular/plural registry shape"
```

---

### Task 2: Clients list + detail + CRUD (list page, detail page, add/edit/archive)

**Files:**
- Modify: `src/app/dashboard/clients/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/page.tsx`
- Modify: `src/components/clients/ClientForm.tsx`
- Modify: `src/components/clients/EditClientButton.tsx`
- Modify: `src/components/clients/EditClientModal.tsx`
- Modify: `src/components/clients/DeleteClientButton.tsx`

**Interfaces:**
- Consumes: `getWorkspaceProfileForUser(supabase, userId)` from
  `src/lib/workspace-profiles/resolve.ts` (Phase 1, unchanged signature), returning
  `{ terminology: Terminology }` where `terminology.client: TerminologyEntry` (Task 1).
- Produces: nothing new for later tasks — each client component below takes
  `clientLabel: { singular: string; plural: string }` as a prop; Task 3/4 files use the identical
  prop name and shape independently.

- [ ] **Step 1: Edit `src/app/dashboard/clients/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
        {canAdd && <ClientForm orgId={orgId} />}
  ```
  to:
  ```typescript
        {canAdd && <ClientForm orgId={orgId} clientLabel={terminology.client} />}
  ```
  Change:
  ```typescript
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Clients ({clients.length})</h2>
          <TileGrid empty="No clients yet. Add your first.">
  ```
  to:
  ```typescript
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{terminology.client.plural} ({clients.length})</h2>
          <TileGrid empty={`No ${terminology.client.plural.toLowerCase()} yet. Add your first.`}>
  ```

- [ ] **Step 2: Edit `src/app/dashboard/clients/[id]/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>
  ```
  to:
  ```typescript
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← {terminology.client.plural}</Link>
  ```
  Change:
  ```typescript
                <EditClientButton client={{
                  id: client.id,
                  name: client.name,
                  email: client.email ?? null,
                  phone: client.phone ?? null,
                  address: client.address ?? null,
                  default_rate: client.default_rate ?? null,
                  currency: client.currency,
                }} />
              )}
              {isAdmin && <DeleteClientButton clientId={id} clientName={client.name} />}
  ```
  to:
  ```typescript
                <EditClientButton client={{
                  id: client.id,
                  name: client.name,
                  email: client.email ?? null,
                  phone: client.phone ?? null,
                  address: client.address ?? null,
                  default_rate: client.default_rate ?? null,
                  currency: client.currency,
                }} clientLabel={terminology.client} />
              )}
              {isAdmin && <DeleteClientButton clientId={id} clientName={client.name} clientLabel={terminology.client} />}
  ```

- [ ] **Step 3: Edit `src/components/clients/ClientForm.tsx`**

  Change:
  ```typescript
  export default function ClientForm({ orgId }: { orgId: string | null }) {
  ```
  to:
  ```typescript
  export default function ClientForm({ orgId, clientLabel }: { orgId: string | null; clientLabel: { singular: string; plural: string } }) {
  ```
  Change:
  ```typescript
        {open ? 'Cancel' : '+ Add client'}
  ```
  to:
  ```typescript
        {open ? 'Cancel' : `+ Add ${clientLabel.singular.toLowerCase()}`}
  ```
  Change:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">Client name *</label>
  ```
  to:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">{clientLabel.singular} name *</label>
  ```
  Change:
  ```typescript
            {loading ? 'Saving…' : 'Save client'}
  ```
  to:
  ```typescript
            {loading ? 'Saving…' : `Save ${clientLabel.singular.toLowerCase()}`}
  ```

- [ ] **Step 4: Edit `src/components/clients/EditClientButton.tsx`**

  Change:
  ```typescript
  export default function EditClientButton({ client }: { client: Client }) {
  ```
  to:
  ```typescript
  export default function EditClientButton({ client, clientLabel }: { client: Client; clientLabel: { singular: string; plural: string } }) {
  ```
  Change:
  ```typescript
      {open && <EditClientModal client={client} onClose={() => setOpen(false)} />}
  ```
  to:
  ```typescript
      {open && <EditClientModal client={client} onClose={() => setOpen(false)} clientLabel={clientLabel} />}
  ```

- [ ] **Step 5: Edit `src/components/clients/EditClientModal.tsx`**

  Change:
  ```typescript
  export default function EditClientModal({ client, onClose }: { client: Client; onClose: () => void }) {
  ```
  to:
  ```typescript
  export default function EditClientModal({ client, onClose, clientLabel }: { client: Client; onClose: () => void; clientLabel: { singular: string; plural: string } }) {
  ```
  Change:
  ```typescript
          <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit client</h2>
  ```
  to:
  ```typescript
          <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit {clientLabel.singular.toLowerCase()}</h2>
  ```
  Change:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">Client name *</label>
  ```
  to:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">{clientLabel.singular} name *</label>
  ```

- [ ] **Step 6: Edit `src/components/clients/DeleteClientButton.tsx`**

  Change:
  ```typescript
  export default function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  ```
  to:
  ```typescript
  export default function DeleteClientButton({ clientId, clientName, clientLabel }: { clientId: string; clientName: string; clientLabel: { singular: string; plural: string } }) {
  ```
  Change:
  ```typescript
        message={`${clientName} will be removed from your active client list. All sessions, notes, and invoices are preserved — this is reversible via the database.`}
        confirmLabel="Archive client"
  ```
  to:
  ```typescript
        message={`${clientName} will be removed from your active ${clientLabel.singular.toLowerCase()} list. All sessions, notes, and invoices are preserved — this is reversible via the database.`}
        confirmLabel={`Archive ${clientLabel.singular.toLowerCase()}`}
  ```

- [ ] **Step 7: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 8: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/clients/page.tsx src/app/dashboard/clients/[id]/page.tsx src/components/clients/ClientForm.tsx src/components/clients/EditClientButton.tsx src/components/clients/EditClientModal.tsx src/components/clients/DeleteClientButton.tsx
git commit -m "feat: dynamic terminology — Clients list, detail, and CRUD"
```

---

### Task 3: Client sub-pages (sessions, projects, invoices, quotes, messages)

**Files:**
- Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`
- Modify: `src/components/clients/NewSessionModal.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/invoices/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/quotes/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/messages/page.tsx`
- Modify: `src/components/clients/ClientMessagesThread.tsx`

**Interfaces:**
- Consumes: `getWorkspaceProfileForUser` (Phase 1), same as Task 2. Independent of Task 2's file
  changes — no shared code between the two tasks beyond what Task 1 already produced.
- Produces: nothing for later tasks.

- [ ] **Step 1: Edit `src/app/dashboard/clients/[id]/sessions/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
          <NewSessionModal clientId={id} orgId={orgId} />
  ```
  to:
  ```typescript
          <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} />
  ```

- [ ] **Step 2: Edit `src/components/clients/NewSessionModal.tsx`**

  Change:
  ```typescript
  export default function NewSessionModal({
    clientId,
    orgId,
  }: {
    clientId: string
    orgId: string | null
  }) {
  ```
  to:
  ```typescript
  export default function NewSessionModal({
    clientId,
    orgId,
    clientLabel,
  }: {
    clientId: string
    orgId: string | null
    clientLabel: { singular: string; plural: string }
  }) {
  ```
  Change:
  ```typescript
              Checklist will be pre-filled from this client&apos;s saved template ({templates.length} items).
  ```
  to:
  ```typescript
              Checklist will be pre-filled from this {clientLabel.singular.toLowerCase()}&apos;s saved template ({templates.length} items).
  ```

- [ ] **Step 3: Edit `src/app/dashboard/clients/[id]/projects/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
        <TileGrid empty="No projects yet for this client.">
  ```
  to:
  ```typescript
        <TileGrid empty={`No projects yet for this ${terminology.client.singular.toLowerCase()}.`}>
  ```

- [ ] **Step 4: Edit `src/app/dashboard/clients/[id]/invoices/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
            <p className="text-sm font-semibold text-gray-400">No invoices for this client yet.</p>
  ```
  to:
  ```typescript
            <p className="text-sm font-semibold text-gray-400">No invoices for this {terminology.client.singular.toLowerCase()} yet.</p>
  ```

- [ ] **Step 5: Edit `src/app/dashboard/clients/[id]/quotes/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
            <p className="text-sm font-semibold text-gray-400">No quotes for this client yet.</p>
  ```
  to:
  ```typescript
            <p className="text-sm font-semibold text-gray-400">No quotes for this {terminology.client.singular.toLowerCase()} yet.</p>
  ```

- [ ] **Step 6: Edit `src/app/dashboard/clients/[id]/messages/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Client messaging is a Pro feature</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Send and receive email with clients right from their record, branded as your business,
            with no client login required. Upgrade to Pro to unlock it.
          </p>
  ```
  to:
  ```typescript
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{terminology.client.singular} messaging is a Pro feature</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Send and receive email with {terminology.client.plural.toLowerCase()} right from their record, branded as your business,
            with no {terminology.client.singular.toLowerCase()} login required. Upgrade to Pro to unlock it.
          </p>
  ```
  Change:
  ```typescript
      <ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} />
  ```
  to:
  ```typescript
      <ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} clientLabel={terminology.client} />
  ```

- [ ] **Step 7: Edit `src/components/clients/ClientMessagesThread.tsx`**

  Change:
  ```typescript
  export default function ClientMessagesThread({
    clientId,
    initialMessages,
    hasEmail,
  }: {
    clientId: string
    initialMessages: ClientMessage[]
    hasEmail: boolean
  }) {
  ```
  to:
  ```typescript
  export default function ClientMessagesThread({
    clientId,
    initialMessages,
    hasEmail,
    clientLabel,
  }: {
    clientId: string
    initialMessages: ClientMessage[]
    hasEmail: boolean
    clientLabel: { singular: string; plural: string }
  }) {
  ```
  Change:
  ```typescript
        Add an email address to this client before sending messages.
  ```
  to:
  ```typescript
        Add an email address to this {clientLabel.singular.toLowerCase()} before sending messages.
  ```
  Change:
  ```typescript
                {m.direction === 'outbound' ? (m.sender_name ?? 'You') : 'Client'} — {fmtTime(m.created_at)}
  ```
  to:
  ```typescript
                {m.direction === 'outbound' ? (m.sender_name ?? 'You') : clientLabel.singular} — {fmtTime(m.created_at)}
  ```

- [ ] **Step 8: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 9: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 10: Commit**

```bash
git add src/app/dashboard/clients/[id]/sessions/page.tsx src/components/clients/NewSessionModal.tsx src/app/dashboard/clients/[id]/projects/page.tsx src/app/dashboard/clients/[id]/invoices/page.tsx src/app/dashboard/clients/[id]/quotes/page.tsx src/app/dashboard/clients/[id]/messages/page.tsx src/components/clients/ClientMessagesThread.tsx
git commit -m "feat: dynamic terminology — client sub-pages (sessions, projects, invoices, quotes, messages)"
```

---

### Task 4: Shared invoice/quote creation form

**Files:**
- Modify: `src/components/invoices/NewInvoiceForm.tsx`
- Modify: `src/app/dashboard/quotes/new/page.tsx`
- Modify: `src/app/dashboard/invoices/new/page.tsx`

**Interfaces:**
- Consumes: `getWorkspaceProfileForUser` (Phase 1), same as Tasks 2/3.
- Produces: nothing for later tasks — this is the last task in the plan.

- [ ] **Step 1: Edit `src/components/invoices/NewInvoiceForm.tsx`**

  Change:
  ```typescript
  export default function NewInvoiceForm({
    orgId,
    userId,
    initialClientId,
    isQuote = false,
  }: {
    orgId: string | null
    userId: string
    initialClientId?: string
    isQuote?: boolean
  }) {
  ```
  to:
  ```typescript
  export default function NewInvoiceForm({
    orgId,
    userId,
    initialClientId,
    isQuote = false,
    clientLabel,
  }: {
    orgId: string | null
    userId: string
    initialClientId?: string
    isQuote?: boolean
    clientLabel: { singular: string; plural: string }
  }) {
  ```
  Change:
  ```typescript
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Client &amp; period</h2>
  ```
  to:
  ```typescript
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{clientLabel.singular} &amp; period</h2>
  ```
  Change:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              Client{isQuote && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
            </label>
            <select value={clientId} onChange={e => { setClientId(e.target.value); const c = clients.find(x => x.id === e.target.value); if (c) setCurrency(c.currency) }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">— Select client —</option>
  ```
  to:
  ```typescript
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              {clientLabel.singular}{isQuote && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
            </label>
            <select value={clientId} onChange={e => { setClientId(e.target.value); const c = clients.find(x => x.id === e.target.value); if (c) setCurrency(c.currency) }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">— Select {clientLabel.singular.toLowerCase()} —</option>
  ```

- [ ] **Step 2: Edit `src/app/dashboard/quotes/new/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
          <p className="mt-1 text-sm text-gray-500">Client is optional — you can create a free-standing quote and assign it later.</p>
        </div>
        <NewInvoiceForm
          orgId={membership?.org_id ?? null}
          userId={user.id}
          initialClientId={clientId}
          isQuote={true}
        />
  ```
  to:
  ```typescript
          <p className="mt-1 text-sm text-gray-500">{terminology.client.singular} is optional — you can create a free-standing quote and assign it later.</p>
        </div>
        <NewInvoiceForm
          orgId={membership?.org_id ?? null}
          userId={user.id}
          initialClientId={clientId}
          isQuote={true}
          clientLabel={terminology.client}
        />
  ```

- [ ] **Step 3: Edit `src/app/dashboard/invoices/new/page.tsx`**

  Add the import:
  ```typescript
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  ```
  After `if (!user) redirect('/login')`, add:
  ```typescript
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
  ```
  Change:
  ```typescript
          <NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} />
  ```
  to:
  ```typescript
          <NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} clientLabel={terminology.client} />
  ```

- [ ] **Step 4: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 5: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 6: Manual smoke test**

As the Vividex owner (currently `workspace_profile = builder_construction`, a stub that inherits
generic terminology — so this test needs a temporary switch): go to Settings → Organisation tab,
change Industry to "Tutoring & Education", save. Then walk through every page in scope: Clients
list ("Students"), add a client (form says "Student name"), a client's detail page ("← Students",
Edit/Archive buttons), Sessions/Projects/Invoices/Quotes/Messages empty states, the messages
composer, and both `/dashboard/invoices/new` and `/dashboard/quotes/new` — confirm every instance
now says "Student"/"Students" correctly. Then switch Industry back to "Builder & Construction" (or
whatever it was) via Settings to restore the prior state — this test must not leave the real
account's industry changed.

- [ ] **Step 7: Commit**

```bash
git add src/components/invoices/NewInvoiceForm.tsx src/app/dashboard/quotes/new/page.tsx src/app/dashboard/invoices/new/page.tsx
git commit -m "feat: dynamic terminology — shared invoice/quote creation form"
```

---

## Self-Review Notes

- **Spec coverage:** all 15 originally-scoped files plus the 2 found during code-reading
  (`clients/[id]/sessions/page.tsx`, `EditClientButton.tsx`) have a task. The spec's "out of
  scope" list (Sessions/Programs/Projects terminology, sidebar nav, dashboard, anything beyond the
  single "Client" string per file) has no corresponding task, correctly.
- **Placeholder scan:** none — every step shows the exact before/after code.
- **Type consistency:** `clientLabel: { singular: string; plural: string }` is used identically
  across every client component in Tasks 2-4 (`ClientForm`, `EditClientButton`, `EditClientModal`,
  `DeleteClientButton`, `NewSessionModal`, `ClientMessagesThread`, `NewInvoiceForm`) — matches
  `TerminologyEntry` from Task 1 structurally (not imported by name in the component prop types,
  since these client components don't need to import the workspace-profiles types module just for
  a two-field shape — the inline type is deliberately identical to `TerminologyEntry`).
