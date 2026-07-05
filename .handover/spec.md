# Unread Client Messages

## Goal
Surface unread client replies on the dashboard Today agenda and as a badge on the client's own
Messages tile, so staff don't have to check each client individually to discover a reply exists.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-04-unread-client-messages-design.md`
- Source plan: `docs/superpowers/plans/2026-07-04-unread-client-messages.md`
- Shared org-wide read state (not per-user) — whoever last viewed a client's Messages page marks
  it read for the whole team.
- No new tables — one nullable column (`clients.messages_last_viewed_at`) plus a security-definer
  RPC that takes no parameters (derives everything from `auth.uid()`, mirrors `get_chat_unread()`'s
  security pattern exactly — never trusts a client-supplied org/owner id).
- Marking read goes through the service-role client, not the caller's own session — `clients`'
  UPDATE policy only covers owner/admin roles, but any org member can legitimately view a client's
  Messages page (broader SELECT policy) and should be able to mark it read. This is a deliberate
  choice, not a workaround to flag as wrong later.
- No per-user read tracking, no unread indicator on the client list page — both explicitly out of
  scope for this pass.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-5 (manual verification) depended on the prior phase's C-8 — now confirmed working (2026-07-05,
  real inbound rows exist in `client_messages`), no longer a blocker.

---

## C-1 — Database migration and unread RPC

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-082-client-messages-unread.sql`:
  ```sql
  alter table public.clients
    add column messages_last_viewed_at timestamptz;

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
- [x] Apply via Supabase MCP `apply_migration` (name: `client_messages_unread`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'messages_last_viewed_at';
  ```
  Expected: 1 row, `timestamptz`, nullable. Then:
  ```sql
  select exists (select 1 from pg_proc where proname = 'get_unread_client_messages');
  ```
  Expected: `true`. Result: both confirmed exactly as expected.
- [x] Commit: `git add supabase/schema-082-client-messages-unread.sql && git commit -m "feat: unread client messages — database migration and RPC"`

---

## C-2 — Mark client messages read on page view

*Codex edits:*
- [x] Read `src/app/dashboard/clients/[id]/messages/page.tsx` first, then add the import
  `import { createServiceClient } from '@/lib/supabase-service'` alongside the existing
  `createClient` import, and immediately after the existing paid-plan gate block (after its
  closing brace, before `const { data: rows } = await supabase...`), add:
  ```typescript
    // Viewing this page is the "read" signal — shared across the whole org, not per-user. Uses
    // the service-role client because clients' UPDATE policy only covers owner/admin roles, while
    // any org member can legitimately view this page (already proven by the RLS-respecting SELECT
    // above succeeding) and should be able to mark it read.
    const service = createServiceClient()
    await service.from('clients').update({ messages_last_viewed_at: new Date().toISOString() }).eq('id', id)

  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/clients/[id]/messages/page.tsx" && git commit -m "feat: unread client messages — mark read on page view"`

---

## C-3 — Dashboard Today agenda unread messages block

*Codex edits:*
- [ ] Read `src/components/dashboard/DashboardUpcoming.tsx` first, then:
  1. Add `export type UnreadClientMessage = { client_id: string; client_name: string; preview: string }`
     alongside the other exported types.
  2. Add `MessageCircle` to the existing `lucide-react` import.
  3. Add `unreadMessages: UnreadClientMessage[]` to both the destructured props and the type
     signature.
  4. Change the empty-state check from
     `if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0) return null`
     to
     `if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0) return null`.
  5. Add a new block after the `{approvals.map(...)}` block and before `{timedItems.map(...)}`:
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
  6. Update the approvals block's border condition (it's no longer necessarily the last block) —
     change
     `` `flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}` ``
     to
     `` `flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || unreadMessages.length > 0 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}` ``.
  7. Update the tasks block's `isLast` calculation — change
     `const isLast = i === visibleTasks.length - 1 && approvals.length === 0 && timedItems.length === 0`
     to
     `const isLast = i === visibleTasks.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0`.
