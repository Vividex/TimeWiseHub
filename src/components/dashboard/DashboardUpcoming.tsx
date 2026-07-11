'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Video, Clock3, CheckSquare, Receipt, MessageCircle, DollarSign, Building2, Car, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { daysUntil, markExpenseCyclePaid, type RecurrenceInterval } from '@/lib/expenses'

export type UpcomingMeeting  = { id: string; title: string; starts_at: string }
export type UpcomingEvent    = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean }
export type UpcomingSession  = { id: string; title: string; scheduled_at: string; client_id: string; client_name: string; meeting_id: string | null }
export type UpcomingTask     = { id: string; title: string; due_date: string; project_name: string | null }
export type UpcomingApproval = { id: string; title: string; submitter_name: string; amount: string }
export type UnreadClientMessage = { client_id: string; client_name: string; preview: string }
export type UpcomingDueExpense = {
  id: string
  org_id: string | null
  user_id: string
  category_id: string | null
  description: string | null
  amount: number
  currency: string
  recurrence_interval: RecurrenceInterval
  next_billing_date: string
  is_business: boolean
}
export type UpcomingVehicleDue = {
  id: string
  registration_number: string
  kind: 'rego' | 'service'
  daysUntilDue: number
}

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
}

type TimedItem =
  | { id: string; title: string; time: string; kind: 'meeting' }
  | { id: string; title: string; time: string; kind: 'event'; allDay: boolean }
  | { id: string; title: string; time: string; kind: 'session'; clientId: string; meetingId: string | null }

