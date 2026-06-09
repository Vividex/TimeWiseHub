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
    description: "List all members of the user's organisation with their roles.",
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
    description: "Get a rolled-up snapshot: overdue tasks, upcoming deadlines (3 days), today's logged hours, active timer. Call this at the start of every new session.",
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
