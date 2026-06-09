# AI Assistant — Phase 13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing help widget into a full AI agent that reads platform data, takes actions with user confirmation, has a dedicated full-page view, a team-chat floating widget, and optional voice I/O.

**Architecture:** Anthropic tool use (two-phase: non-streaming tool resolution then streaming final response); write tools emit an `__ACTION__` sentinel intercepted by the client which renders a confirmation card; sessions persisted in `assistant_sessions` table for the full-page view, ephemeral for the widget. Browser-native `SpeechRecognition` + `SpeechSynthesis` for voice.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Anthropic SDK (`@anthropic-ai/sdk`), Supabase (PostgreSQL + RLS), `lucide-react`. No new npm packages.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `supabase/schema-038-assistant-sessions.sql` | `assistant_sessions` table + RLS |
| Create | `src/lib/assistant/tools.ts` | Tool schemas + read executors |
| Create | `src/lib/assistant/write-executors.ts` | Write tool executor (used by execute route) |
| Modify | `src/app/api/assistant/route.ts` | Tool-use streaming endpoint |
| Create | `src/app/api/assistant/execute/route.ts` | Confirmed write action executor |
| Create | `src/components/assistant/ActionCard.tsx` | Confirmation card UI |
| Modify | `src/components/AssistantWidget.tsx` | Full replacement — tool use + Sparkles icon |
| Create | `src/app/dashboard/assistant/page.tsx` | Full-page assistant with session sidebar |
| Create | `src/components/FloatingWidgets.tsx` | Stacked widget launcher, shared open state |
| Modify | `src/app/dashboard/layout.tsx` | Swap AssistantWidget → FloatingWidgets |
| Modify | `src/components/DashboardShell.tsx` | Add Assistant nav link + Sparkles import |
| Create | `src/components/chat/TeamChatWidget.tsx` | Mini chat drawer (Group 2) |
| Create | `src/hooks/useVoice.ts` | SpeechRecognition + SpeechSynthesis hook (Group 3) |

---

## Group 1 — Core Tool Use + Widgets + Full Page

---

### Task 1: Database migration — assistant_sessions

**Files:**
- Create: `supabase/schema-038-assistant-sessions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/schema-038-assistant-sessions.sql
-- Assistant conversation sessions for the full-page view.
-- The floating widget uses ephemeral React state (no DB).

create table public.assistant_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assistant_sessions enable row level security;

create policy "Users own their sessions"
  on public.assistant_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index assistant_sessions_user on public.assistant_sessions (user_id, updated_at desc);

-- Auto-update updated_at
create or replace function public.touch_assistant_session()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger assistant_session_updated
  before update on public.assistant_sessions
  for each row execute function public.touch_assistant_session();
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the MCP `apply_migration` tool with name `assistant_sessions`. Verify with:
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'assistant_sessions';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-038-assistant-sessions.sql
git commit -m "handover: C1 schema-038 assistant_sessions table + RLS"
```

---

### Task 2: Tool schemas and read executors

