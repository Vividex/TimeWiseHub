# Dynamic Terminology — Clients Section

## Goal
Make the word "Client" configurable (Student/Member/etc.) across the Clients section — list page,
detail page, all sub-pages, and their forms/modals — as the first working consumer of Phase 1's
terminology registry. Phase 3 of the Workspace Profile roadmap, deliberately scoped to a single
vertical slice rather than the full 326-file/2,609-occurrence sweep.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-dynamic-terminology-clients-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-dynamic-terminology-clients.md`
- Only the Clients section converts this phase — Sessions/Programs/Projects terminology, sidebar
  nav (Phase 4's job), dashboard, and everything else among the 326 files stays unchanged, rolled
  out incrementally in future phases.
- `Terminology` changes shape: `Record<TerminologyKey, { singular: string; plural: string }>`
  instead of a flat string — explicit plurals rather than guess-pluralizing at call sites (English
  plurals are irregular in general). Safe change: nothing outside `src/lib/workspace-profiles/`
  currently destructures the old shape.
- Server pages call the existing `getWorkspaceProfileForUser()` (Phase 1, its first real UI
  consumer) and pass `terminology.client` down as a plain `clientLabel: { singular; plural }` prop
  to client children — no new data-fetching pattern, no context provider, no client-side hook.
- Two files not identified during brainstorming were found while reading the actual code:
  `src/app/dashboard/clients/[id]/sessions/page.tsx` (the real parent of `NewSessionModal`, not
  `clients/[id]/page.tsx` as first assumed) and `src/components/clients/EditClientButton.tsx` (a
  pass-through wrapper around `EditClientModal`) — both included in scope.
- Lowercase, mid-sentence usage uses `.toLowerCase()` at the call site — registry stores Title
  Case only.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- No DB migration this phase.
- C-4's manual smoke test requires temporarily switching the real org's Industry to "Tutoring &
  Education" via Settings, then switching it back afterward — must not leave real account data
  changed.

---

## C-1 — Terminology type: singular/plural shape

*Codex edits:*
- [x] Edit `src/lib/workspace-profiles/types.ts` — replace:
  ```typescript
  export type Terminology = Record<TerminologyKey, string>
  ```
  with:
  ```typescript
  export type TerminologyEntry = { singular: string; plural: string }

  export type Terminology = Record<TerminologyKey, TerminologyEntry>
  ```
- [x] Replace the entire contents of `src/lib/workspace-profiles/registry.ts` with:
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
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/lib/workspace-profiles/types.ts src/lib/workspace-profiles/registry.ts && git commit -m "feat: dynamic terminology — singular/plural registry shape"`

---

## C-2 — Clients list + detail + CRUD

*Codex edits:*
- [x] Edit `src/app/dashboard/clients/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `{canAdd && <ClientForm orgId={orgId} />}` to `{canAdd && <ClientForm orgId={orgId} clientLabel={terminology.client} />}`.
  - Change:
    ```typescript
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Clients ({clients.length})</h2>
          <TileGrid empty="No clients yet. Add your first.">
    ```
    to:
    ```typescript
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{terminology.client.plural} ({clients.length})</h2>
          <TileGrid empty={`No ${terminology.client.plural.toLowerCase()} yet. Add your first.`}>
    ```
- [x] Edit `src/app/dashboard/clients/[id]/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `<Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>` to `<Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← {terminology.client.plural}</Link>`.
  - Add `clientLabel={terminology.client}` prop to `<EditClientButton client={{...}} />` and to `<DeleteClientButton clientId={id} clientName={client.name} />`.
- [x] Edit `src/components/clients/ClientForm.tsx`:
  - Change signature to `export default function ClientForm({ orgId, clientLabel }: { orgId: string | null; clientLabel: { singular: string; plural: string } }) {`.
  - Change `{open ? 'Cancel' : '+ Add client'}` to `` {open ? 'Cancel' : `+ Add ${clientLabel.singular.toLowerCase()}`} ``.
  - Change `Client name *` label to `{clientLabel.singular} name *`.
  - Change `{loading ? 'Saving…' : 'Save client'}` to `` {loading ? 'Saving…' : `Save ${clientLabel.singular.toLowerCase()}`} ``.
- [x] Edit `src/components/clients/EditClientButton.tsx`:
  - Change signature to `export default function EditClientButton({ client, clientLabel }: { client: Client; clientLabel: { singular: string; plural: string } }) {`.
  - Change `{open && <EditClientModal client={client} onClose={() => setOpen(false)} />}` to `{open && <EditClientModal client={client} onClose={() => setOpen(false)} clientLabel={clientLabel} />}`.
- [x] Edit `src/components/clients/EditClientModal.tsx`:
  - Change signature to `export default function EditClientModal({ client, onClose, clientLabel }: { client: Client; onClose: () => void; clientLabel: { singular: string; plural: string } }) {`.
  - Change `Edit client` heading to `Edit {clientLabel.singular.toLowerCase()}`.
  - Change `Client name *` label to `{clientLabel.singular} name *`.
