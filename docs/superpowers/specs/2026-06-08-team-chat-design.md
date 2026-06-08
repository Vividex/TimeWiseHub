# Phase 12 — Team Chat — Design

> Authored 2026-06-08. In-app messaging so org members can communicate 1:1 or
> read org announcements, with file sharing and real-time delivery, without
> leaving TimeWiseHub. First feature in the codebase to use Supabase Realtime.
> Covers GOALS.md items 12.1–12.6.

## Goal

Give org members two ways to communicate inside the app:

1. **Direct messages** — open 1:1 chat between any two members of the same org.
2. **Announcements channel** — one org-wide channel, read-only for employees;
   only `owner`/`admin`/`manager` can post.

Messages persist in Supabase, deliver live via Realtime, support file
attachments, show unread badges, and trigger a web-push notification — but only
when doing so respects the recipient's working hours and leave (a deliberate
"right to disconnect" stance; Australia's right-to-disconnect provisions apply).

## Locked decisions

- **Conversation model:** one unified set of tables. `chat_conversations.type`
  is `'channel'` or `'dm'`. Everything (RLS, unread, realtime) keys off a single
  `chat_participants` membership table that carries per-user read state.
- **Announcements channel:** exactly one auto-created channel per org, modelled
  as a `chat_conversations` row (`type='channel'`). Read-only for `employee`;
  post rights for `owner`/`admin`/`manager`. Modelled as a table so more
  channels could be added later without a migration rewrite — but only the one
  announcements channel ships in this phase (YAGNI).
- **Direct messages:** fully open — any member may DM any other member of the
  **same org**. No peer-DM restriction. 1:1 only — no group DMs.
- **Org scoping:** chat is org-only. Personal-account users (no org) have no
  chat. The app already assumes one org per user (`resolveRole` uses
  `.maybeSingle()`), so chat leans on that — no org-switcher.
- **Realtime mechanism:** Postgres Changes on `chat_messages` (DB is the source
  of truth; Supabase applies RLS to the stream). Not Broadcast.
- **File sharing:** private `chat-attachments` bucket; multiple attachments per
  message via a `chat_attachments` table. Images preview inline; other files
  show a download chip.
- **Unread:** per-participant `last_read_at`; nav badge + per-conversation
  badge; opening a thread marks it read.
- **Notifications:** web-push only, no chat email. Respects
  `notification_preferences`. Fired **only when the recipient is not actively
  viewing** the conversation, and **only when boundaries allow** (quiet hours +
  leave + public holiday). Message delivery (store + live + badge) is never
  gated — only the push is.
- **Edit/delete:** no editing in v1. Sender soft-deletes own message;
  `owner`/`admin`/`manager` soft-delete any announcement (moderation). Deleted
  messages render as "message removed".