**Files:**
- Create: `src/lib/assistant/tools.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/assistant/tools.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const READ_TOOLS = new Set([
  'get_tasks', 'get_projects', 'get_clients', 'get_time_entries',
  'get_expenses', 'get_team_members', 'get_leave_requests',
  'get_calendar_events', 'get_summary',
])

export const WRITE_TOOLS = new Set([
  'create_task', 'update_task', 'create_project', 'update_project',
  'create_client', 'update_client', 'create_time_entry', 'start_timer',
  'stop_timer', 'create_expense', 'create_calendar_event', 'create_leave_request',
])

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name)
}

export const TOOL_SCHEMAS: Anthropic.Tool[] = [
  // ── Read tools ──────────────────────────────────────────
  {
    name: 'get_tasks',
    description: 'Fetch tasks the user can see. Filter by status, assignee, or priority.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'], description: 'Filter by priority' },
        assignee_id: { type: 'string', description: 'Filter by assignee user UUID' },
        project_id: { type: 'string', description: 'Filter by project UUID' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_projects',
    description: 'List projects the user can see.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by status (default: active)' },
        include_archived: { type: 'boolean', description: 'Include archived projects' },
      },
      required: [],
    },
  },
  {
    name: 'get_clients',
    description: 'List clients the user can see.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_time_entries',
    description: 'Fetch time entries for the current user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
        task_id: { type: 'string', description: 'Filter by task UUID' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_expenses',
    description: 'Fetch expenses the user can see.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected'] },
        date_from: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_team_members',
    description: 'List all members of the user\'s organisation with their roles.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_leave_requests',
    description: 'Fetch leave requests.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected'] },
        user_id: { type: 'string', description: 'Filter by user UUID (managers only)' },
      },
      required: [],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch calendar events in a date range.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
      },
      required: [],
    },
  },
  {
    name: 'get_summary',
    description: 'Get a rolled-up snapshot: overdue tasks, upcoming deadlines (3 days), today\'s logged hours, active timer. Call this at the start of every new session.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── Write tools (require confirmation) ──────────────────
  {
    name: 'create_task',
    description: 'Propose creating a new task. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        project_id: { type: 'string', description: 'UUID of the project' },
        priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] },
        due_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        assignee_id: { type: 'string', description: 'UUID of the assignee' },
        notes: { type: 'string' },
      },
      required: ['title', 'project_id'],
    },
  },
  {
    name: 'update_task',
    description: 'Propose updating a task. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Task UUID' },
        title: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] },
        due_date: { type: 'string' },
        assignee_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_project',
    description: 'Propose creating a new project. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        colour: { type: 'string', description: 'Hex colour e.g. #2563eb' },
        client_id: { type: 'string', description: 'UUID of linked client' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_project',
    description: 'Propose updating a project. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Project UUID' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['active', 'archived'] },
        due_date: { type: 'string' },
        colour: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_client',
    description: 'Propose creating a new client. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_client',
    description: 'Propose updating a client. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Client UUID' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_time_entry',
    description: 'Propose logging a manual time entry. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' },
        started_at: { type: 'string', description: 'ISO datetime' },
        ended_at: { type: 'string', description: 'ISO datetime' },
        task_id: { type: 'string', description: 'Optional task UUID' },
      },
      required: ['started_at', 'ended_at'],
    },
  },
  {
    name: 'start_timer',
    description: 'Propose starting a running timer (creates a time entry with no end time). Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' },
        task_id: { type: 'string', description: 'Optional task UUID' },
      },
      required: [],
    },
  },
  {
    name: 'stop_timer',
    description: 'Propose stopping the active running timer. Will show a confirmation card.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_expense',
    description: 'Propose logging a new expense. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string', description: 'Default: AUD' },
        description: { type: 'string' },
        expense_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        category_name: { type: 'string', description: 'Category name e.g. Travel' },
      },
      required: ['amount', 'description'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Propose creating a calendar event. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        start_at: { type: 'string', description: 'ISO datetime' },
        end_at: { type: 'string', description: 'ISO datetime' },
        all_day: { type: 'boolean' },
      },
      required: ['title', 'start_at'],
    },
  },
  {
    name: 'create_leave_request',
    description: 'Propose submitting a leave request. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        leave_type: { type: 'string', enum: ['annual', 'sick', 'personal', 'unpaid', 'other'] },
        start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'string' },
      },
      required: ['leave_type', 'start_date', 'end_date'],
    },
  },
]

// ── Read executors ────────────────────────────────────────────

type ToolInput = Record<string, unknown>

export async function executeReadTool(
  name: string,
  input: ToolInput,
  supabase: SupabaseClient,
  userId: string,
): Promise<unknown> {
  switch (name) {
    case 'get_tasks': {
      let q = supabase
        .from('tasks')
        .select('id, title, notes, priority, status, due_date, assignee_id, project_id, projects(name)')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(Number(input.limit ?? 20))
      if (input.status) q = q.eq('status', input.status as string)
      if (input.priority) q = q.eq('priority', input.priority as string)
      if (input.assignee_id) q = q.eq('assignee_id', input.assignee_id as string)
      if (input.project_id) q = q.eq('project_id', input.project_id as string)
      const { data } = await q
      return data ?? []
    }

    case 'get_projects': {
      let q = supabase
        .from('projects')
        .select('id, name, description, status, due_date, colour, client_id, clients(name)')
        .order('due_date', { ascending: true, nullsFirst: false })
      if (!input.include_archived) q = q.eq('status', (input.status as string) ?? 'active')
      const { data } = await q
      return data ?? []
    }

    case 'get_clients': {
      const { data } = await supabase
        .from('clients')
        .select('id, name, email, phone, archived')
        .eq('archived', false)
        .order('name')
      return data ?? []
    }

    case 'get_time_entries': {
      let q = supabase
        .from('time_entries')
        .select('id, description, started_at, ended_at, duration_seconds, task_id, tasks(title)')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(Number(input.limit ?? 20))
      if (input.date_from) q = q.gte('started_at', `${input.date_from}T00:00:00`)
      if (input.date_to) q = q.lte('started_at', `${input.date_to}T23:59:59`)
      if (input.task_id) q = q.eq('task_id', input.task_id as string)
      const { data } = await q
      return data ?? []
    }

    case 'get_expenses': {
      let q = supabase
        .from('expenses')
        .select('id, amount, currency, description, expense_date, status, expense_categories(name)')
        .eq('user_id', userId)
        .order('expense_date', { ascending: false })
        .limit(Number(input.limit ?? 20))
      if (input.status) q = q.eq('status', input.status as string)
      if (input.date_from) q = q.gte('expense_date', input.date_from as string)
      if (input.date_to) q = q.lte('expense_date', input.date_to as string)
      const { data } = await q
      return data ?? []
    }

    case 'get_team_members': {
      const { data: membership } = await supabase
        .from('organisation_members')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!membership?.org_id) return []
      const { data } = await supabase
        .from('organisation_members')
        .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email)')
        .eq('org_id', membership.org_id)
      return data ?? []
    }

    case 'get_leave_requests': {
      let q = supabase
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date, status, notes, user_id, profiles!leave_requests_user_id_fkey(full_name)')
        .order('start_date', { ascending: false })
        .limit(20)
      if (input.status) q = q.eq('status', input.status as string)
      if (input.user_id) {
        q = q.eq('user_id', input.user_id as string)
      } else {
        q = q.eq('user_id', userId)
      }
      const { data } = await q
      return data ?? []
    }

    case 'get_calendar_events': {
      let q = supabase
        .from('calendar_events')
        .select('id, title, description, start_at, end_at, all_day')
        .order('start_at')
        .limit(30)
      if (input.date_from) q = q.gte('start_at', `${input.date_from}T00:00:00`)
      if (input.date_to) q = q.lte('start_at', `${input.date_to}T23:59:59`)
      const { data } = await q
      return data ?? []
    }

    case 'get_summary': {
      const today = new Date().toISOString().slice(0, 10)
      const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

      const [{ data: overdue }, { data: upcoming }, { data: todayEntries }, { data: activeTimer }] =
        await Promise.all([
          supabase
            .from('tasks')
            .select('id, title, priority, due_date, projects(name)')
            .lt('due_date', today)
            .neq('status', 'done')
            .order('due_date')
            .limit(10),
          supabase
            .from('tasks')
            .select('id, title, due_date, projects(name)')
            .gte('due_date', today)
            .lte('due_date', threeDays)
            .neq('status', 'done')
            .order('due_date')
            .limit(10),
          supabase
            .from('time_entries')
            .select('duration_seconds')
            .eq('user_id', userId)
            .gte('started_at', `${today}T00:00:00`)
            .lte('started_at', `${today}T23:59:59`)
            .not('ended_at', 'is', null),
          supabase
            .from('time_entries')
            .select('id, description, started_at')
            .eq('user_id', userId)
            .is('ended_at', null)
            .maybeSingle(),
        ])

      const todaySeconds = (todayEntries ?? []).reduce(
        (s: number, e: { duration_seconds: number | null }) => s + (e.duration_seconds ?? 0), 0,
      )
      const todayHours = (todaySeconds / 3600).toFixed(1)

      return {
        overdue_tasks: overdue ?? [],
        upcoming_deadlines: upcoming ?? [],
        today_hours_logged: todayHours,
        active_timer: activeTimer ?? null,
      }
    }

    default:
      return { error: `Unknown read tool: ${name}` }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/tools.ts
git commit -m "handover: C2 assistant tool schemas + read executors"
```

---

### Task 3: Write executors

