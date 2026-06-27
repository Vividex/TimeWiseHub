# Phase 26 — Session Notes (Granola-style AI note-taking for video calls)

## Goal
Add in-call transcription via Daily.co, post-call AI summaries via Claude, and a
redesigned Video page with a chronological list view and expanded call detail modal.
All calls (instant + scheduled) get logged with timestamps, project links, and session
notes accessible post-meeting.

## Source spec
`docs/superpowers/specs/2026-06-27-session-notes-design.md`

## Key decisions
- Daily.co built-in transcription (`frame.startTranscription()`); `enable_transcription: true` on all room creation
- 30-second client flush loop → `POST /api/video/notes/[callId]/transcript`
- Claude `claude-haiku-4-5-20251001` for summaries (`@anthropic-ai/sdk` already installed)
- Shared storage: one transcript + summary per `scheduled_calls` row
- Any org member can trigger note-taking (not just host)
- Instant calls get `starts_at = NOW()` at creation so they sort correctly in the list
- Project association: settable at schedule time OR editable from the call detail modal by any org member

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- The Supabase `as unknown as` cast pattern is required for FK join types (see CLAUDE.md).

## Rules for conductor (Claude)
- Apply DB migration via Supabase MCP `apply_migration` after C-1 (Codex writes the SQL file).
- `pnpm run build` at each commit milestone — must pass before committing.
- `git push` after all tasks (via ship skill).

---

## C-1 — DB migration

*Codex edits:*
- [x] Create `supabase/schema-070-session-notes.sql`:
  ```sql
  ALTER TABLE scheduled_calls
    ADD COLUMN project_id             UUID REFERENCES projects(id) ON DELETE SET NULL,
    ADD COLUMN transcript             TEXT,
    ADD COLUMN summary                TEXT,
    ADD COLUMN transcript_started_by  UUID REFERENCES auth.users(id);
  ```

*Conductor applies migration via Supabase MCP.*

---

## C-2 — Fix instant-call room creation

*Codex edits:*
- [x] `src/app/api/video/rooms/route.ts` — in the `POST` handler: (1) add `enable_transcription: true` to the Daily.co room `properties` object. (2) In the `scheduled_calls` insert, add `starts_at: new Date().toISOString()` and `ends_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()`.

---

## C-3 — Add enable_transcription + project_id to scheduled-call creation

*Codex edits:*
- [x] `src/app/api/video/schedule/route.ts` — (1) Add `enable_transcription: true` to the Daily.co room `properties`. (2) Add `project_id?: string` to `SchedulePayload` type. (3) Include `project_id: project_id ?? null` in the `scheduled_calls` insert alongside existing fields.

---

## C-4 — Extend PATCH schedule/[callId] to accept project_id

*Codex edits:*
- [x] `src/app/api/video/schedule/[callId]/route.ts` — update the `PATCH` handler to handle two distinct body shapes: (a) if body contains `project_id` key → any org member can do it (no role check needed), update `scheduled_calls SET project_id = project_id WHERE id = callId` via service client, return `{ ok: true }`; (b) if body contains `email` key → existing invitee-add logic unchanged. Parse the body once and branch on which key is present.

---

## C-5 — New API: GET /api/video/notes/[callId]

*Codex edits:*
- [x] Create `src/app/api/video/notes/[callId]/route.ts` — GET handler. Auth: Supabase session required. Verify caller is an org member of the call's `org_id` (use service client). Return `{ transcript: string | null, summary: string | null }`. 401 if no session, 404 if call not found or not a member.

---

## C-6 — New API: POST /api/video/notes/[callId]/transcript

*Codex edits:*
- [x] Create `src/app/api/video/notes/[callId]/transcript/route.ts` — POST handler. Body: `{ chunk: string }`. Auth + org-member check. Guard: if chunk is empty, return `{ ok: true }` immediately. Action: `UPDATE scheduled_calls SET transcript = COALESCE(transcript, '') || chunk, transcript_started_by = COALESCE(transcript_started_by, userId) WHERE id = callId` via service client's `.update()`. Return `{ ok: true }`.

---

## C-7 — New API: POST /api/video/notes/[callId]/summarise

