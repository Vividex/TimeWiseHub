# Client Email Messaging — Design

## Goal
Let staff have a real, two-way email conversation with a client from inside TimeWiseHub — compose
and send a message from the client's record, and see the client's replies show up there too —
without the client ever needing a TimeWiseHub account or login. Raised as direct customer
feedback: "is it possible to funnel all client communication through this site without the client
needing to log in?"

## Out of scope (this phase)
- **SMS.** Requires a new paid provider (Twilio: a dedicated AU number plus per-message fees) —
  deliberately deferred to its own follow-up phase with its own cost approval, once email proves
  useful. Not bundled into this spec.
- **Retrofitting existing automated emails** (invoice sends, session reminders, video call
  invites) into this thread. Those keep working exactly as they do today; only new messages
  composed through the new Messages page are logged here. Folding the existing ~5 send call-sites
  in is a real but separate follow-up once this core thread exists.
- **Attachments** on messages sent/received through this thread — text only for this phase.
- **Multiple threads per client.** One running chronological history per client, not one thread
  per session/invoice/context.
- Editing or deleting a sent message, read receipts, typing indicators — none of the richer chat
  features from the video-call room chat carry over; this is a plain email thread.

## Why not reuse the existing room-chat infrastructure
The video-call room chat (`chat_conversations`/`chat_messages`/`chat_participants`) is built around
authenticated, real-time participants — even the guest side requires a real (if locked-down)
Supabase account so Postgres RLS and realtime subscriptions can identify who's allowed to read/post.
A client using plain email never touches the app at all — there's no account to authenticate, and
an inbound message is just a webhook payload from an external mail server, not a proposabase-known
user. Forcing this into the chat model would mean inventing a fake account for someone who will
never use it, purely to satisfy machinery designed for a different problem (a Postgres RLS/realtime
system, not a mail relay). A dedicated, simpler table fits this shape directly.

A third-party shared inbox (Front, Missive, etc.) was also considered — it would need an ongoing
subscription and would pull the conversation out of TimeWiseHub entirely, working against the
customer's actual ask (communication visible *in this app*).

## Design

### 1. Data model — `client_messages`
One row per message in either direction:
- `id`, `client_id` (FK → `clients`), `org_id` (FK → `organisations`, denormalised for RLS the same
  way `sessions`/`scheduled_calls` already do it)
- `direction`: `'outbound'` | `'inbound'`
- `body`: text
- `sender_user_id`: FK → `profiles`, nullable — set for outbound (who on staff sent it), null for
  inbound (no app user originated it)
- `created_at`

RLS: readable/insertable by org members of `org_id`, matching the existing convention already used
for `clients`/`sessions` (`organisation_members` membership check). No client-facing RLS policy is
needed at all — the client never authenticates, so they never query this table directly.

### 2. Sending a message (outbound)
A new page, `/dashboard/clients/[id]/messages`, lets staff type a message and hit send. This posts
to a new route which:
1. Confirms the caller is an org member for this client (same pattern as other client sub-pages).
2. Confirms the client has an email on file (same "add an email first" gate already used before
   scheduling a video call) — if not, the UI shows that prompt instead of a compose box.
3. Calls the existing `sendEmail()` helper (`src/lib/email-notifications.ts`) — already supports
   `fromName` and `replyTo` overrides, no changes needed to that function. Sets `fromName` to the
   sending staff member's display name and `replyTo` to a per-client inbound address (see below).
4. Only on a successful send, inserts a `client_messages` row (`direction: 'outbound'`,
   `sender_user_id`: the caller). If the send throws, the UI shows an error and nothing is logged
   — never record a message as sent when it wasn't.

### 3. Receiving a reply (inbound)
The client does nothing different — they just hit "Reply" in their own Gmail/Outlook/whatever,
addressed back to the `replyTo` alias from step 2. That alias is
`client-<clientId>@inbound.timewisehub.com.au` (or whatever receiving subdomain is set up — see
the dependency below) — encoding which client this belongs to directly in the address, so lookup
needs no other state.

Resend receives it on that domain and POSTs an `email.received` webhook to a new route,
`/api/webhooks/resend-inbound`, which:
1. Verifies the webhook's signature (Resend's recommended practice for inbound webhooks).
2. Parses the `to` address, extracts the `clientId` from the `client-<clientId>@...` pattern.
3. Inserts a `client_messages` row (`direction: 'inbound'`, `sender_user_id: null`, body = the
   parsed plain-text content).
4. Notifies org staff that a reply arrived via `sendPushToUser` (`src/lib/push.ts`) — the same
   web-push mechanism already used for task assignments, invoice approvals, and team chat messages
   — rather than inventing a new notification channel. Sent to org members with a
   manager/admin/owner role (same audience as pending invoice approvals). Without this, replies
   would sit silently unseen, which defeats the point.

Routing is based on the fixed `to:` alias, not which address the client personally sends from — so
it's robust even if they reply from a different address than the message was originally sent to
(forwarding to a colleague, a different personal address, etc.).

### 4. Dependency — Resend receiving domain (one-time, manual, outside this codebase)
Resend needs a domain configured to receive mail before any inbound webhook fires. This means
adding a receiving subdomain (e.g. `inbound.timewisehub.com.au`) in the Resend dashboard and adding
the DNS records Resend provides at wherever `timewisehub.com.au` is registered. This is a real
step only the account/domain owner can do — it doesn't block writing or testing the outbound half
of this feature, but inbound replies won't actually arrive until it's done. Flagged here so it
isn't a surprise at ship time.

### 5. UI
- A new tile ("Messages") alongside the existing Projects/Sessions/Progress notes tiles on the
  client overview page (`/dashboard/clients/[id]/page.tsx`), linking to the new page.
- The new page itself: a simple chronological thread (oldest at top, matching the existing
  room-chat convention already used elsewhere in this app) with sender/direction distinguished
  visually (e.g. staff messages right-aligned, client replies left-aligned — same convention as
  `RoomChatTab`), plus a text box + Send button at the bottom. No attachments, no rich text.
- If the client has no email on file: the page shows the same "add an email first" message already
  used elsewhere, no compose box.

## Testing
No test runner in this project (per `CLAUDE.md`). Verification is `pnpm run build` plus a manual
pass:
- Send a message from a client's Messages page — confirm it arrives in a real inbox (staff's own
  test email address standing in for a client) with the right `From` display name and that
  replying goes to the expected alias.
- Reply to that email — confirm the webhook fires, the reply is parsed and logged against the
  right client, and staff get notified.
- Confirm a client with no email on file sees the "add an email" prompt instead of a compose box.
- Confirm the thread renders in chronological order with outbound/inbound visually distinguished.
- This is the second feature in this codebase (after guest video chat) that depends on live,
  external auth/email infrastructure rather than pure internal Supabase reads — the manual pass
  matters more than usual, same reasoning as the room-chat feature's C-11.
