# Video Call Whiteboard

## Origin

User wants a freeform collaborative whiteboard directly inside a video session,
similar to Scribbleboard — a blank shared canvas to draw on live, distinct
from the existing Worksheet Annotation feature (which annotates a specific
tutor-uploaded PDF/image for a specific student's attempt, and persists
indefinitely per `(topic_asset_id, student_id)`). Scoped during brainstorming
to tutoring only, alongside Worksheet Annotation — not a general-purpose tool
available in every video call across the app.

## Confirmed requirements

- **Tutoring only**, gated the same way Worksheet Annotation is — available
  from a tutoring session's video call, not from calls in other workspace
  profiles.
- **Persists, scoped to the session** — one whiteboard per `sessions` row.
  Reopening the same session's call later shows what was drawn; a different
  session (even for the same student) starts with a fresh blank canvas. No
  student disambiguation needed (unlike worksheets), since there's only ever
  one whiteboard per session regardless of who's on the call.
- **Toolset**: Pen (6 colours — black `#0f172a`, red `#ef4444`, blue `#3b82f6`,
  green `#10b981`, orange `#f59e0b`, purple `#8b5cf6`; 3 thickness presets —
  thin `2px`, medium `4px`, thick `7px`), Eraser (true drag-to-erase, ink
  only), Text box, Stickers (builtin set + custom upload) — text/sticker
  behaviour carried over from Worksheet Annotation as-is.
- **Visible but gated on the free plan** — the "Whiteboard" button always
  shows on a tutoring call (so free-plan users know the feature exists), but
  opening it as a free-plan account shows an upgrade prompt instead of the
  actual canvas. Unlike Worksheet Annotation (which has no plan gate today),
  this is a new paid feature.
- Works during a live call; nothing async-only is required (unlike
  worksheets, which explicitly support marking outside a live call) — but
  since content persists on the same table/broadcast pattern, reopening a
  past session's call and seeing the board again is a natural side effect,
  not a separately-built async mode.

## Reuse of the existing Worksheet Annotation architecture

Confirmed via reading `src/components/worksheets/WorksheetAnnotator.tsx`,
`src/lib/worksheets/annotations.ts`, `supabase/schema-092-worksheet-annotations.sql`,
and `src/components/video/CallRoom.tsx`/`WorksheetTab.tsx`:

- **Directly reusable, unchanged**: the discrete-object data model (text_box /
  stroke / sticker as independent rows, not a CRDT), the Supabase Realtime
  **Broadcast**-for-live / **table**-for-persistence split, `perfect-freehand`
  for stroke rendering, `BUILTIN_STICKERS`/`findBuiltinSticker`
  (`src/lib/worksheets/stickers.ts` — already generic, no worksheet-specific
  coupling), the `WorksheetFullScreen` overlay wrapper, and the drag-to-move/
  resize pattern for text boxes.
- **Reused with a small generalization**: `StickerPalette.tsx` currently
  hardcodes the `worksheet-stickers` bucket and builds its upload path from
  `topicAssetId`/`studentId` props. Generalizing it to take a `bucket` and a
  `buildUploadPath(file)` callback instead lets both features share the one
  component — a pure refactor of its one existing call site in
  `WorksheetAnnotator.tsx`, no behaviour change for worksheets.
- **Not reused — new component**: `WorksheetAnnotator.tsx` itself is tightly
  coupled to PDF/image background rendering and page pagination, neither of
  which a blank whiteboard has. Rather than force a shared abstraction
  between two components with meaningfully different concerns, this builds a
  new sibling component (`WhiteboardCanvas.tsx`) that follows the same
  architecture pattern but with its own simpler concerns: no `react-pdf`
  dependency at all (no document to render), a fixed-size blank canvas
  instead of a page, and the new colour/thickness/eraser controls.
- **Not reused — new scoping key**: worksheets are keyed by
  `(topic_asset_id, student_id)`; the whiteboard is keyed by `session_id`.
  `sessions` already carries `org_id`/`created_by`/`client_id` directly, so
  its access-control function is simpler than the worksheet's (no
  topics→subjects hop needed).

## Data model

New table `whiteboard_objects`:

- `id` uuid pk
- `session_id` uuid references `sessions` — the sole scoping key
- `object_type` enum `whiteboard_object_type`: `'text_box' | 'stroke' | 'sticker'`
  (a new, independent enum — not shared with `worksheet_object_type`, so the
  two features' object sets can diverge later without coupling their
  migrations)
