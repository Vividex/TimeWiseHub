# Room Chat + Client Delivery — Design Spec

**Date:** 2026-07-03
**Status:** Approved for implementation

---

## What we're building

Phase 2 of Programs-in-Sessions integration. During a video call linked to a session, a "Chat" tab
joins the existing Transcript and Program tabs (the two panels shipped in Phase 1, refactored into
one shared tabbed side panel). This chat is scoped to **that specific call** — anyone who joins it
(staff or the client) can read and post; nobody outside the call can. It gives staff a real,
persistent way to actually hand the client files/links from the linked program — not just show
them via screen share — closing the gap Phase 1 deliberately left open.

The client reaches this without ever creating a TimeWiseHub account, reusing (and extending) the
same "unauthenticated guest via a token" pattern already established for video call invites.

## Out of scope

- Chat outside the context of a video call (e.g. async messaging with a client between sessions) —
  this is strictly a live-call feature.
- Copying shared files into chat's own storage — sharing a program asset posts a message
  referencing it (its name + a link), not a duplicated file. Simpler, and the program remains the
  single source of truth for the file itself. Known trade-off: the link in an old chat message can
  eventually expire (same signed-URL lifetime as everywhere else in the app); re-sharing generates
  a fresh one.
- Typing indicators, read receipts, message editing/deletion, reactions — none of team chat's
  richer features carry over. This is a minimal send/receive/attach chat.
- A "has chat" indicator in calendar views — the chat lives exclusively on the session detail page
  and inside the live call; calendar views already link through to the session.
- Handling a client with no email on file — blocked with the same clear "add an email first"
  message the existing video-call-invite flow (`SessionVideoCall.tsx`) already uses, since guest
  chat identity is keyed off the client's email.

---

## Data model

Three small, additive changes — no existing table's meaning changes.

**Migration 1** (must run alone — Postgres requires a new enum value to be committed before it can
be referenced), `supabase/schema-077-session-chat-enum.sql`:

```sql
alter type public.chat_conversation_type add value 'session';
```

**Migration 2**, `supabase/schema-078-session-chat.sql`:

```sql
alter table public.chat_conversations
  add column session_id uuid references public.sessions(id) on delete cascade;

create unique index chat_conversations_session
  on public.chat_conversations (session_id) where session_id is not null;

alter table public.clients
  add column guest_chat_user_id uuid references public.profiles(id);

-- Session-type conversations behave like DMs for posting purposes: any participant may post,
-- no org-role gate (unlike channels).
create or replace function public.can_post_chat(p_conversation uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_type public.chat_conversation_type;
  v_org  uuid;
begin
  select type, org_id into v_type, v_org
  from public.chat_conversations where id = p_conversation;
  if v_type is null then return false; end if;
  if not exists (
    select 1 from public.chat_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  ) then
    return false;
  end if;
  if v_type = 'dm' or v_type = 'session' then
    return true;
  end if;
  return exists (
    select 1 from public.organisation_members om
    where om.org_id = v_org and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
  );
end;
$$;
```

No other RLS changes. `is_chat_participant()`, the `chat_messages`/`chat_attachments` policies, the
storage bucket policies, and the `send_chat_message()` RPC are all reused completely unmodified —
they already key off `chat_participants` membership, which works identically regardless of
conversation type.

**Why no new RPC for creating the conversation:** unlike `start_dm`/`ensure_announcements_channel`
(both `SECURITY DEFINER`, callable by any authenticated user, and self-validate authorization
internally), this feature's "does this conversation exist, am I allowed to join it" logic already
happens in trusted server code before either the staff or the guest ever reaches this point — the
call page's existing org-membership check for staff, and the guest-token match for guests. Adding
a separately-callable RPC would mean re-deriving that same authorization check a second time for
no benefit. Instead, conversation creation + participant upsert is a plain TypeScript helper run
server-side with the service client (see below), called only from code that has already confirmed
the caller belongs there.

---

## Guest identity and sign-in

**One identity per client, created once, reused forever** (not a fresh throwaway account per
call). Plain Supabase anonymous auth doesn't work here — `profiles.email` is `NOT NULL`, and
anonymous users have no email, so the existing `handle_new_user()` signup trigger would fail.
Instead:

