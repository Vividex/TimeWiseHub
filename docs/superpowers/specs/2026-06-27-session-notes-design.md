# Session Notes — Design Spec
_Date: 2026-06-27_

## Overview

Add Granola-style AI note-taking to TimeWiseHub video calls. Any participant can start
transcription during a call; transcript chunks are flushed to the server every 30 seconds
for durability; when the call ends a Claude-generated summary is written to the DB. Notes
are surfaced post-call from a redesigned Video page that combines the existing calendar
grid with a new chronological list view and an expanded call detail modal.

---

## 1. Data Layer

### Migration: `schema-070-session-notes.sql`

```sql
ALTER TABLE scheduled_calls
  ADD COLUMN project_id             UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN transcript             TEXT,
  ADD COLUMN summary                TEXT,
  ADD COLUMN transcript_started_by  UUID REFERENCES auth.users(id);
```

### Instant-call `starts_at` fix

`POST /api/video/rooms` currently inserts instant calls with `starts_at = NULL`, making
them unsortable. Change the insert to set:

```ts
starts_at: new Date().toISOString(),
ends_at:   new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
```

### RLS

- `project_id`, `transcript`, `summary`, `transcript_started_by` live on `scheduled_calls`,
  which already has RLS scoped through `organisation_members`. No new policies needed.

---

## 2. New API Routes

### `POST /api/video/notes/[callId]/transcript`

Appends a chunk of transcript text. Called by the client every 30 seconds while
transcription is active, and once on call end.

- Auth: Supabase session required; caller must be an `organisation_members` member of the
  call's `org_id`.
- Body: `{ chunk: string }`
- Action: `UPDATE scheduled_calls SET transcript = COALESCE(transcript, '') || chunk WHERE id = callId`
- Response: `{ ok: true }`

### `POST /api/video/notes/[callId]/summarise`

Generates and stores the AI summary. Called once by the client immediately after the
final transcript flush on call end.

- Auth: same as above.
- Guard: reads `transcript` — if null or fewer than 100 characters, writes
  `summary = 'Transcript too brief to summarise.'` and returns without calling Claude.
- AI: calls `claude-haiku-4-5-20251001` with the prompt below.
- Action: writes result to `summary`.
- Response: `{ ok: true }`

**Claude prompt:**

```
You are summarising a workplace video call transcript. Produce a structured summary
in this exact format — no extra sections, no preamble:

## Summary
<one paragraph overview>

## Key Decisions
- <decision>

## Action Items
- [Person] — <task>

## Next Steps
- <next step>

If information for a section is absent from the transcript, omit that section entirely.
Transcript:
<transcript text>
```

### `GET /api/video/notes/[callId]`

Returns `{ transcript: string | null, summary: string | null }` for a call. Used by the
call detail modal to poll for summary completion. Auth: org member of the call's org.

### Extended: `PATCH /api/video/schedule/[callId]`

Already handles adding invitees. Extended to also accept `{ project_id: string | null }`.
Updates `scheduled_calls.project_id` for org members (not manager-gated — any participant
can link a call to a project).

---

## 3. In-call UX (`CallRoom.tsx`)

### Controls bar additions

The existing controls bar (Leave / End for everyone) gets a **Notes button** (notebook
icon, `NotebookPen` from lucide-react).

| State | Button appearance | Banner |
|-------|------------------|--------|
| `idle` | outline, grey | none |
| `active` | filled violet, red dot | "Note-taking is active" — top of video frame |
| `stopped` | outline, grey | none |

The banner is always visible when `active` so all participants are aware transcription is
running (Daily.co fires `transcription-started` to all room participants automatically).

### Transcript panel

A collapsible side panel (right-side drawer on desktop, bottom sheet on mobile).
Toggled by the Notes button — toggling visibility does **not** stop transcription.
When hidden with transcription active, a small red dot remains on the Notes button.

Contents: a scrolling list of transcript lines, each showing speaker name, timestamp, and
text. Auto-scrolls to bottom on new chunks. Read-only during the call.

### Flush loop