**Files:**
- Create: `src/lib/assistant/write-executors.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/assistant/write-executors.ts
import type { SupabaseClient } from '@supabase/supabase-js'

type ToolInput = Record<string, unknown>

export async function executeWriteTool(
  name: string,
  input: ToolInput,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'create_task': {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            project_id: input.project_id as string,
            title: input.title as string,
            notes: (input.notes as string) ?? null,
            priority: (input.priority as string) ?? 'normal',
            due_date: (input.due_date as string) ?? null,
            assignee_id: (input.assignee_id as string) ?? null,
            status: 'todo',
          })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'update_task': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('tasks')
          .update(fields)
          .eq('id', id as string)
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_project': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('projects')
          .insert({
            owner_id: userId,
            org_id: membership?.org_id ?? null,
            name: input.name as string,
            description: (input.description as string) ?? null,
            due_date: (input.due_date as string) ?? null,
            colour: (input.colour as string) ?? '#2563eb',
            client_id: (input.client_id as string) ?? null,
          })
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'update_project': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('projects')
          .update(fields)
          .eq('id', id as string)
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_client': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('clients')
          .insert({
            owner_id: userId,
            org_id: membership?.org_id ?? null,
            name: input.name as string,
            email: (input.email as string) ?? null,
            phone: (input.phone as string) ?? null,
          })
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'update_client': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('clients')
          .update(fields)
          .eq('id', id as string)
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_time_entry': {
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: userId,
            description: (input.description as string) ?? null,
            started_at: input.started_at as string,
            ended_at: input.ended_at as string,
            task_id: (input.task_id as string) ?? null,
          })
          .select('id')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'start_timer': {
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: userId,
            description: (input.description as string) ?? null,
            started_at: new Date().toISOString(),
            task_id: (input.task_id as string) ?? null,
          })
          .select('id, started_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'stop_timer': {
        const { data: active } = await supabase
          .from('time_entries')
          .select('id')
          .eq('user_id', userId)
          .is('ended_at', null)
          .maybeSingle()
        if (!active) return { ok: false, error: 'No active timer found.' }
        const { data, error } = await supabase
          .from('time_entries')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', active.id)
          .select('id, started_at, ended_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_expense': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        // Resolve category_id from category_name if provided
        let category_id: string | null = null
        if (input.category_name) {
          const { data: cat } = await supabase
            .from('expense_categories')
            .select('id')
            .ilike('name', input.category_name as string)
            .maybeSingle()
          category_id = cat?.id ?? null
        }
        const { data, error } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            org_id: membership?.org_id ?? null,
            amount: input.amount as number,
            currency: (input.currency as string) ?? 'AUD',
            description: input.description as string,
            expense_date: (input.expense_date as string) ?? new Date().toISOString().slice(0, 10),
            category_id,
            status: 'draft',
          })
          .select('id, amount, description')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_calendar_event': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('calendar_events')
          .insert({
            created_by: userId,
            org_id: membership?.org_id ?? null,
            title: input.title as string,
            description: (input.description as string) ?? null,
            start_at: input.start_at as string,
            end_at: (input.end_at as string) ?? null,
            all_day: (input.all_day as boolean) ?? false,
          })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_leave_request': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('leave_requests')
          .insert({
            user_id: userId,
            org_id: membership?.org_id ?? null,
            leave_type: input.leave_type as string,
            start_date: input.start_date as string,
            end_date: input.end_date as string,
            notes: (input.notes as string) ?? null,
            status: 'submitted',
          })
          .select('id, leave_type, start_date, end_date')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      default:
        return { ok: false, error: `Unknown write tool: ${name}` }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/write-executors.ts
git commit -m "handover: C3 write tool executors"
```

---

### Task 4: Upgraded /api/assistant route

**Files:**
- Modify: `src/app/api/assistant/route.ts` (full replacement)

- [ ] **Step 1: Replace the file**

```typescript
// src/app/api/assistant/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { TOOL_SCHEMAS, isReadTool, executeReadTool } from '@/lib/assistant/tools'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `You are the TimeWiseHub AI assistant. You have access to the user's real data: tasks, projects, clients, time entries, expenses, leave, calendar, and team members. You can read data and propose actions (the user confirms before anything changes).

Rules:
- At the start of every new session (first user message), call get_summary to load context before responding.
- For write actions, call the appropriate tool. The system will show the user a confirmation card — you do not need to ask for permission in text.
- After proposing a write action, briefly explain what you proposed and wait for the result.
- If a write action fails, say so clearly and suggest alternatives.
- Never guess at UUIDs. Fetch the data first to get IDs.
- Be concise and practical. This is a productivity tool, not a chat app.
- If the user reports a bug, tell them to use the "Report a bug" button below and include what they were doing.

TimeWiseHub features: time tracking, expenses, projects, tasks, leave, calendar, clients, invoices, finance, team chat, reports, billing.`

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'replace-with-your-anthropic-api-key') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let messages: ChatMessage[]
  try {
    const body = await request.json()
    messages = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const cleanMessages = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.trim() }))

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'A user message is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })

  // Phase 1: non-streaming call to resolve tool calls
  let currentMessages: Anthropic.MessageParam[] = cleanMessages
  let iterations = 0
  const MAX_ITERATIONS = 5 // prevent infinite loops

  while (iterations < MAX_ITERATIONS) {
    iterations++
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_SCHEMAS,
      messages: currentMessages,
    })

    const toolUseBlocks = result.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const textBlocks = result.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')

    if (toolUseBlocks.length === 0) {
      // No tools — stream the text response
      const text = textBlocks.map(b => b.text).join('')
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    // Separate read and write tools
    const readTools = toolUseBlocks.filter(b => isReadTool(b.name))
    const writeTools = toolUseBlocks.filter(b => !isReadTool(b.name))

    if (writeTools.length > 0) {
      // Emit write proposals as sentinels + Claude's text preamble
      const preamble = textBlocks.map(b => b.text).join('')
      const sentinels = writeTools
        .map(t => `\n__ACTION__:${JSON.stringify({ tool: t.name, input: t.input, id: t.id })}`)
        .join('')
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(preamble + sentinels))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    // Only read tools — execute and loop
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      readTools.map(async tool => {
        const data = await executeReadTool(tool.name, tool.input as Record<string, unknown>, supabase, user.id)
        return {
          type: 'tool_result' as const,
          tool_use_id: tool.id,
          content: JSON.stringify(data),
        }
      }),
    )

    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: result.content },
      { role: 'user' as const, content: toolResults },
    ]
  }

  // Fallback if we somehow exhausted iterations
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("I wasn't able to complete that in the expected number of steps. Please try again."))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assistant/route.ts
git commit -m "handover: C4 assistant API — tool use + action sentinel"
```

---

### Task 5: Execute route for confirmed write actions

**Files:**
- Create: `src/app/api/assistant/execute/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/assistant/execute/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { WRITE_TOOLS } from '@/lib/assistant/tools'
import { executeWriteTool } from '@/lib/assistant/write-executors'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tool: string; input: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!body.tool || !WRITE_TOOLS.has(body.tool)) {
    return NextResponse.json({ error: 'Invalid or disallowed tool.' }, { status: 400 })
  }

  const result = await executeWriteTool(body.tool, body.input ?? {}, supabase, user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }
  return NextResponse.json({ ok: true, result: result.result })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assistant/execute/route.ts
git commit -m "handover: C5 /api/assistant/execute write action route"
```

---

### Task 6: ActionCard component

