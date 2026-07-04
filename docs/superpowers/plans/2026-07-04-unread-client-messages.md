# Unread Client Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface unread client replies on the dashboard Today agenda and as a badge on the
client's own Messages tile, so staff don't have to check each client individually to discover a
reply exists.

**Architecture:** One new nullable column (`clients.messages_last_viewed_at`, shared org-wide read
state, not per-user), one new security-definer RPC deriving everything from `auth.uid()` (mirrors
the existing `get_chat_unread()` pattern — never trusts a client-supplied org/owner id), and two UI
surfaces reusing patterns already shipped in the "Dashboard Today Section" and "Client Email
Messaging" phases.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase. No
new npm dependencies, no new tables.

## Global Constraints

- No per-user read tracking — read status is shared across the whole org (confirmed during
  brainstorming).
- No unread indicator on the client list page — out of scope for this pass.
- Verification gate: `pnpm run build` (tsc + eslint) after every task. No test runner.
- All Tailwind classes must include `dark:` variants.
- `clients`' existing UPDATE policy only covers `owner`/`admin` roles — marking a client's messages
  read (a manager/employee action) must go through the service-role client after the page's normal
  RLS-respecting SELECT has already proven legitimate access, not by broadening the general
  `clients` UPDATE policy.

---

## Task 1: Database migration — `messages_last_viewed_at` + unread RPC

**Files:**
- Create: `supabase/schema-082-client-messages-unread.sql`

**Interfaces:**
- Produces: `clients.messages_last_viewed_at` (nullable timestamptz);
  `get_unread_client_messages()` RPC returning `(client_id uuid, client_name text, preview text,
  created_at timestamptz)`, one row per client with at least one unread inbound message, scoped
  entirely to the calling user via `auth.uid()` — no parameters, so it can't be called with a
  spoofed org/owner id. Consumed by Tasks 2 (mark-read updates the column), 3 (dashboard calls the
  RPC), 4 (tile queries the column directly for one client).

*Conductor only — matches this project's established convention for migrations.*

- [ ] **Step 1: Write the migration**

`supabase/schema-082-client-messages-unread.sql`:
```sql
-- ============================================================
-- TimeWiseHub — Schema 082: Unread client messages
-- Shared org-wide read marker (not per-user) — whoever last viewed a
-- client's Messages page marks it read for the whole team, matching how
-- client_messages itself already treats any org member as having equal
-- access (not just admins/owners).
-- Run via Supabase MCP apply_migration (name: client_messages_unread)
-- ============================================================

alter table public.clients
  add column messages_last_viewed_at timestamptz;

-- No parameters — everything is derived from auth.uid() so this can never be called
-- with a spoofed org/owner id to see another business's unread messages. Mirrors the
-- existing get_chat_unread() function's security pattern exactly.
create or replace function public.get_unread_client_messages()
returns table (client_id uuid, client_name text, preview text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select distinct on (c.id)
    c.id as client_id,
    c.name as client_name,
    cm.body as preview,
    cm.created_at
  from public.clients c
  join public.client_messages cm on cm.client_id = c.id and cm.direction = 'inbound'
  where (
    c.owner_id = auth.uid()
    or (c.org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = c.org_id and om.user_id = auth.uid()
    ))
  )
    and cm.created_at > coalesce(c.messages_last_viewed_at, '-infinity'::timestamptz)
  order by c.id, cm.created_at desc;
$$;

grant execute on function public.get_unread_client_messages() to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration` (name: `client_messages_unread`).

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'clients' and column_name = 'messages_last_viewed_at';
```
Expected: 1 row, `timestamptz`, nullable.

Then confirm the function exists and is callable (returns an empty or populated set without
erroring — run as a quick sanity check, not a full behavioral test yet):
```sql
select exists (
  select 1 from pg_proc where proname = 'get_unread_client_messages'
);
```
Expected: `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-082-client-messages-unread.sql
git commit -m "feat: unread client messages — database migration and RPC"
```

---

## Task 2: Mark client messages read on page view

**Files:**
- Modify: `src/app/dashboard/clients/[id]/messages/page.tsx`

**Interfaces:**
- Consumes: `createServiceClient` (`@/lib/supabase-service`, already used elsewhere in this file's
  sibling routes, not yet imported in this specific file).
- Produces: no new exports — this task only adds a side effect to the existing page.

- [ ] **Step 1: Read the current file**

Read `src/app/dashboard/clients/[id]/messages/page.tsx` in full (already read this session; verify
no drift before editing).

- [ ] **Step 2: Add the service-role import and the read-marking update**

Add the import alongside the existing `createClient` import:
```typescript
import { createServiceClient } from '@/lib/supabase-service'
```

Immediately after the existing paid-plan gate block (after the `if (!isPaidPlan(subscription)) { ... }` block's closing brace, before the `const { data: rows } = await supabase...` line), add:
```typescript
  // Viewing this page is the "read" signal — shared across the whole org, not per-user. Uses
  // the service-role client because clients' UPDATE policy only covers owner/admin roles, while
  // any org member can legitimately view this page (already proven by the RLS-respecting SELECT
  // above succeeding) and should be able to mark it read.
  const service = createServiceClient()
  await service.from('clients').update({ messages_last_viewed_at: new Date().toISOString() }).eq('id', id)

