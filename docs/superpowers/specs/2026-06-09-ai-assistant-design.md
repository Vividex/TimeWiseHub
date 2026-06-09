# AI Assistant — Design Spec
_2026-06-09_

## Goal

Evolve the existing help-only assistant widget into a capable AI agent that can read all platform data, take actions on the user's behalf (with confirmation), respond to voice input, and speak responses aloud. Both the AI assistant and the team chat get full-page views and floating widgets, stacked bottom-right with mutual exclusion.

---

## Scope

Three implementation groups, each independently shippable:

| Group | Deliverable |
|---|---|
| 1 | Tool use backend + upgraded AI assistant widget + full-page `/dashboard/assistant` |
| 2 | Team chat floating widget |
| 3 | Voice mode (STT + TTS via browser APIs) |

The existing rule-based `NudgeBanner` is left as-is. The existing team chat full page (`/dashboard/chat`) is left as-is. The existing `AssistantWidget` is replaced.

---

## Architecture

### Upgraded assistant API (`/api/assistant`)

The current streaming endpoint becomes tool-use-aware. On each request it:

1. Receives `messages` (conversation history) + `userId` from the authenticated session.
2. Calls `anthropic.messages.stream()` with a defined toolset and an enriched system prompt.
3. Streams text delta events to the client as plain text chunks (unchanged from today).
4. When a `tool_use` block appears in the stream:
   - **Read tool** → executes the corresponding Supabase query server-side, appends a `tool_result` block, re-enters the stream loop so Claude can incorporate the result.
   - **Write tool** → does NOT execute. Serialises the tool name + input as a JSON sentinel line `\n__ACTION__:<json>\n` in the stream. The client detects this and renders a confirmation card.
5. The stream closes normally after Claude's final text response.

### Write action confirmation (`/api/assistant/execute`)

A separate `POST` endpoint. Receives `{ tool, input, userId }`. Validates the user has permission, executes the Supabase write, returns `{ ok: true, result }`. Called by the client when the user taps Confirm on an action card.

### Tool implementation (`src/lib/assistant/tools.ts`)

All tool schemas (Anthropic `Tool[]`) and the underlying async executor functions. Grouped by domain. The API route imports both the schema array (passed to Claude) and the executor map (called server-side).

### FloatingWidgets component (`src/components/FloatingWidgets.tsx`)

Replaces the current standalone `AssistantWidget` render in `dashboard/layout.tsx`. Owns a single `openWidget: 'chat' | 'assistant' | null` state. Renders:

- **Bottom button** — `Sparkles` icon, opens AI assistant widget
- **Above it** — `MessageSquare` icon with unread badge (via `useChatUnreadTotal`), opens team chat widget

Opening either closes the other. Both buttons always visible when closed.

---

## Tool List

### Read tools (execute immediately, no confirmation)

| Tool | Description | Key parameters |
|---|---|---|
| `get_tasks` | Fetch tasks | `status`, `assignee`, `project_id`, `priority`, `limit` |
| `get_projects` | List projects | `status`, `include_archived` |
| `get_clients` | List clients | — |
| `get_time_entries` | Fetch time entries | `user_id`, `date_from`, `date_to`, `project_id` |
| `get_expenses` | Fetch expenses | `status`, `category`, `date_from`, `date_to` |
| `get_team_members` | Org members + roles | — |
| `get_leave_requests` | Leave by status | `status`, `user_id` |
| `get_calendar_events` | Events by range | `date_from`, `date_to` |
| `get_summary` | Rolled-up snapshot for the greeting | — |

### Write tools (confirmation card before execution)

| Tool | Description | Key parameters |
|---|---|---|
| `create_task` | New task | `title`, `project_id`, `priority`, `due_date`, `assigned_to`, `notes` |
| `update_task` | Update task fields | `id`, plus any of: `title`, `status`, `priority`, `due_date`, `assigned_to`, `notes` |
| `create_project` | New project | `name`, `description`, `due_date`, `colour` |
| `update_project` | Update project fields | `id`, plus any of: `name`, `description`, `status`, `due_date`, `colour` |
| `create_client` | New client | `name`, `email`, `phone`, `notes` |
| `update_client` | Update client fields | `id`, plus any of: `name`, `email`, `phone`, `notes` |
| `create_time_entry` | Log time manually | `project_id`, `start_time`, `end_time`, `description` |
| `start_timer` | Start a running timer | `project_id`, `description` |
| `stop_timer` | Stop the active timer | — |
| `create_expense` | New expense | `amount`, `currency`, `category`, `date`, `notes` |
| `create_calendar_event` | New calendar event | `title`, `start`, `end`, `description` |
| `create_leave_request` | New leave request | `start_date`, `end_date`, `reason` |