**Files:**
- Create: `src/components/assistant/ActionCard.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/components/assistant/ActionCard.tsx
'use client'

const TOOL_LABELS: Record<string, string> = {
  create_task: 'Create task',
  update_task: 'Update task',
  create_project: 'Create project',
  update_project: 'Update project',
  create_client: 'Create client',
  update_client: 'Update client',
  create_time_entry: 'Log time',
  start_timer: 'Start timer',
  stop_timer: 'Stop timer',
  create_expense: 'Log expense',
  create_calendar_event: 'Create event',
  create_leave_request: 'Submit leave',
}

const SKIP_KEYS = new Set(['id'])

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export type ActionProposal = {
  tool: string
  input: Record<string, unknown>
  id: string
}

export default function ActionCard({
  proposal,
  onConfirm,
  onCancel,
  loading,
}: {
  proposal: ActionProposal
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const label = TOOL_LABELS[proposal.tool] ?? proposal.tool
  const entries = Object.entries(proposal.input).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  )

  return (
    <div className="my-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/40">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
        {label}
      </p>
      {entries.length > 0 && (
        <dl className="mb-4 space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="w-32 shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {formatKey(k)}
              </dt>
              <dd className="text-slate-900 dark:text-slate-100">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? 'Confirming…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/ActionCard.tsx
git commit -m "handover: C6 ActionCard confirmation component"
```

---

### Task 7: Upgraded AssistantWidget

Replace the entire `src/components/AssistantWidget.tsx`. The new version uses tool use, renders action cards, and uses the Sparkles icon.

**Files:**
- Modify: `src/components/AssistantWidget.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

```typescript
// src/components/AssistantWidget.tsx
'use client'

import { FormEvent, useRef, useState } from 'react'
import { Sparkles, X, Send } from 'lucide-react'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  action?: ActionProposal
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

type View = 'chat' | 'report' | 'reported'

const ACTION_SENTINEL = '\n__ACTION__:'

function parseResponse(raw: string): { text: string; action: ActionProposal | null } {
  const idx = raw.indexOf(ACTION_SENTINEL)
  if (idx === -1) return { text: raw, action: null }
  const text = raw.slice(0, idx)
  try {
    const action = JSON.parse(raw.slice(idx + ACTION_SENTINEL.length)) as ActionProposal
    return { text, action }
  } catch {
    return { text: raw, action: null }
  }
}

