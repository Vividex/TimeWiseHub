import type { SupabaseClient } from '@supabase/supabase-js'

type NotificationPreferences = {
  deadline_alerts?: boolean
  priority_nudges?: boolean
  daily_digest?: boolean
  idle_alerts?: boolean
}

type Profile = {
  id: string
  email: string
  full_name: string | null
  notification_preferences: NotificationPreferences | null
}

type Email = {
  to: string
  subject: string
  text: string
  html: string
}

type ReviewKind = 'leave' | 'expense' | 'timesheet'

const APP_NAME = 'TimeWiseHub'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function paragraph(lines: string[]) {
  return lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function normaliseProfile(profile: unknown): Profile | null {
  if (!profile || typeof profile !== 'object') return null
  if (Array.isArray(profile)) return normaliseProfile(profile[0])
  return profile as Profile
}

function greeting(profile: Profile) {
  return profile.full_name?.trim() || profile.email
}

function isEnabled(profile: Profile, key: keyof NotificationPreferences) {
  return profile.notification_preferences?.[key] !== false
}

export async function sendEmail({ to, subject, text, html }: Email) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.info(`Email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured. Subject: ${subject}`)
    return { skipped: true }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend email failed: ${response.status} ${body}`)
  }

  return response.json()
}

export async function sendReviewNotification(
  service: SupabaseClient,
  kind: ReviewKind,
  id: string,
  reviewerId: string
) {
  const table = kind === 'leave' ? 'leave_requests' : kind === 'expense' ? 'expenses' : 'timesheets'
  const select = kind === 'leave'
    ? 'id, user_id, org_id, leave_type, start_date, end_date, half_day, status, review_note, profiles(email, full_name, notification_preferences)'
    : kind === 'expense'
      ? 'id, user_id, org_id, amount, currency, description, expense_date, status, review_note, profiles(email, full_name, notification_preferences)'
      : 'id, user_id, org_id, week_start, total_seconds, status, review_note, profiles(email, full_name, notification_preferences)'

  // Dynamic notification lookups span three tables with different shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: record, error } = await (service as any).from(table).select(select).eq('id', id).single()
  if (error || !record) throw new Error(`${kind} record not found`)

  const orgId = (record as unknown as { org_id: string | null }).org_id
  if (orgId) {
    const { data: membership } = await service
      .from('organisation_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', reviewerId)
      .in('role', ['owner', 'admin', 'manager'])
      .maybeSingle()

    if (!membership) throw new Error('Forbidden')
  }

  const profile = normaliseProfile((record as unknown as { profiles?: unknown }).profiles)
  if (!profile?.email) throw new Error('Recipient email not found')

  const status = (record as unknown as { status: string }).status
  if (status !== 'approved' && status !== 'rejected') return { skipped: true }

  const name = greeting(profile)
  const reviewNote = (record as unknown as { review_note?: string | null }).review_note
  const action = status === 'approved' ? 'approved' : 'rejected'

  let subject = ''
  let lines: string[] = []

  if (kind === 'leave') {
    const leave = record as unknown as { leave_type: string; start_date: string; end_date: string; half_day: boolean }
    subject = `Your leave request was ${action}`
    lines = [
      `Hi ${name},`,
      `Your ${leave.leave_type.replaceAll('_', ' ')} leave request for ${formatDate(leave.start_date)}${leave.start_date !== leave.end_date ? ` to ${formatDate(leave.end_date)}` : ''}${leave.half_day ? ' (half day)' : ''} was ${action}.`,
    ]
  } else if (kind === 'expense') {
    const expense = record as unknown as { amount: number; currency: string; description: string | null; expense_date: string }
    subject = `Your expense was ${action}`
    lines = [
      `Hi ${name},`,
      `Your ${expense.currency} ${Number(expense.amount).toFixed(2)} expense from ${formatDate(expense.expense_date)} was ${action}.`,
      expense.description ? `Description: ${expense.description}` : '',
    ].filter(Boolean)
  } else {
    const timesheet = record as unknown as { week_start: string; total_seconds: number }
    subject = `Your timesheet was ${action}`
    lines = [
      `Hi ${name},`,
      `Your timesheet for the week starting ${formatDate(timesheet.week_start)} was ${action}.`,
      `Submitted total: ${formatDuration(timesheet.total_seconds)}.`,
    ]
  }

  if (reviewNote) lines.push(`Review note: ${reviewNote}`)
  lines.push(`Open ${APP_NAME}: ${APP_URL}/dashboard/${kind === 'expense' ? 'expenses' : kind === 'leave' ? 'leave' : 'time'}`)

  return sendEmail({
    to: profile.email,
    subject,
    text: lines.join('\n\n'),
    html: paragraph(lines),
  })
}

export async function sendDailyDigest(service: SupabaseClient, profile: Profile, today: string, tomorrow: string) {
  if (!profile.email || !isEnabled(profile, 'daily_digest')) return { skipped: true }

  const [{ data: tasks }, { data: priorityTasks }, { data: todayTime }] = await Promise.all([
    service
      .from('tasks')
      .select('title, due_date, priority')
      .eq('assignee_id', profile.id)
      .in('status', ['todo', 'in_progress'])
      .lte('due_date', tomorrow)
      .order('due_date', { ascending: true })
      .limit(10),
    service
      .from('tasks')
      .select('title')
      .eq('assignee_id', profile.id)
      .eq('status', 'todo')
      .in('priority', ['urgent', 'high'])
      .limit(5),
    service
      .from('time_entries')
      .select('id')
      .eq('user_id', profile.id)
      .gte('started_at', `${today}T00:00:00`)
      .limit(1),
  ])

  const lines = [`Hi ${greeting(profile)},`, `Here is your ${APP_NAME} digest for ${formatDate(today)}.`]

  if (tasks?.length) {
    lines.push('Due soon:')
    tasks.forEach(task => lines.push(`- ${task.title} (${task.due_date ? formatDate(task.due_date) : 'no date'}, ${task.priority})`))
  } else {
    lines.push('No tasks are due today or tomorrow.')
  }

  if (priorityTasks?.length) {
    lines.push('Priority queue:')
    priorityTasks.forEach(task => lines.push(`- ${task.title}`))
  }

  if (!todayTime?.length && isEnabled(profile, 'idle_alerts')) {
    lines.push('No time has been logged today yet.')
  }

  lines.push(`Open your dashboard: ${APP_URL}/dashboard`)

  return sendEmail({
    to: profile.email,
    subject: `${APP_NAME} daily digest`,
    text: lines.join('\n'),
    html: paragraph(lines),
  })
}

export async function sendTimesheetDueReminder(
  service: SupabaseClient,
  profile: Profile,
  weekStart: string
) {
  if (!profile.email || !isEnabled(profile, 'deadline_alerts')) return { skipped: true }

  const { data: timesheet } = await service
    .from('timesheets')
    .select('id')
    .eq('user_id', profile.id)
    .eq('week_start', weekStart)
    .in('status', ['submitted', 'approved'])
    .maybeSingle()

  if (timesheet) return { skipped: true }

  const lines = [
    `Hi ${greeting(profile)},`,
    `Your timesheet for the week starting ${formatDate(weekStart)} is due.`,
    `Open time tracking: ${APP_URL}/dashboard/time`,
  ]

  return sendEmail({
    to: profile.email,
    subject: 'Timesheet due reminder',
    text: lines.join('\n\n'),
    html: paragraph(lines),
  })
}