*Codex edits:*
- [x] Create `src/app/api/video/notes/[callId]/summarise/route.ts` — POST handler. Auth + org-member check. Read `transcript` from DB. Guard: if null or `transcript.length < 100`, write `summary = 'Transcript too brief to summarise.'` and return `{ ok: true }`. Otherwise: call `claude-haiku-4-5-20251001` via `new Anthropic()` (import from `@anthropic-ai/sdk`; key from `process.env.ANTHROPIC_API_KEY`). Use `messages.create` with the prompt from the spec (produce ## Summary / ## Key Decisions / ## Action Items / ## Next Steps). Write `content[0].text` to `summary`. Return `{ ok: true }`.

---

## C-8 — Pass callId prop to CallRoom

*Codex edits:*
- [x] `src/app/dashboard/video/[roomId]/page.tsx` — add `callId={roomId}` to the `<CallRoom ... />` JSX.

---

## C-9 — CallRoom: Notes button + transcript panel + flush loop + recording banner

*Codex edits:*
- [x] `src/components/video/CallRoom.tsx` — full update. Read the file first.
  - Add `callId: string` to Props type.
  - State: `noteState: 'idle' | 'active' | 'stopped'`, `panelOpen: boolean`.
  - Refs: `chunkBuffer` (string, accumulates transcript text between flushes), `flushInterval` (NodeJS.Timeout | null), `transcriptLines` (array of `{ speaker: string; text: string; ts: string }`).
  - **Notes button** in controls bar: `NotebookPen` icon from lucide-react. Outline/grey when idle or stopped; filled violet bg with a `w-2 h-2 bg-red-500 rounded-full` absolute dot when active. Clicking when idle: call `frameRef.current?.startTranscription()`, set `noteState = 'active'`, `panelOpen = true`, start the flush interval.
  - **Recording banner**: fixed strip `absolute top-0 inset-x-0 z-10 bg-red-600/90 text-white text-xs font-semibold text-center py-1.5` reading "🔴 Note-taking is active — all participants are being transcribed". Shown only when `noteState === 'active'`.
  - **Transcript panel**: right-side drawer `absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform`, translated out when `!panelOpen`. Panel header shows "Live Transcript" + a close button. Body: scrollable list of transcript lines (`speaker: font-semibold text-violet-400`, `text: text-slate-200 text-xs`, `ts: text-slate-500 text-xs`). Auto-scroll to bottom on new lines.
  - **Daily.co event handling**: in the `useEffect`, listen for `transcription-message` events. Each event gives `{ participantId, text, timestamp }` — look up speaker name via `frameRef.current?.participants()?.[participantId]?.user_name ?? 'Unknown'`. Push to transcriptLines; append `\n[speaker]: text` to chunkBuffer.
  - **Flush loop**: `setInterval` every 30 000 ms. If `chunkBuffer` non-empty: POST `{ chunk: chunkBuffer }` to `/api/video/notes/${callId}/transcript`, clear buffer.
  - **On leave/end**: clear interval → flush remaining buffer → POST to `/api/video/notes/${callId}/summarise` → then existing leave/end logic.
  - Panel toggle button (notebook icon + red dot when active) in controls bar opens/closes panel without stopping transcription.

---

## C-10 — ScheduleCallDialog: optional project picker

*Codex edits:*
- [x] `src/components/video/ScheduleCallDialog.tsx` — add `projects: { id: string; name: string; colour: string }[]` to Props (default `[]`). Add `projectId` state (string, default `''`). Add a "Project (optional)" `<select>` field above the invitees section: first option is `<option value="">No project</option>`, then one per project. Include `...(projectId ? { project_id: projectId } : {})` in the `POST /api/video/schedule` body.

---

## C-11 — VideoPage server: fetch all calls + org projects

*Codex edits:*
- [x] `src/app/dashboard/video/page.tsx` — (1) Remove the `until` date filter; fetch ALL `scheduled_calls` for the org ordered `starts_at ASC NULLS LAST`. Add `project_id, summary` to the select field list. (2) Add a second query: `supabase.from('projects').select('id, name, colour').eq('org_id', orgId).order('name')`. (3) Pass `projects` to both `<VideoCalendar>` and `<VideoPageClient>` (so ScheduleCallDialog can receive it). Update the `ScheduledCall` type to include `project_id: string | null` and `summary: string | null`.

---

## C-12 — VideoCalendar: list view (past / today / upcoming sections)

*Codex edits:*
- [x] `src/components/video/VideoCalendar.tsx` — read file first.
  - Add `project_id: string | null` and `summary: string | null` to `ScheduledCall` type.
  - Add `projects: { id: string; name: string; colour: string }[]` to Props (default `[]`).
  - Add a `CallList` inner function below the existing `AgendaView` function. It divides all calls into three groups: `upcoming` (starts_at > now, asc), `today` (sameDay with now, asc), and `past` (starts_at < now and not today, desc). Render groups in order: Today → Upcoming → Past (with a visual divider before Past). Each row is a `<button>` calling `openCall(call)`, showing: title (bold), date+time range (or LIVE badge), a coloured `●` dot + project name if `project_id` is set (find project in `projects` prop), and a `Session Notes` violet pill if `summary !== null`.
  - Below the calendar grid (in both the week view and month view returns, on desktop only; AgendaView already covers mobile), render `<div className="mt-8"><h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">All calls</h3><CallList /></div>`.

---

## C-13 — VideoCalendar: expand CallModal with project picker + Session Notes

*Codex edits:*
- [x] `src/components/video/VideoCalendar.tsx` — update the `CallModal` inner function. Read the current modal structure carefully.
  - Add state: `selectedProjectId` (string, synced to `selectedCall.project_id ?? ''` on open), `notesTab: 'summary' | 'transcript'`, `notesData: { transcript: string | null; summary: string | null } | null`, `notesLoading: boolean`, `savingProject: boolean`.
  - When `selectedCall` is set: if `selectedCall.summary !== null` or the call is in the past, fetch `GET /api/video/notes/${selectedCall.id}` and store in `notesData`.
  - **Project section**: below the participants section, add a row with a folder icon. A `<select>` populated from `projects` prop, value = `selectedProjectId`. On change: set state, POST `PATCH /api/video/schedule/${selectedCall.id}` with `{ project_id: newValue || null }`, set `savingProject` during the call.
  - **Session Notes section**: below the project row. If `notesLoading`: spinner. If `notesData?.summary` or `notesData?.transcript`: two tab buttons ("Key Notes" / "Full Transcript"). Key Notes tab: `<pre className="whitespace-pre-wrap text-sm ...">` with `notesData.summary`. Full Transcript tab: `<pre className="font-mono text-xs ...">` with `notesData.transcript`. Download button on each tab: `new Blob([text], {type:'text/plain'})` → `URL.createObjectURL` → click `<a download="...">`. If `notesData?.transcript` exists but `summary` is null: poll `GET /api/video/notes/${selectedCall.id}` every 3 seconds (useEffect with interval) until summary populates. If neither transcript nor summary: `<p className="text-xs text-slate-400">Notes were not recorded for this call.</p>`.

---

## Conductor commit sequence
```
After C-1         → apply migration (MCP) → git commit "feat: session notes DB migration"
After C-2–C-4     → pnpm run build → commit "feat: instant-call timestamps + enable_transcription + project_id API"
After C-5–C-7     → pnpm run build → commit "feat: session notes API routes (transcript, summarise, GET)"
After C-8–C-9     → pnpm run build → commit "feat: CallRoom notes button, transcript panel, flush loop"
After C-10–C-11   → pnpm run build → commit "feat: project picker in schedule dialog + video page data"
After C-12–C-13   → pnpm run build → commit "feat: video calendar list view + session notes in call modal"
git push (ship skill)
```

## Acceptance checklist
- [x] C-1: schema-070 migration file exists and is applied to remote DB
- [ ] C-2: instant calls insert starts_at/ends_at; Daily rooms have enable_transcription
- [ ] C-3: scheduled room creation includes enable_transcription; project_id accepted
- [ ] C-4: PATCH /api/video/schedule/[callId] handles project_id updates
- [ ] C-5: GET /api/video/notes/[callId] returns transcript + summary
- [ ] C-6: POST transcript endpoint appends chunk to scheduled_calls.transcript
- [ ] C-7: POST summarise endpoint calls Claude and writes summary
- [ ] C-8: CallRoom receives callId prop from page
- [ ] C-9: CallRoom has Notes button, collapsible panel, flush loop, recording banner
- [ ] C-10: ScheduleCallDialog has optional project picker
- [ ] C-11: VideoPage fetches all calls + projects, passes to components
- [ ] C-12: VideoCalendar shows list view with past/today/upcoming + project badge + notes pill
- [ ] C-13: CallModal has project picker + Session Notes tabs with download

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean at each commit milestone.