export default function AssistantWidget({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I can read your tasks, projects, expenses, time entries, and more — and help you create or update them. What would you like to do?",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [bugDescription, setBugDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Derive the messages array to send as history (text only, no action cards)
  function buildHistory(msgs: Message[]) {
    return msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }))
      .filter(m => m.content.trim().length > 0)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildHistory(nextMessages) }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Assistant unavailable.')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        // Stream text in real-time (before sentinel check)
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: accumulated }
          return u
        })
      }

      const { text: finalText, action } = parseResponse(accumulated)

      if (action) {
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = {
            role: 'assistant',
            content: finalText,
            action,
            actionStatus: 'pending',
          }
          return u
        })
      } else {
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: finalText }
          return u
        })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Assistant unavailable.'
      setMessages(cur => {
        const u = [...cur]
        u[u.length - 1] = { role: 'assistant', content: msg }
        return u
      })
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  async function handleConfirm(msgIndex: number) {
    const msg = messages[msgIndex]
    if (!msg.action) return
    setConfirmingId(msg.action.id)

    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: msg.action.tool, input: msg.action.input }),
      })
      const data = await res.json()

      // Mark action confirmed
      setMessages(cur => {
        const u = [...cur]
        u[msgIndex] = { ...u[msgIndex], actionStatus: 'confirmed' }
        return u
      })

      // Add a notice and re-enter conversation so Claude can respond
      const notice: Message = {
        role: 'notice',
        content: res.ok ? `Action confirmed.` : `Action failed: ${data.error}`,
      }
      const followUp = res.ok
        ? `Action confirmed and completed. Result: ${JSON.stringify(data.result)}`
        : `The action failed with error: ${data.error}`

      const nextMessages: Message[] = [...messages.slice(0, msgIndex + 1), notice, { role: 'assistant', content: '' }]
      setMessages(nextMessages)
      setLoading(true)

      const historyWithFollowUp = [
        ...buildHistory(messages.slice(0, msgIndex + 1)),
        { role: 'user' as const, content: followUp },
      ]

      const abort = new AbortController()
      abortRef.current = abort
      const apiRes = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyWithFollowUp }),
        signal: abort.signal,
      })

      if (apiRes.ok && apiRes.body) {
        const reader = apiRes.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          setMessages(cur => {
            const u = [...cur]
            u[u.length - 1] = { role: 'assistant', content: acc }
            return u
          })
        }
      }
    } finally {
      setConfirmingId(null)
      setLoading(false)
      abortRef.current = null
    }
  }

  function handleCancel(msgIndex: number) {
    setMessages(cur => {
      const u = [...cur]
      u[msgIndex] = { ...u[msgIndex], actionStatus: 'cancelled' }
      return u
    })
  }

  async function handleBugReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const description = bugDescription.trim()
    if (!description || submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, conversation: messages }),
      })
      setView('reported')
    } catch {
      setView('reported')
    } finally {
      setSubmitting(false)
    }
  }

  function close() {
    abortRef.current?.abort()
    setOpen(false)
  }

  const mailtoLink = `mailto:support@vividex.au?subject=${encodeURIComponent('Bug Report — TimeWiseHub')}&body=${encodeURIComponent(`User: ${userEmail}\n\nDescription:\n${bugDescription}`)}`

  return (
    <>
      {open && (
        <div className="mb-4 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white dark:border-slate-700">
            <div>
              <h2 className="text-base font-black">
                {view === 'chat' ? 'AI Assistant' : view === 'report' ? 'Report a bug' : 'Report sent'}
              </h2>
              <p className="text-xs font-medium text-slate-400">
                {view === 'chat' ? 'Ask anything or take action.' : view === 'report' ? "Describe what went wrong and we'll look into it." : 'Our team has been notified.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/dashboard/assistant"
                className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Full view →
              </a>
              <button onClick={close} className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
                ✕
              </button>
            </div>
          </div>

          {view === 'chat' && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 dark:bg-slate-950">
                {messages.map((msg, i) => {
                  if (msg.role === 'notice') {
                    return (
                      <p key={i} className="text-center text-xs font-medium text-gray-400 dark:text-slate-500">
                        {msg.content}
                      </p>
                    )
                  }
                  return (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-cyan-500 text-white'
                          : 'border border-gray-100 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      }`}>
                        <p className="whitespace-pre-wrap">
                          {msg.content || (loading && i === messages.length - 1 ? 'Thinking…' : '')}
                        </p>
                        {msg.action && msg.actionStatus === 'pending' && (
                          <ActionCard
                            proposal={msg.action}
                            onConfirm={() => handleConfirm(i)}
                            onCancel={() => handleCancel(i)}
                            loading={confirmingId === msg.action.id}
                          />
                        )}
                        {msg.action && msg.actionStatus === 'confirmed' && (
                          <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">✓ Confirmed</p>
                        )}
                        {msg.action && msg.actionStatus === 'cancelled' && (
                          <p className="mt-2 text-xs font-semibold text-gray-400">Cancelled</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-gray-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setView('report')}
                  className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600"
                >
                  Report a bug →
                </button>
              </div>

              <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                    }}
                    rows={2}
                    placeholder="Ask the assistant…"
                    className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </>
          )}

          {view === 'report' && (
            <form onSubmit={handleBugReport} className="flex flex-1 flex-col gap-4 p-5">
              <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                Tell us what went wrong. We&apos;ll follow up at <span className="font-bold text-slate-900 dark:text-slate-100">{userEmail}</span>.
              </p>
              <textarea
                value={bugDescription}
                onChange={e => setBugDescription(e.target.value)}
                rows={6}
                placeholder="e.g. I clicked Submit expense and nothing happened."
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setView('chat')} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Back</button>
                <button type="submit" disabled={submitting || !bugDescription.trim()} className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50">{submitting ? 'Sending…' : 'Send report'}</button>
              </div>
            </form>
          )}

          {view === 'reported' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl dark:bg-green-950">✓</div>
              <div>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">Report received</p>
                <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">We&apos;ll follow up at <span className="font-semibold text-slate-900 dark:text-slate-100">{userEmail}</span>.</p>
              </div>
              <p className="text-xs font-medium text-gray-400">
                For urgent issues email <a href={mailtoLink} className="font-semibold text-cyan-600 hover:underline">support@vividex.au</a>
              </p>
              <button onClick={() => { setView('chat'); setBugDescription('') }} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors dark:bg-slate-700">
                Back to assistant
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open AI assistant"
        aria-expanded={open}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  )
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```
Expected: clean build, `/api/assistant/execute` appears in the route table.

- [ ] **Step 3: Commit**

```bash
git add src/components/AssistantWidget.tsx
git commit -m "handover: C7 upgraded AssistantWidget — tool use + Sparkles + action cards"
```

---

### Task 8: Full-page assistant

**Files:**
- Create: `src/app/dashboard/assistant/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// src/app/dashboard/assistant/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AssistantPageClient from '@/components/assistant/AssistantPageClient'

export default async function AssistantPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sessions } = await supabase
    .from('assistant_sessions')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30)

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden dark:bg-slate-950">
      <AssistantPageClient
        userId={user.id}
        userEmail={user.email ?? ''}
        initialSessions={(sessions ?? []) as { id: string; title: string | null; updated_at: string }[]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

Create `src/components/assistant/AssistantPageClient.tsx`:

```typescript
// src/components/assistant/AssistantPageClient.tsx
'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Send, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ActionCard, { type ActionProposal } from '@/components/assistant/ActionCard'

type Message = {
  role: 'user' | 'assistant' | 'notice'
  content: string
  action?: ActionProposal
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

type Session = { id: string; title: string | null; updated_at: string }

const ACTION_SENTINEL = '\n__ACTION__:'

function parseResponse(raw: string): { text: string; action: ActionProposal | null } {
  const idx = raw.indexOf(ACTION_SENTINEL)
  if (idx === -1) return { text: raw, action: null }
  const text = raw.slice(0, idx)
  try {
    const action = JSON.parse(raw.slice(idx + ACTION_SENTINEL.length)) as ActionProposal
    return { text, action }
  } catch {
    return { text: raw, action: null }
  }
}

export default function AssistantPageClient({
  userId,
  userEmail,
  initialSessions,
}: {
  userId: string
  userEmail: string
  initialSessions: Session[]
}) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadSession(id: string) {
    const { data } = await supabase
      .from('assistant_sessions')
      .select('messages')
      .eq('id', id)
      .single()
    setActiveSessionId(id)
    setMessages((data?.messages as Message[]) ?? [])
  }

  async function saveSession(id: string, msgs: Message[], title?: string) {
    await supabase
      .from('assistant_sessions')
      .update({ messages: msgs, ...(title ? { title } : {}) })
      .eq('id', id)
  }

  async function createNewSession(): Promise<string> {
    const { data } = await supabase
      .from('assistant_sessions')
      .insert({ user_id: userId, title: 'New conversation', messages: [] })
      .select('id, title, updated_at')
      .single()
    if (data) {
      setSessions(prev => [data as Session, ...prev])
      return data.id
    }
    return ''
  }

  function buildHistory(msgs: Message[]) {
    return msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }))
      .filter(m => m.content.trim())
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createNewSession()
      setActiveSessionId(sessionId)
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }]
    const withPlaceholder: Message[] = [...nextMessages, { role: 'assistant', content: '' }]
    setMessages(withPlaceholder)
    setInput('')
    setLoading(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildHistory(nextMessages) }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Assistant unavailable.')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages(cur => {
          const u = [...cur]
          u[u.length - 1] = { role: 'assistant', content: accumulated }
          return u
        })
      }

      const { text: finalText, action } = parseResponse(accumulated)
      const finalMessages: Message[] = [
        ...nextMessages,
        action
          ? { role: 'assistant', content: finalText, action, actionStatus: 'pending' as const }
          : { role: 'assistant', content: finalText },
      ]
      setMessages(finalMessages)

      // Auto-title session from first user message
      const isFirst = messages.length === 0
      const title = isFirst ? text.slice(0, 60) : undefined
      if (sessionId) await saveSession(sessionId, finalMessages, title)
      if (isFirst && title) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Assistant unavailable.'
      setMessages(cur => {
        const u = [...cur]
        u[u.length - 1] = { role: 'assistant', content: msg }
        return u
      })
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  async function handleConfirm(msgIndex: number) {
    const msg = messages[msgIndex]
    if (!msg.action) return
    setConfirmingId(msg.action.id)

    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: msg.action.tool, input: msg.action.input }),
      })
      const data = await res.json()

      setMessages(cur => {
        const u = [...cur]
        u[msgIndex] = { ...u[msgIndex], actionStatus: 'confirmed' }
        return u
      })

      const followUp = res.ok
        ? `Action confirmed and completed. Result: ${JSON.stringify(data.result)}`
        : `The action failed: ${data.error}`

      const historyWithFollowUp = [
        ...buildHistory(messages.slice(0, msgIndex + 1)),
        { role: 'user' as const, content: followUp },
      ]

      const notice: Message = { role: 'notice', content: res.ok ? 'Action confirmed.' : `Failed: ${data.error}` }
      setMessages(cur => [...cur, notice, { role: 'assistant', content: '' }])
      setLoading(true)

      const apiRes = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyWithFollowUp }),
      })

      if (apiRes.ok && apiRes.body) {
        const reader = apiRes.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          setMessages(cur => {
            const u = [...cur]
            u[u.length - 1] = { role: 'assistant', content: acc }
            return u
          })
        }
      }
    } finally {
      setConfirmingId(null)
      setLoading(false)
    }
  }

  function handleCancel(msgIndex: number) {
    setMessages(cur => {
      const u = [...cur]
      u[msgIndex] = { ...u[msgIndex], actionStatus: 'cancelled' }
      return u
    })
  }

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Conversations</h2>
          <button
            onClick={async () => {
              setMessages([])
              setActiveSessionId(null)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-white transition-colors hover:bg-cyan-600"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                s.id === activeSessionId
                  ? 'bg-cyan-50 font-semibold text-cyan-700 dark:bg-slate-800 dark:text-cyan-400'
                  : 'text-slate-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="block truncate">{s.title ?? 'Untitled'}</span>
              <span className="text-xs text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">No conversations yet.</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0 bg-gray-50 dark:bg-slate-950">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
              <p className="text-lg font-black text-slate-900 dark:text-slate-100">What can I help with?</p>
              <p className="mt-2 text-sm">Ask about your tasks, projects, time, expenses, or anything else.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            if (msg.role === 'notice') {
              return <p key={i} className="text-center text-xs font-medium text-gray-400">{msg.content}</p>
            }
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl rounded-2xl px-5 py-4 text-sm leading-6 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-cyan-500 text-white'
                    : 'border border-gray-100 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                }`}>
                  <p className="whitespace-pre-wrap">
                    {msg.content || (loading && i === messages.length - 1 ? 'Thinking…' : '')}
                  </p>
                  {msg.action && msg.actionStatus === 'pending' && (
                    <ActionCard
                      proposal={msg.action}
                      onConfirm={() => handleConfirm(i)}
                      onCancel={() => handleCancel(i)}
                      loading={confirmingId === msg.action.id}
                    />
                  )}
                  {msg.action && msg.actionStatus === 'confirmed' && (
                    <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">✓ Confirmed</p>
                  )}
                  {msg.action && msg.actionStatus === 'cancelled' && (
                    <p className="mt-2 text-xs font-semibold text-gray-400">Cancelled</p>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                }}
                rows={2}
                placeholder="Ask the assistant…"
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
pnpm run build
```
Expected: `/dashboard/assistant` appears in route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/assistant/page.tsx src/components/assistant/AssistantPageClient.tsx
git commit -m "handover: C8 full-page assistant with session sidebar"
```

---

### Task 9: FloatingWidgets + layout + nav

**Files:**
- Create: `src/components/FloatingWidgets.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/DashboardShell.tsx`

- [ ] **Step 1: Create FloatingWidgets**

```typescript
// src/components/FloatingWidgets.tsx
'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import AssistantWidget from '@/components/AssistantWidget'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type OpenWidget = 'assistant' | 'chat' | null

export default function FloatingWidgets({
  userEmail,
}: {
  userEmail: string
}) {
  const [open, setOpen] = useState<OpenWidget>(null)
  const unread = useChatUnreadTotal()

  function toggle(widget: 'assistant' | 'chat') {
    setOpen(prev => (prev === widget ? null : widget))
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Team chat widget — placeholder drawer; replaced by TeamChatWidget in Task 11 */}
      {open === 'chat' && (
        <div className="mb-1 flex h-[min(560px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="text-base font-black">Team Chat</h2>
              <a href="/dashboard/chat" className="text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Open full chat →
              </a>
            </div>
            <button onClick={() => setOpen(null)} className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">✕</button>
          </div>
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            Loading chat…
          </div>
        </div>
      )}

      {/* AI assistant widget — controlled externally via open state */}
      <div className={open === 'assistant' ? 'flex flex-col items-end' : 'hidden'}>
        <AssistantWidget userEmail={userEmail} />
      </div>

      {/* Stacked buttons */}
      {/* Chat button (top) */}
      <button
        type="button"
        onClick={() => toggle('chat')}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-white shadow-lg transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        aria-label="Open team chat"
      >
        <MessageSquare size={22} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Assistant button (bottom) */}
      <button
        type="button"
        onClick={() => toggle('assistant')}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open AI assistant"
      >
        {open === 'assistant' ? '✕' : '✦'}
      </button>
    </div>
  )
}
```

Note: The Sparkles icon is not available as a Unicode character so we use `✦` as a fallback text. The actual icon will be wired up by importing `Sparkles` from `lucide-react` in the AssistantWidget button replacement below. Update the button to use `<Sparkles size={22} />` by adding the import:

```typescript
import { MessageSquare, Sparkles } from 'lucide-react'
// ...
// Replace '✦' with:
{open === 'assistant' ? <X size={22} /> : <Sparkles size={22} />}
// and add X to the import
import { MessageSquare, Sparkles, X } from 'lucide-react'
```

Apply that fix immediately in the same step so the file is correct before committing.

- [ ] **Step 2: Update layout.tsx**

Replace the `AssistantWidget` line:

```typescript
// src/app/dashboard/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <ChatRealtimeProvider userId={user.id}>
      <DashboardShell email={user.email ?? ''}>
        {children}
        <FloatingWidgets userEmail={user.email ?? ''} />
      </DashboardShell>
    </ChatRealtimeProvider>
  )
}
```

- [ ] **Step 3: Update DashboardShell.tsx — add Assistant to nav**

In `src/components/DashboardShell.tsx`, make three changes:

**a) Add `Sparkles` to lucide imports:**
```typescript
import {
  LayoutDashboard, Clock, FolderKanban, ListTodo, CalendarDays, Palmtree,
  Receipt, Users, FileText, TrendingUp,
  BarChart3, FileBarChart2, Activity,
  CreditCard, Download, HelpCircle, Settings, MessageSquare, Sparkles,
  type LucideIcon,
} from 'lucide-react'
```

**b) Add Assistant to the Work group in `NAV_GROUPS`:**
```typescript
  {
    title: 'Work',
    items: [
      { label: 'Time', href: '/dashboard/time', icon: Clock },
      { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
      { label: 'Tasks', href: '/dashboard/tasks', icon: ListTodo },
      { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare },
      { label: 'Assistant', href: '/dashboard/assistant', icon: Sparkles },
      { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
      { label: 'Leave', href: '/dashboard/leave', icon: Palmtree },
    ],
  },
```

**c) Add to `PAGE_TITLES`:**
```typescript
  '/dashboard/assistant': 'Assistant',
```

