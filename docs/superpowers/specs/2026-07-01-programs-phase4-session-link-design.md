# Programs Phase 4 — Link a Program to a Session

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## What we're building

Programs (Phase 1) are reusable knowledge containers — files, notes, links organised into
categories. Sessions (Phase 14) are per-client bookings with a checklist and free-text notes.
Right now these two features don't connect at all. Phase 4 closes that gap: let a user attach
one Program to a Session, then browse that Program's content from a read-only reference drawer
while running the session — no more digging through files mid-call.

**Scope:** one nullable FK, a link/unlink control on the existing session detail page, and a
read-only slide-over drawer that reuses the Phase 1 explorer components as-is.

## Out of scope

- Multiple programs per session (one link, swappable)
- Linking at session-creation time (link/unlink lives on the session detail page only)
- Any write access to the linked program's content from the session view (pure reference)
- AI summarisation, template builder — these remain their own future phases, unrelated to this one

---

## Data model

One migration, `supabase/schema-073-session-program-link.sql`:

```sql
alter table public.sessions
  add column program_id uuid references public.programs(id) on delete set null;
```

No RLS changes. The existing `sessions` policies ("org members can view", "org admins can
manage") already cover this new column — viewing/updating a session's `program_id` follows the
same rules as viewing/updating its title or status. If the linked program is later archived or
deleted, `on delete set null` clears the link quietly rather than leaving a dangling reference.

---

## Permissions and picker scope

- **Link / unlink / change**: gated the same as every other session edit — org owner, admin, or
  manager. Regular org members can view the session and open the drawer if a program is linked,
  but cannot change the link.
- **Picker contents**: only programs where `program.org_id = session.org_id` — i.e. org-scoped
  programs, not the linker's personal/solo programs. This guarantees every org member who can see
  the session can also see whatever's linked to it (a personal program wouldn't be visible to
  other org members, which would make the drawer fail to load for them).

---

## Fetching and rendering

The session detail server page (`src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`)
already does an RLS-scoped fetch of the session. It's extended to:

1. Read `program_id` off the session row.
2. If set, fetch the program + its categories + its assets using the same service-client +
   ownership/membership check pattern as `src/app/dashboard/programs/[id]/page.tsx`, generating
   signed URLs via the existing `createProgramAssetSignedUrl()` helper (Phase 1,
   `src/lib/program-storage.ts`) — same "signed URLs at page load" convention already established.
3. Pass the bundle down as a `linkedProgram: { program, categories, assets } | null` prop to
   `SessionDetailClient`. If the access check fails (edge case: program deleted org membership
   changed, etc.), `linkedProgram` is `null` and the UI treats it as "not currently available."

No new API route is needed for viewing — this mirrors exactly how the Phase 1 explorer page
works today.

---

## UI changes

### `SessionDetailClient` (existing component, extended)

A small control sits near the existing status badge:

- **No program linked**: a "Link program" button. Clicking opens a lightweight dropdown/modal
  that fetches `GET /api/programs` (client-side, unmodified — it already returns the caller's
  org-scoped and personal programs together) and filters the result to `org_id === session.org_id`
  before rendering the list by name + colour swatch. Picking one calls
  `supabase.from('sessions').update({ program_id })` — the same direct-Supabase-client mutation
  pattern already used for title/status/notes edits in this component — then `router.refresh()`.
- **Program linked**: shows the program's colour swatch + name, a "View" button that opens the
  drawer, and (admins/managers/owner only) a "Change" and "Unlink" action. Unlink sets
  `program_id` to `null` the same way.

### `LinkedProgramDrawer.tsx` (new component)

A right-anchored slide-over panel (fixed overlay, consistent styling with existing modals like
`ProgramForm`/`AssetUploadZone`):

- Header: program colour + name, close button.
- Body: `CategoryTree` (left rail) + `AssetGrid` (main area) — **the exact Phase 1 components,
  unmodified**, rendered with `canManage={false}`. Both components already hide every
  add/rename/upload/delete affordance when `canManage` is false, so this drawer is a pure
  read-only browsing view with zero changes to Phase 1 code.
- Manages its own `selectedCategoryId` state locally (same pattern as `ProgramExplorer`, minus
  the local-mutation callbacks since nothing here is editable).
- Data comes entirely from the `linkedProgram` prop passed down from the server page — no
  client-side fetching, no loading state needed.

---

## Files touched

**New:**
- `supabase/schema-073-session-program-link.sql`
- `src/components/programs/LinkedProgramDrawer.tsx`

**Modified:**
- `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` — fetch + pass `linkedProgram`
- `src/components/clients/SessionDetailClient.tsx` — link/unlink/change control + drawer trigger