- [x] Edit `src/components/clients/DeleteClientButton.tsx`:
  - Change signature to `export default function DeleteClientButton({ clientId, clientName, clientLabel }: { clientId: string; clientName: string; clientLabel: { singular: string; plural: string } }) {`.
  - Change:
    ```typescript
        message={`${clientName} will be removed from your active client list. All sessions, notes, and invoices are preserved — this is reversible via the database.`}
        confirmLabel="Archive client"
    ```
    to:
    ```typescript
        message={`${clientName} will be removed from your active ${clientLabel.singular.toLowerCase()} list. All sessions, notes, and invoices are preserved — this is reversible via the database.`}
        confirmLabel={`Archive ${clientLabel.singular.toLowerCase()}`}
    ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/dashboard/clients/page.tsx src/app/dashboard/clients/[id]/page.tsx src/components/clients/ClientForm.tsx src/components/clients/EditClientButton.tsx src/components/clients/EditClientModal.tsx src/components/clients/DeleteClientButton.tsx && git commit -m "feat: dynamic terminology — Clients list, detail, and CRUD"`

---

## C-3 — Client sub-pages (sessions, projects, invoices, quotes, messages)

*Codex edits:*
- [x] Edit `src/app/dashboard/clients/[id]/sessions/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `<NewSessionModal clientId={id} orgId={orgId} />` to `<NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} />`.
- [x] Edit `src/components/clients/NewSessionModal.tsx`:
  - Add `clientLabel: { singular: string; plural: string }` to the props type/destructuring.
  - Change `Checklist will be pre-filled from this client&apos;s saved template ({templates.length} items).` to `Checklist will be pre-filled from this {clientLabel.singular.toLowerCase()}&apos;s saved template ({templates.length} items).`.
- [x] Edit `src/app/dashboard/clients/[id]/projects/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `<TileGrid empty="No projects yet for this client.">` to `` <TileGrid empty={`No projects yet for this ${terminology.client.singular.toLowerCase()}.`}> ``.
- [x] Edit `src/app/dashboard/clients/[id]/invoices/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `No invoices for this client yet.` to `No invoices for this {terminology.client.singular.toLowerCase()} yet.`.
- [x] Edit `src/app/dashboard/clients/[id]/quotes/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `No quotes for this client yet.` to `No quotes for this {terminology.client.singular.toLowerCase()} yet.`.
- [x] Edit `src/app/dashboard/clients/[id]/messages/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change:
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
  - Change `<ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} />` to `<ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} clientLabel={terminology.client} />`.
- [x] Edit `src/components/clients/ClientMessagesThread.tsx`:
  - Add `clientLabel: { singular: string; plural: string }` to the props type/destructuring.
  - Change `Add an email address to this client before sending messages.` to `Add an email address to this {clientLabel.singular.toLowerCase()} before sending messages.`.
  - Change `{m.direction === 'outbound' ? (m.sender_name ?? 'You') : 'Client'} — {fmtTime(m.created_at)}` to `{m.direction === 'outbound' ? (m.sender_name ?? 'You') : clientLabel.singular} — {fmtTime(m.created_at)}`.
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/dashboard/clients/[id]/sessions/page.tsx src/components/clients/NewSessionModal.tsx src/app/dashboard/clients/[id]/projects/page.tsx src/app/dashboard/clients/[id]/invoices/page.tsx src/app/dashboard/clients/[id]/quotes/page.tsx src/app/dashboard/clients/[id]/messages/page.tsx src/components/clients/ClientMessagesThread.tsx && git commit -m "feat: dynamic terminology — client sub-pages (sessions, projects, invoices, quotes, messages)"`

---

## C-4 — Shared invoice/quote creation form

*Codex edits:*
- [ ] Edit `src/components/invoices/NewInvoiceForm.tsx`:
  - Add `clientLabel: { singular: string; plural: string }` to the props type/destructuring.
  - Change `<h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Client &amp; period</h2>` to `<h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{clientLabel.singular} &amp; period</h2>`.
  - Change:
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
- [ ] Edit `src/app/dashboard/quotes/new/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change:
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
- [ ] Edit `src/app/dashboard/invoices/new/page.tsx`:
  - Add import `import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'`.
  - After `if (!user) redirect('/login')`, add `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)`.
  - Change `<NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} />` to `<NewInvoiceForm orgId={membership?.org_id ?? null} userId={user.id} initialClientId={clientId} clientLabel={terminology.client} />`.
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: temporarily switch the Vividex org's Industry to "Tutoring & Education"
  via Settings, walk through every page in scope (Clients list, add/edit/archive client, client
  detail, Sessions/Projects/Invoices/Quotes/Messages sub-pages, messages composer,
  `/dashboard/invoices/new`, `/dashboard/quotes/new`) confirming "Student"/"Students" appears
  correctly throughout, then switch Industry back to restore the real account's prior state.
- [ ] Commit: `git add src/components/invoices/NewInvoiceForm.tsx src/app/dashboard/quotes/new/page.tsx src/app/dashboard/invoices/new/page.tsx && git commit -m "feat: dynamic terminology — shared invoice/quote creation form"`

---

## Acceptance checklist
- [x] C-1: `Terminology` singular/plural shape shipped, registry updated, build passes
- [x] C-2: Clients list/detail/CRUD converted, build passes
- [x] C-3: client sub-pages converted, build passes
- [ ] C-4: shared invoice/quote form converted, manual smoke confirms every string switches
  correctly under "Tutoring & Education" and real account industry is restored afterward

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser smoke required for C-4.