- [ ] **Step 4: Build check**

```bash
pnpm run build
```
Expected: clean build, `FloatingWidgets` route appears, `/dashboard/assistant` in route table.

- [ ] **Step 5: Commit**

```bash
git add src/components/FloatingWidgets.tsx src/app/dashboard/layout.tsx src/components/DashboardShell.tsx
git commit -m "handover: C9 FloatingWidgets stack + layout + nav — Group 1 complete"
```

---

## Group 2 — Team Chat Widget

---

### Task 10: TeamChatWidget and wire into FloatingWidgets

**Files:**
- Create: `src/components/chat/TeamChatWidget.tsx`
- Modify: `src/components/FloatingWidgets.tsx`

- [ ] **Step 1: Create TeamChatWidget**

```typescript
// src/components/chat/TeamChatWidget.tsx
'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import MessageThread from '@/components/chat/MessageThread'
import MessageComposer from '@/components/chat/MessageComposer'
import type { ChatConversation } from '@/lib/chat/types'

function dmPeerId(conv: ChatConversation, userId: string): string | null {
  if (conv.type !== 'dm' || !conv.dm_key) return null
  const [a, b] = conv.dm_key.split(':')
  return a === userId ? b : a
}

function canModerate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

export default function TeamChatWidget({ onClose }: { onClose: () => void }) {
  const { userId, conversations, members, unreadByConversation, activeConversationId, setActiveConversation, loading } = useChat()
  const [localActive, setLocalActive] = useState<string | null>(null)

  const channels = conversations.filter(c => c.type === 'channel')
  const dms = conversations.filter(c => c.type === 'dm')

  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m?.full_name || m?.email || 'Direct message'
  }

  const active = conversations.find(c => c.id === localActive) ?? null
  const isChannel = active?.type === 'channel'
  const peerId = active ? dmPeerId(active, userId) : null
  const peer = peerId ? members[peerId] : null
  const canPost = active ? (isChannel ? canModerate(members[userId]?.role) : true) : false
  const title = !active
    ? ''
    : isChannel
      ? (active.title ?? 'Announcements')
      : (peer?.full_name || peer?.email || 'Direct message')

  function openConversation(id: string) {
    setLocalActive(id)
    setActiveConversation(id) // also marks read
  }

  return (
    <div className="flex h-[min(560px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2 min-w-0">
          {localActive && (
            <button
              onClick={() => setLocalActive(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-black truncate">{localActive ? title : 'Team Chat'}</h2>
            {!localActive && (
              <a href="/dashboard/chat" className="text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Open full chat →
              </a>
            )}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">✕</button>
      </div>

      {/* Body */}
      {!localActive ? (
        /* Conversation list */
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {loading && <p className="px-3 py-2 text-sm text-gray-400">Loading…</p>}
          {[...channels, ...dms].map(conv => {
            const unread = unreadByConversation[conv.id] ?? 0
            return (
              <button
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${
                  conv.type === 'channel' ? 'bg-amber-500' : 'bg-cyan-500'
                }`}>
                  {label(conv).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {label(conv)}
                </span>
                {unread > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )
          })}
          {!loading && conversations.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">No conversations yet.</p>
          )}
        </div>
      ) : (
        /* Thread + composer */
        <div className="flex flex-1 flex-col min-h-0">
          <MessageThread conversationId={active!.id} isChannel={isChannel} />
          <MessageComposer
            conversationId={active!.id}
            canPost={canPost}
            peerUserId={peerId ?? undefined}
            peerName={peer?.full_name || peer?.email || undefined}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire TeamChatWidget into FloatingWidgets**

In `src/components/FloatingWidgets.tsx`, replace the placeholder chat drawer with the real `TeamChatWidget`:

```typescript
// src/components/FloatingWidgets.tsx
'use client'

import { useState } from 'react'
import { MessageSquare, Sparkles, X } from 'lucide-react'
import AssistantWidget from '@/components/AssistantWidget'
import TeamChatWidget from '@/components/chat/TeamChatWidget'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type OpenWidget = 'assistant' | 'chat' | null

export default function FloatingWidgets({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState<OpenWidget>(null)
  const unread = useChatUnreadTotal()

  function toggle(widget: 'assistant' | 'chat') {
    setOpen(prev => (prev === widget ? null : widget))
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open === 'chat' && (
        <div className="mb-1">
          <TeamChatWidget onClose={() => setOpen(null)} />
        </div>
      )}

      {open === 'assistant' && (
        <div className="mb-1 flex flex-col items-end">
          <AssistantWidget userEmail={userEmail} />
        </div>
      )}

      {/* Chat button */}
      <button
        type="button"
        onClick={() => toggle('chat')}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-white shadow-lg transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        aria-label="Open team chat"
      >
        <MessageSquare size={22} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Assistant button */}
      <button
        type="button"
        onClick={() => toggle('assistant')}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-colors hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
        aria-label="Open AI assistant"
      >
        {open === 'assistant' ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  )
}
```

Note: With this replacement, the intermediate `AssistantWidget` button rendering from Task 9 is now removed — `FloatingWidgets` owns both buttons and both drawers. The `AssistantWidget` no longer renders its own button internally. **Update `AssistantWidget.tsx`** to remove the outer `<>` wrapper and the bottom `<button>` element (the Sparkles button), so it only renders the drawer `<div>` when passed an `open` prop or controlled externally.

Actually, to keep things simpler, update `AssistantWidget` to accept an `open` prop and `onClose` callback instead of managing its own open state:

Update the `AssistantWidget.tsx` signature:
```typescript
export default function AssistantWidget({
  userEmail,
  open,
  onClose,
}: {
  userEmail: string
  open: boolean
  onClose: () => void
}) {
  // Remove internal `open` state
  // Remove the outer button
  // Use props `open` and `onClose` directly
  // The `close()` function calls `onClose()` instead of setOpen(false)
  // Return just the drawer div (no outer <>...button</> wrapper) when open
  if (!open) return null
  return (
    <div className="mb-1 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      {/* ... rest of drawer content unchanged, using onClose instead of close() ... */}
    </div>
  )
}
```

Apply this refactor to `AssistantWidget.tsx` now, updating:
- Props: add `open: boolean`, `onClose: () => void`; remove the internal `useState` for open
- Remove the floating button element at the bottom
- Return `null` when `!open`
- Replace all `setOpen(false)` / `close()` calls with `onClose()`

Then update `FloatingWidgets.tsx` to pass the props:
```typescript
{open === 'assistant' && (
  <AssistantWidget userEmail={userEmail} open={true} onClose={() => setOpen(null)} />
)}
```

- [ ] **Step 3: Build check**

```bash
pnpm run build
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/TeamChatWidget.tsx src/components/FloatingWidgets.tsx src/components/AssistantWidget.tsx
git commit -m "handover: C10 TeamChatWidget + FloatingWidgets — Group 2 complete"
```

---

## Group 3 — Voice Mode

---

### Task 11: Voice hook

**Files:**
- Create: `src/hooks/useVoice.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useVoice.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type VoiceState = 'idle' | 'listening' | 'error'

export function useVoice({
  onTranscript,
  enabled,
}: {
  onTranscript: (text: string) => void
  enabled: boolean
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SR = (typeof window !== 'undefined')
      ? (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition)
      : undefined
    setSupported(!!SR)
  }, [])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-AU'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) onTranscript(transcript.trim())
      setState('idle')
    }
    recognition.onerror = () => setState('error')
    recognition.onend = () => setState('idle')

    recognitionRef.current = recognition
    recognition.start()
    setState('listening')
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setState('idle')
  }, [])

  function speak(text: string) {
    if (!enabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-AU'
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  return { state, supported, startListening, stopListening, speak, stopSpeaking }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "handover: C11 useVoice hook — SpeechRecognition + SpeechSynthesis"
```

---

### Task 12: Wire voice into AssistantWidget and AssistantPageClient

**Files:**
- Modify: `src/components/AssistantWidget.tsx`
- Modify: `src/components/assistant/AssistantPageClient.tsx`

- [ ] **Step 1: Add voice to AssistantWidget**

In `src/components/AssistantWidget.tsx`:

**a) Add imports:**
```typescript
import { Sparkles, X, Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useVoice } from '@/hooks/useVoice'
```