New helper, `src/lib/session-chat.ts`:

```typescript
export async function ensureGuestChatUser(clientId: string): Promise<{ userId: string; email: string }> {
  const service = createServiceClient()
  const { data: client } = await service
    .from('clients').select('id, email, guest_chat_user_id').eq('id', clientId).maybeSingle()

  if (!client?.email) throw new Error('Client has no email on file')
  if (client.guest_chat_user_id) return { userId: client.guest_chat_user_id, email: client.email }

  const { data: created, error } = await service.auth.admin.createUser({
    email: client.email,
    email_confirm: true,
    user_metadata: { is_client_guest: true, client_id: client.id },
  })
  if (error || !created.user) throw new Error(`Failed to create guest chat user: ${error?.message}`)

  await service.from('clients').update({ guest_chat_user_id: created.user.id }).eq('id', clientId)
  return { userId: created.user.id, email: client.email }
}

export async function mintGuestChatToken(email: string): Promise<string> {
  const service = createServiceClient()
  const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) throw new Error(`Failed to mint guest chat token: ${error?.message}`)
  return data.properties.hashed_token
}
```

`createUser` (real user, not anonymous) means the `handle_new_user()` trigger fires normally with
a real email, satisfying the `NOT NULL` constraint — no trigger changes needed. `generateLink`
creates the token server-side without ever sending an email (the "signup" email that would
normally accompany `createUser`/magic-link is never dispatched to the client — we only use the
`hashed_token` it returns).

The guest's **browser** then establishes a real session itself, client-side, using that token —
mirroring the "server hands the browser a credential, browser exchanges it once" shape already
used for the Daily.co video token:

```typescript
await supabase.auth.verifyOtp({ email, token_hash: tokenHash, type: 'email' })
```

**Isolation, confirmed by inspection:** this guest profile has zero `organisation_members` rows.
Since virtually every RLS policy elsewhere in this app is gated on org membership or ownership
(projects, clients, sessions, programs, roster, etc.), a guest signed in this way cannot see
anything else in the product even if they tried to navigate there directly — this isn't new
protection that needs building, it falls out of the existing pervasive convention.

---

## Wiring into the existing call flow

**Staff side** (`src/app/dashboard/video/[roomId]/page.tsx`, already fetching `linkedProgram` per
Phase 1): after the existing org-membership check passes, additionally — if `call.session_id` is
set — find-or-create the session's chat conversation and upsert the current user into
`chat_participants` for it (idempotent, `on conflict do nothing`, mirroring the existing
`sync_chat_channel_membership` pattern). Pass the resulting `conversationId` into `CallRoom`.