export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
  approvals,
  unreadMessages,
  dueExpenses,
  dueBusinessExpenses,
  vehiclesDue,
  currentUserId,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
  approvals: UpcomingApproval[]
  unreadMessages: UnreadClientMessage[]
  dueExpenses: UpcomingDueExpense[]
  dueBusinessExpenses: UpcomingDueExpense[]
  vehiclesDue: UpcomingVehicleDue[]
  currentUserId: string
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [payingId, setPayingId] = useState<string | null>(null)

  const timedItems: TimedItem[] = [
    ...meetings.map(m => ({ id: m.id, title: m.title, time: m.starts_at, kind: 'meeting' as const })),
    ...events.map(e => ({ id: e.id, title: e.title, time: e.start_at, kind: 'event' as const, allDay: e.all_day })),
    ...sessions.map(s => ({ id: s.id, title: `${s.title} — ${s.client_name}`, time: s.scheduled_at, clientId: s.client_id, meetingId: s.meeting_id, kind: 'session' as const })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  const visibleTasks = tasks.filter(t => !doneIds.has(t.id))
  const visibleDueExpenses = dueExpenses.filter(e => !paidIds.has(e.id))
  const visibleDueBusinessExpenses = dueBusinessExpenses.filter(e => !paidIds.has(e.id))
  const todayStartOfDay = new Date()
  todayStartOfDay.setHours(0, 0, 0, 0)

  async function markDone(taskId: string) {
    setDoneIds(prev => new Set(prev).add(taskId))
    const supabase = createClient()
    await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId)
  }

  async function markExpensePaid(expense: UpcomingDueExpense) {
    setPayingId(expense.id)
    const supabase = createClient()
    const { error } = await markExpenseCyclePaid(supabase, expense, currentUserId)
    setPayingId(null)
    if (!error) setPaidIds(prev => new Set(prev).add(expense.id))
  }

  if (timedItems.length === 0 && visibleTasks.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Today</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visibleTasks.map((task, i) => {
          const overdue = new Date(task.due_date) < todayStartOfDay
          const isLast = i === visibleTasks.length - 1 && visibleDueExpenses.length === 0 && visibleDueBusinessExpenses.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <div
              key={`task-${task.id}`}
              className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <button
                onClick={() => markDone(task.id)}
                title="Mark done"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 transition-colors hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400"
              >
                <CheckSquare size={15} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{task.title}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {task.project_name ? `${task.project_name} — ` : ''}Due {fmtDueDate(task.due_date)}
                </p>
              </div>
              {overdue && (
                <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  Overdue
                </span>
              )}
            </div>
          )
        })}
        {visibleDueExpenses.map((expense, i) => {
          const days = daysUntil(expense.next_billing_date)
          const dueLabel = days === 0 ? 'Due today' : days < 0 ? 'Overdue' : `Due in ${days}d`
          const urgency = days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === visibleDueExpenses.length - 1 && visibleDueBusinessExpenses.length === 0 && vehiclesDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <div
              key={`expense-${expense.id}`}
              className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400">
                <DollarSign size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {expense.description || 'Recurring expense'}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {expense.currency} {expense.amount.toFixed(2)} — <span className={`font-bold ${urgency}`}>{dueLabel}</span>
                </p>
              </div>
              <button
                onClick={() => markExpensePaid(expense)}
                disabled={payingId === expense.id}
                className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {payingId === expense.id ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          )
        })}
        {visibleDueBusinessExpenses.map((expense, i) => {
          const days = daysUntil(expense.next_billing_date)
          const dueLabel = days === 0 ? 'Due today' : days < 0 ? 'Overdue' : `Due in ${days}d`
          const urgency = days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === visibleDueBusinessExpenses.length - 1 && vehiclesDue.length === 0 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <div
              key={`business-expense-${expense.id}`}
              className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400">
                <Building2 size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {expense.description || 'Business expense'}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  Business — {expense.currency} {expense.amount.toFixed(2)} — <span className={`font-bold ${urgency}`}>{dueLabel}</span>
                </p>
              </div>
              <button
                onClick={() => markExpensePaid(expense)}
                disabled={payingId === expense.id}
                className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {payingId === expense.id ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          )
        })}
        {vehiclesDue.map((item, i) => {
          const dueLabel = item.daysUntilDue <= 0 ? 'Overdue' : `Due in ${item.daysUntilDue}d`
          const urgency = item.daysUntilDue <= 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          const isLast = i === vehiclesDue.length - 1 && approvals.length === 0 && unreadMessages.length === 0 && timedItems.length === 0
          return (
            <Link
              key={`vehicle-${item.kind}-${item.id}`}
              href={`/dashboard/expenses/vehicles/${item.id}`}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                {item.kind === 'rego' ? <Car size={15} /> : <Wrench size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {item.registration_number} — {item.kind === 'rego' ? 'Registration renewal' : 'Service due'}
                </p>
                <p className={`text-xs font-bold ${urgency}`}>{dueLabel}</p>
              </div>
            </Link>
          )
        })}
        {approvals.map((approval, i) => (
          <Link
            key={`approval-${approval.id}`}
            href={`/dashboard/invoices/${approval.id}`}
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${i < approvals.length - 1 || unreadMessages.length > 0 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <Receipt size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{approval.title}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500">{approval.submitter_name} — {approval.amount}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              Approve
            </span>
          </Link>
        ))}
        {unreadMessages.map((msg, i) => (
          <Link
            key={`unread-${msg.client_id}`}
            href={`/dashboard/clients/${msg.client_id}/messages`}
            className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${i < unreadMessages.length - 1 || timedItems.length > 0 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              <MessageCircle size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{msg.client_name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-slate-500">{msg.preview}</p>
            </div>
            <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              Unread
            </span>
          </Link>
        ))}
        {timedItems.map((item, i) => (
          <div
            key={`${item.kind}-${item.id}`}
            className={`flex items-center gap-4 px-5 py-4 ${i < timedItems.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              item.kind === 'meeting'
                ? 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400'
                : item.kind === 'session'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400'
            }`}>
              {item.kind === 'meeting' ? <Video size={15} /> : item.kind === 'session' ? <Clock3 size={15} /> : <Calendar size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500">
                {fmtTime(item.time, item.kind === 'event' ? item.allDay : false)}
              </p>
            </div>
            {item.kind === 'meeting' && (
              <Link
                href={`/dashboard/video/${item.id}`}
                className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
              >
                Join
              </Link>
            )}
            {item.kind === 'session' && (
              <div className="flex shrink-0 items-center gap-2">
                {item.meetingId && (
                  <Link
                    href={`/dashboard/video/${item.meetingId}`}
                    className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
                  >
                    Join
                  </Link>
                )}
                <Link
                  href={`/dashboard/clients/${item.clientId}/sessions/${item.id}`}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
                >
                  View
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
