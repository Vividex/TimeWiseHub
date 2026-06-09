# Client Sessions & Progress Notes — Design Spec

> **Phase 14**

**Goal:** A session booking and tracking layer under each client — schedule sessions, work through a checklist live, log timestamped progress notes, and control everything via the AI assistant.

**Architecture:** Four new tables (`sessions`, `session_todos`, `client_session_templates`, `progress_notes`) with RLS mirroring the existing client pattern. Sessions appear on the calendar as a new `session` type. The client detail page is reorganised around sessions and progress, with financials moved to a secondary position.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS), existing calendar integration pattern, Anthropic tool use via the AI assistant.

---

## 1. Data Model

### `sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `org_id` | uuid FK → organisations | |
| `created_by` | uuid FK → profiles | |
| `title` | text | |
| `scheduled_at` | timestamptz | Appears on calendar; no due_date field |
| `duration_minutes` | integer | Default 60 |
| `notes` | text | Free-text; auto-saved |
| `status` | enum | `scheduled` / `in_progress` / `completed` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Updated by trigger |

### `session_todos`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | |
| `title` | text | |
| `completed` | boolean | Default false |
| `position` | integer | For ordering |
| `created_at` | timestamptz | |

### `client_session_templates`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `title` | text | |
| `position` | integer | For ordering |
| `created_at` | timestamptz | |

### `progress_notes`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `org_id` | uuid FK → organisations | |
| `created_by` | uuid FK → profiles | |
| `body` | text | |
| `created_at` | timestamptz | Append-only; never edited |

### RLS
All four tables follow the existing client pattern: org members can view; org admins, managers, and owners can create and edit. `progress_notes` has no update or delete policy — append-only.

### Calendar Integration
Sessions appear on the calendar as type `'session'` alongside the existing `event`, `project`, `task`, and `leave` types. Displayed using `scheduled_at` as the event time. Clicking a session calendar item navigates to `/dashboard/clients/[id]/sessions/[sessionId]`.

---

## 2. Client Detail Page Redesign

**Route:** `/dashboard/clients/[id]`

### Summary Tiles (top row, 4 tiles)
- Upcoming Sessions — count of sessions with status `scheduled` or `in_progress`
- Total Sessions — all-time count
- Last Session — date of most recent completed session
- Progress Notes — total count

### Two-Column Layout (below tiles)

**Left column (wider) — Sessions**
- "New Session" button at the top
- Upcoming sessions first (sorted by `scheduled_at` asc, status not completed)
- Divider — past sessions below (status completed, sorted desc)
- Each session card shows: title, date/time, duration, status badge, checklist progress (e.g. "3/5 done")
- Clicking a card navigates to the session detail page

**Right column (narrower) — Progress Notes**
- "+ Add note" button at the top
- Chronological feed, newest first
- Each entry: author name, timestamp (date + time), body text
- Notes are read-only once saved

### Financial Data
Invoices, payments, and outstanding balance move to a collapsible section at the bottom of the page — still accessible but no longer the hero.

---

## 3. Session Detail Page

**Route:** `/dashboard/clients/[id]/sessions/[sessionId]`

### Header
- Session title — editable inline
- Date/time and duration — editable
- Status badge — clickable to advance: Scheduled → In Progress → Completed
- Back link to client detail page

### Two-Column Layout

**Left — To-do list**
- Checkboxes for each item; check/uncheck updates `session_todos.completed`
- Items can be reordered (drag or up/down), edited inline, or deleted
- "Add item" input at the bottom
- When all items are checked, a prompt appears to mark the session as Completed
- "Save as template" button — overwrites `client_session_templates` for this client with the current list
- "Load template" option when creating a new session — pre-fills checklist from `client_session_templates`

**Right — Session notes**
- Free-text area
- Auto-saves with a short debounce (no explicit save button)

---

## 4. New Session Flow

1. User clicks "New Session" on the client detail page
2. Modal opens: title, date/time picker, duration
3. If `client_session_templates` exist for this client, checklist is pre-populated; otherwise blank
4. On confirm: `sessions` row created, `session_todos` rows inserted from template (copying title + position)
5. User is navigated to the new session detail page

---

## 5. AI Assistant Integration

### New Read Tools
- `get_sessions(client_id, filter?)` — returns sessions for a client; filter: `upcoming` / `past` / `all`
- `get_progress_notes(client_id)` — returns timestamped progress notes for a client

### New Write Tools (all require user confirmation)
- `create_session` — fields: client_id, title, scheduled_at, duration_minutes; pre-populates todos from template if one exists
- `update_session` — fields: session_id + any of title, scheduled_at, duration_minutes, status
- `add_session_todo` — fields: session_id, title; appended to end of list
- `check_session_todo` — fields: todo_id, completed (boolean)
- `add_progress_note` — fields: client_id, body; timestamp set server-side

### Example Conversations
- *"Book Jess in for a session next Tuesday at 10am"* → `create_session`, loads her template, shows confirmation card
- *"Mark cardio as done in Jess's session today"* → `check_session_todo`
- *"Add a progress note for Jess — she hit her step goal three days in a row"* → `add_progress_note`
- *"What sessions does Jess have coming up?"* → `get_sessions` with filter `upcoming`

---

## 6. Out of Scope
- Client-facing login or portal (team-only access)
- Session recurrence / repeating bookings
- Session attachments or file uploads
- Billing or invoicing tied to sessions
- Public booking links
