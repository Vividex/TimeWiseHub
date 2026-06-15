// src/lib/assistant/tools.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const READ_TOOLS = new Set([
  'get_tasks', 'get_projects', 'get_clients', 'get_time_entries',
  'get_expenses', 'get_team_members', 'get_leave_requests',
  'get_calendar_events', 'get_summary',
  'get_sessions', 'get_progress_notes', 'get_invoices',
])

export const WRITE_TOOLS = new Set([
  'create_task', 'update_task', 'create_project', 'update_project',
  'create_client', 'update_client', 'create_time_entry', 'start_timer',
  'stop_timer', 'create_expense', 'create_calendar_event', 'create_leave_request',
  'create_session', 'update_session', 'add_session_todo', 'check_session_todo', 'add_progress_note',
  'create_quote',
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
        address: { type: 'string', description: 'Street address including suburb/postcode' },
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
        address: { type: 'string', description: 'Street address including suburb/postcode' },
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

  // ── Session read tools ───────────────────────────────────────
  {
    name: 'get_sessions',
    description: 'Fetch sessions for a client. Filter by upcoming, past, or all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID (required)' },
        filter: { type: 'string', enum: ['upcoming', 'past', 'all'], description: 'Default: upcoming' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'get_progress_notes',
    description: 'Fetch all progress notes for a client, newest first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID (required)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['client_id'],
    },
  },

  // ── Session write tools (require confirmation) ───────────────
  {
    name: 'create_session',
    description: 'Propose creating a session for a client. Pre-populates the to-do list from the client\'s saved template if one exists. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        title: { type: 'string', description: 'Session title e.g. Weekly check-in' },
        scheduled_at: { type: 'string', description: 'ISO datetime (YYYY-MM-DDTHH:MM:SS). For "now" use the current datetime from the system prompt exactly.' },
        duration_minutes: { type: 'number', description: 'Duration in minutes (default 60)' },
      },
      required: ['client_id', 'title', 'scheduled_at'],
    },
  },
  {
    name: 'update_session',
    description: 'Propose updating a session (title, time, duration, or status). Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        title: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO datetime' },
        duration_minutes: { type: 'number' },
        status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'add_session_todo',
    description: 'Propose adding a to-do item to a session checklist. Appended to the end. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        title: { type: 'string', description: 'To-do item text' },
      },
      required: ['session_id', 'title'],
    },
  },
  {
    name: 'check_session_todo',
    description: 'Propose checking or unchecking a to-do item in a session. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        todo_id: { type: 'string', description: 'session_todos UUID' },
        completed: { type: 'boolean', description: 'true to check, false to uncheck' },
      },
      required: ['todo_id', 'completed'],
    },
  },
  {
    name: 'add_progress_note',
    description: "Propose adding a timestamped progress note to a client's record. Will show a confirmation card.",
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        body: { type: 'string', description: 'Note text' },
      },
      required: ['client_id', 'body'],
    },
  },

  // ── Invoice / Quote tools ────────────────────────────────────
  {
    name: 'get_invoices',
    description: 'Fetch invoices or quotes the user can see. Use to look up existing documents for context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Filter by client UUID' },
        type: { type: 'string', enum: ['quote', 'invoice', 'all'], description: 'quote = status quote only, invoice = all non-quote statuses, all = everything. Default: all' },
        status: { type: 'string', enum: ['quote', 'draft', 'sent', 'paid', 'overdue', 'cancelled', 'pending_approval'], description: 'Filter by exact status (overrides type)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'create_quote',
    description: 'Propose creating a new quote with professional line items. Write polished, specific descriptions for each item — not vague labels. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        items: {
          type: 'array' as const,
          description: 'Line items for the quote. Descriptions must be professional and specific — describe scope, trade, duration, inclusions.',
          items: {
            type: 'object' as const,
            properties: {
              description: { type: 'string', description: 'Professional description. E.g. "Builder — framing, roof structure and wall cladding, estimated 5 days labour".' },
              quantity: { type: 'number', description: 'Quantity (default 1). Use days or hours for labour.' },
              unit_price: { type: 'number', description: 'Price per unit. Set to 0 when the user has asked not to price individual items — use the top-level total field instead.' },
            },
            required: ['description'],
          },
        },
        total: { type: 'number', description: 'Fixed total for the whole quote. Use this when the user specifies a lump-sum price and does not want individual items priced. When set, it overrides the sum of item unit_prices.' },
        currency: { type: 'string', description: 'Currency code e.g. AUD, USD. Default: AUD' },
        due_date: { type: 'string', description: 'Quote expiry date ISO (YYYY-MM-DD). Suggest 30 days from today if not specified.' },
        notes: { type: 'string', description: 'Payment terms including deposit amount/percentage, balance due date, and quote validity period. Write this professionally.' },
      },
      required: ['client_id', 'items'],
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

    case 'get_sessions': {
      const clientId = input.client_id as string
      const filter = (input.filter as string) ?? 'upcoming'
      let q = supabase
        .from('sessions')
        .select('id, title, scheduled_at, duration_minutes, status, client_id, clients(name), session_todos(id, title, completed, position)')
        .eq('client_id', clientId)
        .order('scheduled_at', { ascending: filter !== 'past' })
        .limit(20)
      if (filter === 'upcoming') q = q.neq('status', 'completed')
      if (filter === 'past') q = q.eq('status', 'completed')
      const { data } = await q
      return data ?? []
    }

    case 'get_progress_notes': {
      const clientId = input.client_id as string
      const { data } = await supabase
        .from('progress_notes')
        .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(Number(input.limit ?? 20))
      return data ?? []
    }

    case 'get_invoices': {
      let q = supabase
        .from('invoices')
        .select('id, invoice_number, status, issue_date, due_date, subtotal, currency, notes, clients(name)')
        .order('created_at', { ascending: false })
        .limit(Number(input.limit ?? 10))
      if (input.client_id) q = q.eq('client_id', input.client_id as string)
      if (input.status) {
        q = q.eq('status', input.status as string)
      } else if (input.type === 'quote') {
        q = q.eq('status', 'quote')
      } else if (input.type === 'invoice') {
        q = q.neq('status', 'quote')
      }
      const { data } = await q
      return data ?? []
    }

    default:
      return { error: `Unknown read tool: ${name}` }
  }
}
