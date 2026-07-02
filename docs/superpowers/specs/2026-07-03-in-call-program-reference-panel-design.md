# In-Call Program Reference Panel — Design Spec

**Date:** 2026-07-03
**Status:** Approved for implementation

---

## What we're building

The first phase of "program/session integration" beyond simple linking (Phase 4). During a video
call linked to a session that has a linked program, staff can open a narrow panel sliding in from
the side of the call — browsing that program's files, notes, and links — without leaving the call
or opening a second tab. To actually show the client what's on screen, staff uses Daily.co's
built-in screen share (no new code needed for that part).

This is deliberately scoped to **staff-only, in-call reference viewing**. It does not give the
client/guest any access to program content, and it does not add any way to deliver specific files
to a client — those are a separate, larger, future phase (client-facing delivery), explicitly
deferred.

## Out of scope

- Any visibility of program content in the guest/client call window (`/join/[guestToken]`) — the
  guest route never fetches or receives this data, by construction, not just by a UI toggle.
- Delivering/sharing specific files or links directly to a client (email, in-call transfer, etc.)
  — a separate future phase.
- Screen share itself — Daily.co's default call UI already provides this; no work needed here.
- Editing program content from the panel — pure read-only browsing, same as the existing Phase 4
  `LinkedProgramDrawer`.
- Ad-hoc video calls with no linked session, or sessions with no linked program — the panel/button
  simply doesn't render; no empty-state UI to design.

---

## Data flow

`src/app/dashboard/video/[roomId]/page.tsx` (the internal staff call route — distinct from the
guest join route) is extended:

1. Add `session_id` to its existing `scheduled_calls` select.
2. If `session_id` is set, look up that session's `program_id`.
3. If `program_id` is set, fetch the program + its categories + its assets using the exact same
   service-client + signed-URL pattern Phase 4 already established
   (`src/lib/program-storage.ts`'s `createProgramAssetSignedUrl()`), mirroring
   `src/app/dashboard/programs/[id]/page.tsx` and the Phase 4 session-detail fetch.
4. Bundle as `linkedProgram: { program, categories, assets } | null`, passed into `CallRoom` as a
   new optional prop.

If any step along the chain is absent (no session, no linked program, access check fails), the
prop is `null` and nothing new renders — this exactly matches how the Phase 4 drawer already
handles a missing/inaccessible linked program.

**Guest isolation is structural, not cosmetic.** `src/app/join/[guestToken]/page.tsx` (feeding
`GuestJoinClient` → `CallRoom`) is a completely separate route from the internal call page and
never runs this fetch. `CallRoom` treats `linkedProgram` as an optional prop that's simply absent
for guests — there is no server-side data available to leak even if client-side code were
inspected.

---

## UI

### Control bar button

A new button in `CallRoom`'s existing control bar (alongside Notes / Leave call / End for
everyone), rendered **only when `linkedProgram` is non-null**. Matches the existing button styling
(icon + label, e.g. a book/folder icon + "Program"). Clicking toggles the panel open/closed, same
interaction as the existing Notes button toggling the transcript panel.

### `ProgramReferencePanel.tsx` (new component)

A narrow panel sliding in from the side, reusing the exact slide-in mechanics already implemented
inline in `CallRoom.tsx` for the transcript panel (`translate-x-full` ↔ `translate-x-0`, ~288px /
`w-72` wide, `absolute inset-y-0`, dark overlay-friendly styling). Pulled into its own component
(rather than inlined into `CallRoom.tsx` like the transcript panel was) because `CallRoom.tsx`
already owns call mechanics and transcription — it shouldn't also own program-browsing UI.

- **Header:** program colour swatch + name, close button.
- **Category filter:** if the program has categories, a compact dropdown at the top narrows the
  asset list to one category ("All" selected by default). If the program has no categories, the
  selector is skipped entirely — just the flat list.
- **Asset list:** a single scrollable column, one condensed row per asset — icon (reusing
  `AssetCard`'s existing `TYPE_ICON`/`TYPE_COLOUR` maps for visual consistency), name, and type
  label. No grid layout (the panel isn't wide enough for `AssetGrid`'s card layout).
- **Click behaviour:**
  - Files and links (`pdf`, `docx`, `xlsx`, `image`, `audio`, `video`, `link`): open the asset's
    signed URL in a new browser tab — identical to how assets already open from the full asset
    grid today.
  - Notes (`note`): have no file/URL to open. Clicking expands the note's `note_content` text
    inline within its row, matching how notes already render expanded inline in `AssetCard` in the
    full program explorer.
- **Props:** `{ linkedProgram: LinkedProgramBundle | null; open: boolean; onClose: () => void }`
  — purely presentational, all data provided by the parent.

### Permissions

No new permission logic. The button and panel only exist on the internal staff call route, which
already requires org membership to reach (`CallRoomPage` redirects unauthenticated/non-member
users today). Viewing the linked program follows the same access rules Phase 4 already
established — if the viewer couldn't see the session's linked program on the session detail page,
the same access check means `linkedProgram` comes back `null` here too.

---

## Files touched

**New:**
- `src/components/video/ProgramReferencePanel.tsx`

**Modified:**
- `src/app/dashboard/video/[roomId]/page.tsx` — fetch `session_id` → `program_id` → program bundle
- `src/components/video/CallRoom.tsx` — new optional prop, control-bar button, renders the panel