```

- [ ] **Step 3: Build check**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/messages/page.tsx"
git commit -m "feat: unread client messages — mark read on page view"
```

---

## Task 3: Dashboard "Today" agenda — unread messages block

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Produces (in `DashboardUpcoming.tsx`): `export type UnreadClientMessage = { client_id: string; client_name: string; preview: string }`, new `unreadMessages` prop.
- Consumes (in `dashboard/page.tsx`): `get_unread_client_messages` RPC from Task 1.

- [ ] **Step 1: Add the type and prop to `DashboardUpcoming.tsx`**

Read `src/components/dashboard/DashboardUpcoming.tsx` first (already read this session). Add the
new type alongside the existing ones:
```typescript
export type UnreadClientMessage = { client_id: string; client_name: string; preview: string }
```

Add `MessageCircle` to the existing `lucide-react` import (alongside `Calendar, Video, Clock3,
CheckSquare, Receipt`).

Add `unreadMessages` to the component's props (both the destructuring and the type):
```typescript
export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
  approvals,
  unreadMessages,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
}) {
```

- [ ] **Step 2: Update the empty-state check and render the block**

Change:
```typescript
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0) return null
```
to:
```typescript
  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0) return null
```

Add a new block after the `{approvals.map(...)}` block and before `{timedItems.map(...)}`,
following the exact same structural pattern as the approvals block:
```typescript
        {unreadMessages.map((msg, i) => (
          <Link
            key={`unread-${msg.client_id}`}
            href={`/dashboard/clients/${msg.client_id}/messages`}
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${i < unreadMessages.length - 1 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              <MessageCircle size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{msg.client_name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-slate-500">{msg.preview}</p>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              Unread
            </span>
          </Link>
        ))}
```

Also update the approvals block's own border condition, since there's now a block after it too —
change:
```typescript
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
```
to:
```typescript
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || unreadMessages.length > 0 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
```

And the tasks block's `isLast` calculation needs the new list folded in too — change:
```typescript
          const isLast = i === visibleTasks.length - 1 && approvals.length === 0 && timedItems.length === 0
```
to:
```typescript
          const isLast = i === visibleTasks.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
```

- [ ] **Step 3: Build check**

Run: `pnpm run build`
Expected: FAILS — `dashboard/page.tsx` doesn't pass the new required `unreadMessages` prop yet.
Expected here, resolved by the next step. Do not commit yet.

- [ ] **Step 4: Fetch unread messages in `dashboard/page.tsx` and pass the prop**

Read `src/app/dashboard/page.tsx` first (already read this session). Update the type-only import:
```typescript
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage } from '@/components/dashboard/DashboardUpcoming'
```

In the stage-1 `Promise.all` array, add one more entry (any position — order doesn't matter since
results are destructured by position, just keep the destructuring in sync):
```typescript
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes] = await Promise.all([
```
(seven existing entries unchanged, then add as the eighth, right before the closing `])`):
```typescript
    supabase.rpc('get_unread_client_messages'),
  ])
```