- `x`, `y`, `width`, `height` numeric(6,5) — fractions of the canvas (0–1),
  same resolution-independent convention as worksheets
- `content` jsonb — shape depends on `object_type`:
  - `text_box`: `{ text: string }`
  - `stroke`: `{ points: [number, number][], color: string, strokeWidth: number }`
    — `color` is now one of the 6 palette hexes (not hardcoded), `strokeWidth`
    is one of the 3 thickness presets (2 / 4 / 7)
  - `sticker`: `{ kind: 'sticker_builtin', id: string }` or
    `{ kind: 'sticker_custom', storagePath: string }` — same shape as
    worksheets' sticker content
- `created_by` uuid references `profiles`
- `created_at`, `updated_at` timestamptz

Objects render in `created_at` ascending order, same as worksheets.

Fixed canvas size (`900 × 600`, plain white background) — no pages, no
pan/zoom, matching the "no infinite canvas" non-goal.

## Real-time sync

One Broadcast channel per session, `whiteboard:{sessionId}`:

- Same load-on-open (read `whiteboard_objects` for the session) + join
  Broadcast for live updates pattern as worksheets.
- Pen, text, sticker: identical to worksheets — broadcast + debounced/on-
  completion persistence.
- **Eraser** (the one genuinely new sync behaviour): while dragging, the
  eraser's current position is tested each pointer-move tick against every
  visible stroke's points (converted to absolute canvas coordinates using
  that stroke's own `x/y/width/height`, same conversion the renderer already
  does). Any point within the eraser's fixed brush radius is stripped from
  local render state immediately — visible, real-time feedback, but nothing
  is written to the database or broadcast yet.
  - On release (pointer up), for every stroke touched during that drag, the
    surviving points are split into contiguous runs (walking the original
    point order): zero runs → the original row is deleted; one run → the
    original row is updated in place (shortened) with newly-renormalized
    local coordinates; two runs → the original row is deleted and two new
    rows are inserted (each renormalized the same way a freshly-drawn stroke
    already is, in `handlePointerUp`'s existing min/max-based normalization).
    A run with fewer than 2 points is dropped (not worth rendering as a
    stroke).
  - Each resulting delete/update/insert is broadcast individually using the
    existing `delete`/`upsert` broadcast events already defined for
    worksheets — no new broadcast event type, just applying the existing two
    events multiple times in sequence at the end of the erase gesture.
  - Only strokes are erasable this way. Text boxes and stickers keep the
    existing select-and-× delete method, unaffected by the eraser tool.

## Access control

New SECURITY DEFINER function `can_edit_whiteboard(p_session_id uuid)`:

- Returns true for any org member of the session's `org_id` (or the session's
  `created_by` for a solo Pro tutor with no org — mirrors the exact org/solo
  branch shape used throughout this codebase, e.g. `can_edit_worksheet`).
- Returns true for the guest identity tied to the session's client
  (`sessions.client_id → clients.guest_chat_user_id = auth.uid()`) — lets a
  student join via their family's guest login and draw during a live call.

`whiteboard_objects` RLS: SELECT and INSERT/UPDATE/DELETE all gated through
`can_edit_whiteboard(session_id)`.

## Plan gating