- **Sender-side courtesy hint:** when composing a DM to someone currently
  off/after-hours, the composer shows a quiet hint ("It's after hours for
  Sam — they'll see this later"). Informational only; never blocks sending.
- **Out of scope:** rostering/shift scheduling (parked as a future standalone
  phase), group DMs, multiple/custom channels, message editing, threaded
  replies, reactions, typing indicators, chat email digests.

## Current state (reference — read before touching)

- `supabase/schema-001-auth.sql` — `profiles`, `organisations`,
  `organisation_members` (roles `owner`/`admin`/`manager`/`employee`),
  `member_role` enum. RLS is the security model: `EXISTS` subqueries against
  `organisation_members`.
- `supabase/schema-003-account-settings.sql` — `profiles.notification_preferences`
  JSONB (currently `deadline_alerts`, `priority_nudges`, `daily_digest`,
  `scheduled_reports`, `idle_alerts`). Defaults only apply to new rows; existing
  rows lack any new keys, so code must read with fallbacks.
- `supabase/schema-014-push-subscriptions.sql` — `push_subscriptions`
  (VAPID web push), RLS "manage own".
- `supabase/schema-017-leave.sql` — `leave_requests` (`status` incl.
  `'approved'`, `start_date`/`end_date`). Used for "is this person off today?".
- `supabase/schema-022-australian-public-holidays.sql` — holiday dates.
- `supabase/schema-035-confidential-documents.sql` — reference pattern for
  storage RLS that joins `storage.objects.name` to a metadata table.
- `src/lib/supabase-browser.ts` / `-server.ts` / `-service.ts` — `@supabase/ssr`
  clients. Browser client used for Realtime + client-direct RLS writes; service
  client used only for push fan-out.
- `src/lib/auth/resolve-role.ts` — `resolveRole()` → `{ userId, orgId, role,
  isManager, isFinancial }`.
- `src/lib/push.ts` — existing web-push send helper. Reuse for chat push.
- `src/lib/email-notifications.ts` — Resend helper (NOT used for chat).
- `src/components/DashboardShell.tsx` — `NAV_GROUPS` (chat goes in **Work**),
  desktop + mobile nav, `PAGE_TITLES`.
- `public/` service worker (Phase 9.7 push handler) — extend to suppress chat
  notifications when a focused window is on the conversation.
- No existing Realtime usage anywhere — this phase establishes the pattern.

## Data model

### `chat_conversation_type` enum
`'channel' | 'dm'`.

### `chat_conversations`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `org_id` | uuid not null → organisations on delete cascade | scopes everything |
| `type` | `chat_conversation_type` not null | |
| `title` | text null | `'Announcements'` for the channel; null for DMs |
| `dm_key` | text null | `least(a,b) || ':' || greatest(a,b)` of the two user ids; null for channels |
| `created_by` | uuid null → profiles | |
| `created_at` | timestamptz not null default now() | |

- `unique(org_id, dm_key)` — prevents duplicate DM threads (and resolves the
  concurrent-open race; the second insert fails cleanly).
- Partial unique on `(org_id) where type='channel'` is **not** added (would
  block future multi-channel); the single channel is guaranteed by the
  auto-create trigger instead.

### `chat_participants` — membership + read-state for **both** types
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `conversation_id` | uuid not null → chat_conversations on delete cascade | |
| `user_id` | uuid not null → profiles on delete cascade | |
| `last_read_at` | timestamptz not null default now() | drives unread |
| `created_at` | timestamptz not null default now() | |

- `unique(conversation_id, user_id)`.
- DMs: two rows inserted by `start_dm()`.
- Announcements channel: one row per org member, kept in sync by a trigger on
  `organisation_members` (insert → add participant to that org's channel;
  delete → remove). Invariant: a user has a participant row for every
  conversation they belong to.

### `chat_messages`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `conversation_id` | uuid not null → chat_conversations on delete cascade | |
| `sender_id` | uuid not null → profiles | |
| `body` | text | may be empty when message is attachment-only |
| `deleted_at` | timestamptz null | soft delete |
| `created_at` | timestamptz not null default now() | |

- Index `(conversation_id, created_at desc)` for thread paging.
- A message must have non-empty `body` OR at least one attachment (enforced in
  the send path, not a DB constraint, since attachments insert after).

### `chat_attachments`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `message_id` | uuid not null → chat_messages on delete cascade | |
| `storage_path` | text not null | `conversation_id/message_id/<uuid>-filename` |
| `file_name` | text not null | original name |
| `mime_type` | text not null | |
| `size_bytes` | bigint not null | |
| `created_at` | timestamptz not null default now() | |

### Storage
Private bucket `chat-attachments`. Path: `conversation_id/message_id/<uuid>-filename`
(so `storage.foldername(name)[1]` = `conversation_id`). Reuse the file-size /
type limits already applied to receipts and project documents.

## Access rules (RLS)

All policies key off `chat_participants`, so they stay uniform.

- **`chat_conversations` SELECT:** participant of the conversation.
- **`chat_participants` SELECT:** rows for conversations you participate in
  (i.e. your own rows, plus — for DMs — your peer's row so the UI can resolve
  the other party). Implement as: participant of `conversation_id`.
- **`chat_participants` UPDATE:** `user_id = auth.uid()` (you may only move your
  own `last_read_at`).
- **`chat_messages` SELECT (and Realtime):** a `chat_participants` row exists for
  `(conversation_id, auth.uid())`. One predicate covers DMs and the channel.
- **`chat_messages` INSERT:** participant of the conversation **AND**, when the
  conversation `type='channel'`, the sender has `owner`/`admin`/`manager` in the
  conversation's `org_id`. This is the only policy that branches on type — it is
  what makes the announcements channel read-only for employees.
- **`chat_messages` UPDATE (soft-delete only):** `sender_id = auth.uid()`
  (delete own) **OR** (`type='channel'` AND management role in the org). A
  `before update` trigger restricts updates to setting `deleted_at` (no body
  edits in v1).
- **`chat_attachments` SELECT/INSERT:** mirror the parent message's
  SELECT/INSERT rules (join through `chat_messages`).
- **storage.objects (`chat-attachments`):** SELECT if participant of
  `foldername[1]`'s conversation; INSERT if you may post to that conversation
  (participant, plus channel-role check for channels).

## Functions & triggers (SECURITY DEFINER, `search_path = public`)

- **`ensure_announcements_channel(org_id)`** — idempotently creates the org's
  single `type='channel'` conversation titled `'Announcements'` and seeds a
  participant row for every current org member. Called when an org is created
  and by the membership-sync trigger as a safety net.
- **Membership-sync trigger on `organisation_members`** — on insert, ensure the
  channel exists and add a participant row for the new member; on delete, remove
  the member's channel participant row.
- **`start_dm(target_user uuid)` → conversation_id** — find-or-create the DM
  between `auth.uid()` and `target_user` in their shared org. Validates both are
  members of the same org. Inserts conversation (with `dm_key`) + both
  participant rows; returns existing id if the `dm_key` already exists. Wraps the
  unique-constraint race.
- **`get_chat_unread()` → set of `(conversation_id, unread_count)`** — for the
  current user: count of messages where `created_at > last_read_at`,
  `sender_id <> auth.uid()`, `deleted_at is null`, per conversation they
  participate in. Used for initial badge load; Realtime keeps it live after.
- **Soft-delete guard trigger on `chat_messages`** — on UPDATE, reject any change
  other than `deleted_at` (prevents body edits via direct client writes).
- Revoke `execute` on definer functions from `public`/`anon` where appropriate,
  matching schema-035's hardening.

## Realtime

- Add `chat_messages` (and `chat_attachments`) to the `supabase_realtime`
  publication.
- Browser client opens, on chat mount:
  - **Global subscription** — all `chat_messages` inserts; RLS filters the stream
    to conversations you participate in. Each event updates the relevant
    conversation's unread count and the nav badge. No polling.
  - **Active-conversation subscription** — appends live messages (and their
    attachments) to the open thread.
- `ChatRealtimeProvider` (client context) owns the subscriptions and exposes
  unread counts + live message events to the page.

## Notifications + boundary gate

**Send path:** `POST /api/chat/send` (body: `conversation_id`, `body`,
uploaded attachment metadata).

1. Insert the message under the **user's** server session (RLS enforced) and
   insert attachment rows.
2. Realtime delivers the message to participants live.
3. Fan out web push via the **service** client to each *other* participant who
   passes **all** of:
   - `notification_preferences.chat_messages` enabled (missing → default `true`);
   - **Quiet hours:** now, evaluated in the recipient's `profiles.timezone`,
     falls within their working days + window. Stored at
     `notification_preferences.quiet_hours = { enabled, days:[ISO weekday…],
     start:"HH:MM", end:"HH:MM" }`. Default `{ enabled:true, days:[1,2,3,4,5],
     start:"08:00", end:"18:00" }` (read with fallback). `enabled:false` → no
     quiet-hours suppression.
   - **Not on leave:** no `approved` `leave_requests` covering today.
   - **Not a public holiday:** today not in `australian_public_holidays`.

**Presence ("only when not actively viewing")** is enforced in the **service
worker**: on a chat push, `clients.matchAll()`; if a focused window is already on
that conversation's URL, skip showing the notification. Server owns *boundaries*;
SW owns *presence* — each checks what it has ground truth for.

The message write is a plain RLS insert; only the push fan-out uses the service
client, so a notifier bug can never widen who can read a message.

## UI / navigation

- **Nav:** add `{ label: 'Chat', href: '/dashboard/chat', icon: MessageSquare }`
  to the **Work** group in `DashboardShell`; add to `PAGE_TITLES`; mirror in
  mobile nav. Unread badge on the item.
- **`/dashboard/chat`** — two-pane layout:
  - Left: conversation list. **Announcements** pinned top; then DMs sorted by
    most-recent, each with last-message preview + unread badge. "New message"
    button → `NewDmDialog` listing org members.
  - Right: `MessageThread` (paged history, live appends, inline image previews /
    attachment chips, "message removed" for soft-deleted) + `MessageComposer`
    (text + attach; shows `AvailabilityHint` when the DM peer is off/after-hours;
    composer is read-only/hidden for employees on the Announcements channel).
- **Components** under `src/components/chat/`: `ChatRealtimeProvider`,
  `ConversationList`, `MessageThread`, `MessageComposer`, `AttachmentChip`,
  `NewDmDialog`, `AvailabilityHint`, `UnreadBadge`.
- **Mark-as-read:** opening a thread updates the current user's
  `chat_participants.last_read_at = now()` (client-direct via browser client).

## Migrations (schema-NNN convention)

- **`schema-036-chat.sql`** — `chat_conversation_type` enum; `chat_conversations`,
  `chat_participants`, `chat_messages`, `chat_attachments` tables + indexes; all
  RLS policies; `ensure_announcements_channel`, `start_dm`, `get_chat_unread`;
  membership-sync + soft-delete-guard triggers; add tables to
  `supabase_realtime` publication; backfill — create the Announcements channel +
  seed participants for every existing org and member.
- **`schema-037-chat-storage.sql`** — `chat-attachments` bucket + storage RLS.
- Quiet-hours keys need no migration (code reads `notification_preferences` with
  fallbacks).
- Applied via Supabase MCP `apply_migration` per the handover workflow.

## Verification (no test runner — per project convention)

- `pnpm lint` + `tsc --noEmit` clean.
- **Two-account smoke** (two browsers, same org, a manager + an employee):
  - DM: send both directions; confirm live Realtime delivery, unread badge
    increments, mark-read on open clears the badge.
  - Announcements: manager posts and it appears for the employee live; the
    employee's composer is read-only and a direct insert is rejected by RLS.
  - Attachments: upload an image (inline preview) and a PDF (download chip);
    confirm the non-participant cannot fetch the object.
  - Soft-delete: sender removes own message → "message removed"; manager removes
    an announcement.
  - Notifications: with the thread unfocused, recipient gets a push; with it
    focused, no push (SW suppression); set quiet hours / approve leave / land on
    a public holiday → push suppressed but message still delivered + badged.
- **SQL checks** for the RLS predicates (participant-only SELECT; channel
  posting role gate; own-row `last_read_at` update; duplicate-`dm_key` rejected).

## GOALS.md updates

- Mark 12.1–12.6 progress as implemented.
- Add to the Parking Lot: **Rostering / shift scheduling** (standalone future
  phase — could feed chat presence/notification windows).