After the existing `todayTasks` derivation (right before `const rosterManaged = ...`), add:
```typescript
  const unreadMessages: UnreadClientMessage[] = (
    (unreadMessagesRes.data ?? []) as { client_id: string; client_name: string; preview: string; created_at: string }[]
  ).map(m => ({
    client_id: m.client_id,
    client_name: m.client_name,
    preview: m.preview.length > 80 ? m.preview.slice(0, 77) + '…' : m.preview,
  }))
```

Update the `DashboardUpcoming` render:
```typescript
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} />
```

- [ ] **Step 5: Build check**

Run: `pnpm run build`
Expected: passes clean now.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx
git commit -m "feat: unread client messages — dashboard Today agenda block"
```

---

## Task 4: Unread badge on the client's Messages tile

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `Tile`'s existing `badge?: { label: string; tone: Tone }` prop (`src/components/ui/Tile.tsx`, unmodified) — no new UI primitive needed.

- [ ] **Step 1: Read the current file**

Read `src/app/dashboard/clients/[id]/page.tsx` in full (already read this session).

- [ ] **Step 2: Fetch the unread state for this one client and add the badge**

Update the existing `clients` select to include the new column:
```typescript
  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address, owner_id, default_rate, currency, messages_last_viewed_at').eq('id', id).maybeSingle()
```

After the existing `Promise.all` block that fetches `projectCount`/`sessionCount`/`noteCount` (and
before the `let quoteCount = 0` line), add:
```typescript
  const { data: latestInboundMessage } = await supabase
    .from('client_messages')
    .select('created_at')
    .eq('client_id', id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasUnreadMessages = !!latestInboundMessage && (
    !client.messages_last_viewed_at || new Date(latestInboundMessage.created_at) > new Date(client.messages_last_viewed_at)
  )
```

Update the Messages tile to add the badge conditionally:
```typescript
            <Tile
              title="Messages"
              icon={Mail}
              accent="#0d9488"
              href={`/dashboard/clients/${id}/messages`}
              badge={hasUnreadMessages ? { label: 'New', tone: 'red' } : undefined}
            />
```

- [ ] **Step 3: Build check**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/page.tsx"
git commit -m "feat: unread client messages — badge on client overview tile"
```

---

## Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`**

Final clean check after all prior tasks.

- [ ] **Step 2: Trigger an unread state**

Using the already-proven send→reply flow from the prior phase: send a message to a test client,
reply to it from the test inbox, wait for the webhook to process.

- [ ] **Step 3: Confirm both surfaces show it**

- Load the dashboard — confirm a new entry appears in the Today section with the client's name
  and a preview of the reply, linking to that client's Messages page.
- Load that client's overview page — confirm the Messages tile shows a red "New" badge.

- [ ] **Step 4: Confirm viewing clears both**

Open the client's Messages page (this triggers the mark-read update from Task 2). Reload the
dashboard — confirm the entry is gone. Reload the client overview page — confirm the badge is
gone.

- [ ] **Step 5: Confirm the "shared across org" behavior**

If there's a second staff account in the same org, confirm that account also sees the message as
already-read after the first account viewed it (no reload of their own needed to prove it — just
confirm the underlying state, since this is shared not per-user).

- [ ] **Step 6: Confirm clients with no unread messages never show up**

A client with only outbound messages (staff sent, no reply yet), and a client with zero messages
at all, should never appear in either surface.

- [ ] **Step 7: Report pass/fail**

Fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] Task 1: `messages_last_viewed_at` column + `get_unread_client_messages()` RPC applied and
  verified, RPC takes no parameters (derives everything from `auth.uid()`)
- [ ] Task 2: viewing a client's Messages page marks it read via service-role update
- [ ] Task 3: dashboard Today agenda shows an unread-messages block, reusing the approvals block's
  visual pattern
- [ ] Task 4: client overview page's Messages tile shows a red "New" badge when unread
- [ ] Task 5: full manual smoke test passes, including the shared-read-state check