Free plan cannot use the whiteboard; Pro and Team can. The gate is resolved
from the **session owner's** plan, not the current viewer's — a guest
student has no subscription of their own, so `isPaidPlan(subscription)`
must be checked against the tutor/org side regardless of who's actually
looking at the button. Reuses `getSubscription`/`isPaidPlan` from
`src/lib/subscription.ts` exactly as-is (`getSubscription` already resolves
an org member's plan from the org owner when called with their id).

- `src/app/dashboard/video/[roomId]/page.tsx` (and the guest join page)
  additionally fetch `sessions.created_by` for the linked session, then
  `const whiteboardAllowed = call.session_id ? isPaidPlan(await getSubscription(sessionCreatedBy)) : false`,
  passed into `CallRoom` as a new `whiteboardAllowed: boolean` prop.
- The "Whiteboard" button always renders when `canUseWhiteboard` (session
  exists), regardless of `whiteboardAllowed` — visibility is unconditional,
  per the "visible but gated" requirement.
- Clicking it always opens the `WorksheetFullScreen` overlay; inside, if
  `!whiteboardAllowed` it renders an upgrade prompt instead of
  `WhiteboardCanvas`:
  - **Tutor/org member view**: "Whiteboard is a Pro feature" + a link to
    `/dashboard/billing`, matching the exact upsell pattern already used for
    "Invite a team member" on the Settings page (an in-app link, not
    starting a checkout directly).
  - **Guest view**: a simpler message with no upgrade link (a guest can't
    act on it) — "Whiteboard isn't available for this session."
- This does **not** touch `can_edit_whiteboard()` or the RLS policies —
  plan gating is enforced at the UI layer only, same documented limitation
  already accepted elsewhere in this codebase (e.g. the account-deactivation
  page-level gate). A determined free-plan user could still reach the table
  via the raw API; not defended against here, consistent with existing
  precedent rather than introducing a new, stronger guarantee for this one
  feature.

New private storage bucket `whiteboard-stickers` for custom sticker uploads,
path convention `{sessionId}/{filename}` — same path-based RLS pattern as
`worksheet-stickers`, resolved via the same `can_edit_whiteboard` function
using the first path segment as `session_id`.

## UI integration

- New "Whiteboard" button in the call controls bar
  (`src/components/video/CallRoom.tsx`), positioned next to the existing
  "Worksheet" button.
- Gated by `canUseWhiteboard = !!callId && !!currentUserId && !!sessionId` —
  requires a new `sessionId` prop threaded into `CallRoom` (currently only
  the *derived* `sessionStudentId` is passed down; the raw `session_id` isn't
  needed by anything else today, so this is a new prop, sourced from
  `scheduled_calls.session_id` in `src/app/dashboard/video/[roomId]/page.tsx`
  and the guest join page).
- Opens in the same `WorksheetFullScreen` overlay component, reused as-is —
  the video call keeps running behind it.
- No student-selection step (unlike Worksheet's "which student's attempt" —
  the whiteboard opens directly, since it's session-scoped, not student-
  scoped).
- The button itself doesn't reflect `whiteboardAllowed` (no lock icon, no
  disabled state) — it always looks like a normal button. The gating shows
  up only once opened, per "Plan gating" above.

## New dependencies

None. `perfect-freehand` is already installed (used by worksheets); the
whiteboard doesn't need `react-pdf` at all, since there's no document to
render.

## Non-goals (explicit)

- No live cursor/presence indicators.
- No shapes (rectangle/circle/line tools) — freehand pen, text, and stickers
  only.
- No infinite pan/zoom canvas — one fixed-size board per session.
- No multiple boards per session.
- No undo/redo beyond what erasing/deleting already provides.
- No adjustable eraser brush size in this version.
- Not available outside tutoring sessions (see Origin).

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test
  runner).
- Manual smoke, live: two browser sessions (tutor + a guest/second account)
  open the same session's call, open the Whiteboard from both sides, confirm
  a pen stroke in one colour/thickness appears live in the other, confirm a
  text box and both a builtin and custom sticker appear live in the other.
- Manual smoke, erase: draw one continuous stroke, drag the eraser through
  its middle, confirm it visually splits into two separate strokes on both
  screens (not just deleted or a single shortened stroke); drag the eraser
  across an entire stroke and confirm it's fully removed; confirm text boxes
  and stickers are unaffected by the eraser and still require the existing
  select-and-× action to remove.
- Manual smoke, persistence: leave the call, reopen the same session's call
  later, confirm the board is exactly as left; open a *different* session for
  the same student and confirm it starts blank.
- Confirm a guest identity with zero `organisation_members` rows can draw,
  matching the existing worksheet guest-access precedent.
- Confirm `StickerPalette.tsx`'s generalization doesn't regress Worksheet
  Annotation's own custom sticker upload (still uploads to `worksheet-stickers`
  at the same `{topicAssetId}/{studentId}/{filename}` path as before).
- Manual smoke, plan gating: as a free-plan tutor, confirm the Whiteboard
  button is still visible and clickable, but opens the upgrade prompt (with
  a working Billing link) instead of a canvas; as a guest on that same
  free-plan tutor's call, confirm the simpler no-link message instead;
  upgrade the account to Pro (or test against an existing Pro/Team account)
  and confirm the same button now opens the real canvas.