**b) Add state inside the component (after existing state declarations):**
```typescript
const [voiceEnabled, setVoiceEnabled] = useState(false)
const { state: voiceState, supported: voiceSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
  onTranscript: (text) => {
    setInput(text)
    // Auto-submit after short delay to show the transcribed text
    setTimeout(() => {
      if (text.trim()) {
        const form = document.querySelector<HTMLFormElement>('[data-assistant-form]')
        form?.requestSubmit()
      }
    }, 300)
  },
  enabled: voiceEnabled,
})
```

**c) After each assistant message finishes loading, speak it (add after `setLoading(false)`):**
```typescript
// Inside the finally block after stream reading, before setLoading(false):
if (voiceEnabled && finalText) speak(finalText)
```

**d) Add `data-assistant-form` to the form element:**
```typescript
<form onSubmit={handleSubmit} data-assistant-form ...>
```

**e) Add voice toggle button and mic button to the composer area, after the Send button:**
```typescript
{/* Voice toggle */}
{voiceSupported && (
  <button
    type="button"
    onClick={() => { setVoiceEnabled(v => !v); stopSpeaking() }}
    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
      voiceEnabled
        ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400'
        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`}
    title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
  >
    {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
  </button>
)}
{voiceSupported && voiceEnabled && (
  <button
    type="button"
    onMouseDown={startListening}
    onMouseUp={stopListening}
    onTouchStart={startListening}
    onTouchEnd={stopListening}
    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
      voiceState === 'listening'
        ? 'animate-pulse bg-red-500 text-white'
        : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
    }`}
    title="Hold to speak"
  >
    {voiceState === 'listening' ? <MicOff size={16} /> : <Mic size={16} />}
  </button>
)}
```

- [ ] **Step 2: Add voice to AssistantPageClient**

In `src/components/assistant/AssistantPageClient.tsx`, apply the same pattern:

**a) Add imports:**
```typescript
import { Send, Plus, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useVoice } from '@/hooks/useVoice'
```