- [x] Report back — build WILL fail this turn (`dashboard/page.tsx` doesn't pass the new prop yet).
  That's expected, not a blocker.

*Conductor:*
- [x] `pnpm run build` — expect a type error (`unreadMessages` prop missing). Expected here,
  resolved by the next Codex turn.

*Codex edits (second half of C-3):*
- [x] Read `src/app/dashboard/page.tsx` first, then:
  1. Update the type-only import to add `UnreadClientMessage`:
     ```typescript
     import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage } from '@/components/dashboard/DashboardUpcoming'
     ```
  2. Add one more entry to the stage-1 `Promise.all` array and its destructuring — change
     `const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes] = await Promise.all([`
     to
     `const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes] = await Promise.all([`,
     and add `supabase.rpc('get_unread_client_messages'),` as the last array entry before the
     closing `])`.
  3. After the existing `todayTasks` derivation, add:
     ```typescript
       const unreadMessages: UnreadClientMessage[] = (
         (unreadMessagesRes.data ?? []) as { client_id: string; client_name: string; preview: string; created_at: string }[]
       ).map(m => ({
         client_id: m.client_id,
         client_name: m.client_name,
         preview: m.preview.length > 80 ? m.preview.slice(0, 77) + '…' : m.preview,
       }))
     ```
  4. Update the `DashboardUpcoming` render to add `unreadMessages={unreadMessages}`.

*Conductor:*
- [x] `pnpm run build` — must pass clean now.
- [x] Commit: `git add src/components/dashboard/DashboardUpcoming.tsx src/app/dashboard/page.tsx && git commit -m "feat: unread client messages — dashboard Today agenda block"`

---

## C-4 — Unread badge on the client's Messages tile

*Codex edits:*
- [x] Read `src/app/dashboard/clients/[id]/page.tsx` first, then:
  1. Add `messages_last_viewed_at` to the existing `clients` select:
     ```typescript
     const { data: client } = await supabase
       .from('clients').select('id, name, email, phone, address, owner_id, default_rate, currency, messages_last_viewed_at').eq('id', id).maybeSingle()
     ```
  2. After the existing `Promise.all` fetching `projectCount`/`sessionCount`/`noteCount` (before
     `let quoteCount = 0`), add:
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
  3. Update the Messages tile:
     ```typescript
             <Tile
               title="Messages"
               icon={Mail}
               accent="#0d9488"
               href={`/dashboard/clients/${id}/messages`}
               badge={hasUnreadMessages ? { label: 'New', tone: 'red' } : undefined}
             />
     ```

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/clients/[id]/page.tsx" && git commit -m "feat: unread client messages — badge on client overview tile"`

---

## C-5 — Manual end-to-end verification

*Conductor + user:*
- [x] `pnpm run build` — final clean check.
- [x] **Prerequisite:** confirm the prior phase's send→reply round trip actually works first (a
  real inbound row must exist in `client_messages` — zero exist as of this phase starting).
- [x] Trigger an unread state via the send→reply flow, confirm the dashboard Today block and the
  client tile badge both show it.
- [x] Open the client's Messages page, confirm both indicators clear on next load.
- [x] Confirm a client with only outbound messages, or no messages at all, never shows as unread.
- [x] Report pass/fail; fix inline if something's off before finishing.

Result: PASS. Real inbound reply (Message 9) came through, unread indicators confirmed on both
dashboard Today agenda and client tile. Found a pre-existing, unrelated display bug while
verifying: Outlook's quoted-reply chain includes a long unbroken logo image URL that overflowed
the message bubble (missing `break-words`), fixed inline in
`src/components/clients/ClientMessagesThread.tsx`.

---

## Acceptance checklist
- [x] C-1: `messages_last_viewed_at` column + `get_unread_client_messages()` RPC applied and
  verified, RPC takes no parameters
- [x] C-2: viewing a client's Messages page marks it read via service-role update
- [x] C-3: dashboard Today agenda shows an unread-messages block
- [x] C-4: client overview page's Messages tile shows a red "New" badge when unread
- [x] C-5: full manual smoke test passes (blocked on confirming the prior phase's inbound flow
  actually works)

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser +
email round trip required for C-5 (no test runner in this project).