```
transcription-message event received
  → accumulate in chunkBuffer ref

every 30 seconds (setInterval):
  if chunkBuffer has content:
    POST /api/video/notes/[callId]/transcript  { chunk: buffer }
    clear buffer

on left-meeting / End for everyone:
  1. final flush of any remaining buffer
  2. POST /api/video/notes/[callId]/summarise
  3. frame.leave() / DELETE room
```

### Room creation change

Set `enable_transcription: true` in the Daily.co room `properties` at creation time
(both instant and scheduled rooms). This allows any participant to call
`frame.startTranscription()`, not just `is_owner` token holders.

---

## 4. Video Page — Calendar + List View

### Server-side (`app/dashboard/video/page.tsx`)

- Remove the 60-day `until` filter — fetch **all** `scheduled_calls` for the org, ordered
  `starts_at ASC NULLS LAST`.
- Also fetch org projects: `SELECT id, name, colour FROM projects WHERE org_id = $1 ORDER BY name`.
- Pass both to `VideoCalendar`.

### `VideoCalendar.tsx` — layout

```
[ existing calendar grid — week / month toggle ]
─────────────────────────────────────────────────
[ All calls list ]
  UPCOMING  (future, ascending)
  TODAY     (highlighted)
  ─ divider ─
  PAST      (descending — most recent first)
```

### List row contents

- Title (bold) + dim "Instant call" label if `starts_at` was null before our fix
- Date + time range, or **LIVE** badge if currently in progress
- Participant count (shown from `call_invitees` count, preloaded with the page query)
- Project badge — coloured dot + project name (if `project_id` set)
- "Session Notes" pill (violet) — only shown if `summary IS NOT NULL`

### Expanded call detail modal

Adds two new sections below the existing time + participants content:

**Project**
Dropdown listing all org projects. Pre-selected if linked. Saving fires
`PATCH /api/video/schedule/[callId]` with `{ project_id }`. Visible to all org members.

**Session Notes** (only rendered if `transcript IS NOT NULL OR summary IS NOT NULL`)

- Two tabs: **Key Notes** | **Full Transcript**
- Key Notes tab: renders `summary` as markdown. If `transcript` exists but `summary` is
  null, shows a spinner: *"Generating summary…"* (client polls `GET /api/video/notes/[callId]`
  every 3 seconds until `summary` is populated).
- Full Transcript tab: `transcript` rendered as raw text in a monospace scrollable box.
- Download button on each tab — both exported as `.txt`.
- If neither `transcript` nor `summary` exists: quiet grey line —
  *"Notes were not recorded for this call."*

### `ScheduleCallDialog.tsx`

Add an optional **Project** dropdown above the invitees section. Lists org projects
passed as a prop. Submits `project_id` (or omits the field if none selected) in the
existing `POST /api/video/schedule` body.

---

## 5. Component & File Map

| File | Change |
|------|--------|
| `supabase/schema-070-session-notes.sql` | New migration |
| `src/app/api/video/rooms/route.ts` | Set `starts_at`/`ends_at` on instant calls; add `enable_transcription: true` to room props |
| `src/app/api/video/notes/[callId]/transcript/route.ts` | New — append chunk |
| `src/app/api/video/notes/[callId]/summarise/route.ts` | New — Claude summary |
| `src/app/api/video/notes/[callId]/route.ts` | New — GET transcript + summary |
| `src/app/dashboard/video/[roomId]/page.tsx` | Pass `callId` prop to `CallRoom` |
| `src/app/api/video/schedule/[callId]/route.ts` | Extend PATCH to accept `project_id` |
| `src/components/video/CallRoom.tsx` | Add `callId` prop; Notes button, panel, flush loop, recording banner |
| `src/components/video/VideoCalendar.tsx` | List view, expanded modal (project + notes) |
| `src/components/video/ScheduleCallDialog.tsx` | Project picker |
| `src/app/dashboard/video/page.tsx` | Fetch all calls + projects; pass to calendar |

---

## 6. Out of Scope

- External calendar sync (Google / Outlook) — future phase
- Per-user transcript preferences / opt-out — future phase
- Real-time shared transcript visible to other participants in the panel — future phase
- Editing or annotating the transcript — future phase