**Guest side** (`src/app/api/video/token/route.ts`'s existing `guestToken` branch): after the
existing token/room match check passes, additionally — if the invitee's call has a `session_id` —
resolve the session's `client_id`, call `ensureGuestChatUser`, find-or-create the session's chat
conversation, upsert the guest into `chat_participants`, and call `mintGuestChatToken`. The route's
JSON response grows a new optional field:
`chat: { conversationId: string; email: string; tokenHash: string } | null`.
`GuestJoinClient.tsx` calls `supabase.auth.verifyOtp(...)` with that data (browser-side, using the
existing `@/lib/supabase-browser` client) before rendering `CallRoom`, then passes `conversationId`
through as part of a new `sessionChat` prop.

If a call has no linked session, `chat` is `null` throughout and no chat machinery runs at all —
this feature is entirely inert for ad-hoc calls, consistent with how the Program tab already
behaves.

---

## UI: unified tabbed panel

The two panels shipped in Phase 1 (`ProgramReferencePanel`, and the transcript panel currently
inlined in `CallRoom.tsx`) are refactored into one shared panel component with tabs: **Transcript
/ Program / Chat**. Same slide-in mechanics as before (`w-72`, `translate-x-0`/`translate-x-full`),
now with a small tab strip under the header. Only the active tab's content renders.

- **Staff:** all three tabs available (Program tab only shown if `linkedProgram` is non-null,
  same as Phase 1; Chat tab only shown if `sessionChat` is non-null).
- **Guest:** only the Chat tab is ever available — the panel component simply never receives
  `linkedProgram` or transcript data for a guest render, so those tabs don't exist to switch to,
  not just hidden by CSS (same structural-isolation principle Phase 1 established).
- Each control-bar button (Notes / Program / Chat) opens the panel and switches to its own tab;
  clicking the button for the tab that's already active closes the panel. "Take notes" still starts
  transcription on first click exactly as today, in addition to switching tabs.

**Chat tab** (new): a compact, purpose-built message list + input, not a reuse of the full-page
`MessageThread.tsx` (too wide for a 288px panel, same reasoning Phase 1 used for not reusing
`AssetGrid`/`CategoryTree`). Fetches the conversation's existing messages on mount, subscribes to
`chat_messages` realtime inserts scoped to that `conversation_id`, and posts via the existing
`send_chat_message` RPC. Attachments (if a client or staff member attaches a file directly through
the chat input, independent of program sharing) reuse the existing `chat-attachments` storage
bucket and upload flow team chat already has.

---

## Share-to-chat

Each asset row in the Program tab gets a small share action (only visible to staff, since only
staff have the Program tab at all). Clicking it calls `send_chat_message` with a body describing
the asset and a link:
- Files (`pdf`/`docx`/`xlsx`/`image`/`audio`/`video`): a freshly-generated signed URL.
- `link` type: the asset's `external_url` directly.
- `note` type: the note's text content inlined into the message body (nothing to link to).

This is a plain text message through the same RPC every other chat message uses — no new data
model needed for "shared asset" messages.

---

## Persistence and review

Messages persist permanently, tied to the session via `chat_conversations.session_id` — never
deleted when the call ends. The client's practical ability to post ends when they leave: there's
no route back into a session's chat without a live, unexpired call to join through (their browser
session may still technically be valid, but there's no UI surface that exposes chat once outside
an active call).

Session-type conversations are excluded from the normal Team Chat inbox — wherever that inbox
query lists a user's conversations, it's scoped to `type IN ('channel', 'dm')`. Instead, a new
read-only **"Call chat"** section is added to the session detail page (same collapsible styling as
the existing Call Summary section), rendering the same message history staff would see live during
the call, minus the input box.

---

## Files touched

**New:**
- `supabase/schema-077-session-chat-enum.sql`
- `supabase/schema-078-session-chat.sql`
- `src/lib/session-chat.ts` — `ensureGuestChatUser`, `mintGuestChatToken`, and the shared
  find-or-create-conversation-and-upsert-participant helper used by both the staff and guest paths
- `src/components/video/CallPanel.tsx` — the new unified tabbed panel (replaces the transcript
  panel currently inlined in `CallRoom.tsx` and consumes the existing `ProgramReferencePanel`
  content as one of its tabs)
- `src/components/video/RoomChatTab.tsx` — the chat message list + input
- `src/components/clients/SessionCallChat.tsx` — the read-only "Call chat" section on the session
  detail page

**Modified:**
- `src/app/dashboard/video/[roomId]/page.tsx` — ensure staff chat participancy, pass `sessionChat`
- `src/app/api/video/token/route.ts` — ensure guest chat identity + participancy on the guest path,
  return `chat` in the response
- `src/components/video/GuestJoinClient.tsx` — `verifyOtp` before rendering `CallRoom`
- `src/components/video/CallRoom.tsx` — replace the inlined transcript panel + `ProgramReferencePanel`
  render with `CallPanel`; accept and pass through `sessionChat`
- `src/components/programs/ProgramReferencePanel.tsx` — add the per-asset share-to-chat action
  (only reachable when rendered inside `CallPanel` with a `sessionChat` available)
- `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` — fetch and pass the session's
  chat conversation (if any) to `SessionDetailClient`
- `src/components/clients/SessionDetailClient.tsx` — render `SessionCallChat`
- wherever the Team Chat inbox lists a user's conversations — filter to `type IN ('channel', 'dm')`