---

## Confirmation Card

When Claude emits a write tool call, the client renders an inline card in the chat thread containing:

- Tool label (e.g. "Create task")
- A human-readable summary of the record to be created or fields to be changed
- **Confirm** and **Cancel** buttons

On Confirm: client calls `/api/assistant/execute`, receives result, appends a system message to the conversation ("Task created: [title]") so Claude knows it succeeded.
On Cancel: appends a system message ("Action cancelled by user") so Claude can respond appropriately.

Nothing is written to the database without the user tapping Confirm.

---

## Full-Page Assistant (`/dashboard/assistant`)

Two-column layout:

- **Left sidebar (narrow)** — conversation history list. Each session is stored in `assistant_sessions` (new table: `id`, `user_id`, `title` auto-generated from first message, `created_at`). "New conversation" button at the top. Clicking a past session loads its message history.
- **Right main area** — the chat thread + composer. Tool confirmation cards render inline. Voice toggle button top-right.

On first open of a session, `get_summary` fires automatically and Claude's opening message is a personalised context greeting (overdue tasks, upcoming deadlines, hours this week).

---

## AI Assistant Widget

Same conversation UX as today but with tool use enabled. Same size/shape drawer. Replaces the `?` button with `Sparkles`. The greeting fires on first open per page load (not per message). An "Open full assistant" link in the widget header navigates to `/dashboard/assistant`.

Conversation state is held in React state (not persisted) for the widget — it resets on close. The full-page view uses persisted sessions.

---

## Team Chat Widget (Group 2)

A mini chat drawer using the existing `ChatRealtimeProvider`. Structure:

- **List view** — conversation list (channels + DMs), same as `ConversationList` but compact. An "Open full chat" link in the header.
- **Thread view** — selected conversation thread + `MessageComposer`. Back arrow returns to list.
- Unread badge on the floating button sourced from `useChatUnreadTotal()`.

On mobile, opening the widget shows the list view. Selecting a conversation shows the thread. The full `/dashboard/chat` page remains the canonical destination for extended use.

---

## Voice Mode (Group 3)

Voice mode is a per-session toggle (does not persist). Available in both the widget and the full-page view.

### Input (Speech-to-Text)
Uses the browser `SpeechRecognition` API (via `window.SpeechRecognition || window.webkitSpeechRecognition`). A microphone button in the composer area. Tapping starts continuous recognition — interim results stream into the textarea in real time. Speech pauses auto-submit the message (same as pressing Enter). A second tap stops recognition without submitting.

### Output (Text-to-Speech)
Uses the browser `SpeechSynthesis` API. When voice mode is active, each completed assistant text response is passed to `speechSynthesis.speak()`. The user can interrupt playback by tapping the speaker icon or starting a new voice input. TTS does not read out action confirmation cards — only conversational text.

### Fallback
If `SpeechRecognition` is not available (Firefox), the microphone button is hidden. If `SpeechSynthesis` is not available, TTS is silently skipped. No error is thrown.

---

## Database

### New table: `assistant_sessions`
```sql
create table public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.assistant_sessions enable row level security;
-- Users can only see their own sessions
create policy "own sessions" on public.assistant_sessions
  for all using (user_id = auth.uid());
```

Messages stored as JSONB array: `[{ role, content, tool_calls?, created_at }]`. Updated on each turn.

---

## System Prompt Changes

The existing system prompt is extended with:

1. **Data context block** (injected dynamically on first turn of a session): output of `get_summary` formatted as a bullet list of current state.
2. **Action instructions**: explicit rules — always confirm intent before calling a write tool; if the user says "cancel" after seeing a card, respect it; never guess at IDs.
3. **Persona update**: "You are the TimeWiseHub AI assistant. You can read your data, answer questions about it, and take actions to create and update records on your behalf — always with your approval."

---

## Out of Scope

- Deleting records (too destructive for AI-initiated actions; user does this manually)
- Multi-turn tool chaining without intermediate user confirmation
- Persisting voice mode preference across sessions
- Whisper / OpenAI TTS (browser-native only for now)
- Group conversation sessions (sessions are per-user, not shared)
- Conversation export