**b) Add voice state after existing state:**
```typescript
const [voiceEnabled, setVoiceEnabled] = useState(false)
const { state: voiceState, supported: voiceSupported, startListening, stopListening, speak, stopSpeaking } = useVoice({
  onTranscript: (text) => {
    setInput(text)
    setTimeout(() => {
      if (text.trim()) {
        const form = document.querySelector<HTMLFormElement>('[data-assistant-form]')
        form?.requestSubmit()
      }
    }, 300)
  },
  enabled: voiceEnabled,
})
```

**c) Add `data-assistant-form` attribute to the `<form>` element.**

**d) Speak final text when voice is enabled (in the `handleSubmit` try block after parsing the response):**
```typescript
if (voiceEnabled && finalText) speak(finalText)
```

**e) Add voice controls next to the Send button in the composer:**
```typescript
{voiceSupported && (
  <button
    type="button"
    onClick={() => { setVoiceEnabled(v => !v); stopSpeaking() }}
    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
      voiceEnabled
        ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`}
    title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
  >
    {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
  </button>
)}
{voiceSupported && voiceEnabled && (
  <button
    type="button"
    onMouseDown={startListening}
    onMouseUp={stopListening}
    onTouchStart={startListening}
    onTouchEnd={stopListening}
    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
      voiceState === 'listening'
        ? 'animate-pulse bg-red-500 text-white'
        : 'bg-gray-100 text-slate-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
    }`}
    title="Hold to speak"
  >
    {voiceState === 'listening' ? <MicOff size={18} /> : <Mic size={18} />}
  </button>
)}
```

- [ ] **Step 3: Final build check**

```bash
pnpm run build
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AssistantWidget.tsx src/components/assistant/AssistantPageClient.tsx
git commit -m "handover: C12 voice mode — STT mic + TTS speaker — Group 3 complete"
```

---

## Final verification

After all tasks complete:

- [ ] `pnpm run build` — must be clean
- [ ] Manual smoke — start `pnpm dev`, log in as `demo.manager@vividex.au`:
  - Open floating widgets: confirm Sparkles button + MessageSquare button stacked bottom-right
  - Open AI assistant widget: ask "what tasks do I have?" — assistant should fetch and summarise tasks
  - Ask it to create a task — confirmation card should appear, confirm it, task should be created
  - Open team chat widget: conversation list loads, can send a message
  - Navigate to `/dashboard/assistant` — full page with session sidebar
  - Enable voice mode (Volume icon) — hold mic button, speak a message, assistant responds aloud
  - Check `/dashboard/assistant` in nav sidebar
- [ ] `git push origin master`

---

## GOALS.md update

Add Phase 13 to `GOALS.md` after Phase 12:

```markdown
## Phase 13 — AI Assistant
> Goal: A capable AI agent embedded throughout the app that can read platform data, take actions with user confirmation, and respond to voice.

- [x] 13.1 — Tool use — reads tasks, projects, clients, time entries, expenses, leave, calendar, team via Anthropic function calling
- [x] 13.2 — Write actions — create/update tasks, projects, clients, time entries, expenses, calendar events, leave requests; all with confirmation card
- [x] 13.3 — Full-page assistant at /dashboard/assistant with persistent conversation sessions
- [x] 13.4 — Floating widget stack — AI assistant (Sparkles) + team chat (MessageSquare) stacked bottom-right, mutually exclusive
- [x] 13.5 — Team chat floating widget — mini chat drawer using existing ChatRealtimeProvider
- [x] 13.6 — Voice mode — browser-native STT (SpeechRecognition) + TTS (SpeechSynthesis); hold-to-talk mic + speaker toggle
```
