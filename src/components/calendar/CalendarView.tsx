'use client'

import { useState } from 'react'
import EventForm from './EventForm'
import DayPanel from './DayPanel'

type CalEvent     = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; description: string | null; org_id: string | null; created_by: string }
type Project      = { id: string; name: string; colour: string; due_date: string }
type Task         = { id: string; title: string; due_date: string; priority: string; status: string; project_id: string }
type LeaveRequest = { id: string; leave_type: string; start_date: string; end_date: string; half_day: boolean; user_id: string; holiday_name?: string }
type Session = { id: string; title: string; scheduled_at: string; status: string; client_id: string }

export type CalendarItem = {
  key: string
  date: string
  label: string
  type: 'event' | 'project' | 'task' | 'leave' | 'session'
  colour: string
  priority?: string
  id: string
  description?: string | null
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  clientId?: string
}

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave',
  public_holiday: 'Public holiday', unpaid: 'Unpaid leave', other: 'Leave',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COLOURS: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', normal: '#2563eb', low: '#6b7280' }

const TYPE_LABELS: Record<CalendarItem['type'], string> = {
  event: 'Event', project: 'Project', task: 'Task', leave: 'Leave', session: 'Session',
}

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

function agendaDateLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  const todayDate = new Date(today + 'T00:00:00')
  const tomorrow = new Date(todayDate); tomorrow.setDate(todayDate.getDate() + 1)
  if (dateStr === toDateStr(tomorrow)) return 'Tomorrow'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function buildItems(events: CalEvent[], projects: Project[], tasks: Task[], leaveRequests: LeaveRequest[], sessions: Session[] = []): CalendarItem[] {
  const items: CalendarItem[] = []
  events.forEach(e => items.push({
    key: `e-${e.id}`,
    date: e.start_at.slice(0, 10),
    label: e.title,
    type: 'event',
    colour: '#7c3aed',
    id: e.id,
    description: e.description,
    startTime: e.all_day ? null : e.start_at,
    endTime: e.all_day ? null : e.end_at,
    allDay: e.all_day,
  }))
  projects.forEach(p => items.push({ key: `p-${p.id}`, date: p.due_date, label: p.name, type: 'project', colour: p.colour, id: p.id }))
  tasks.forEach(t => items.push({ key: `t-${t.id}`, date: t.due_date, label: t.title, type: 'task', colour: PRIORITY_COLOURS[t.priority] ?? '#2563eb', priority: t.priority, id: t.id }))

  leaveRequests.forEach(l => {
    const cur = new Date(l.start_date + 'T00:00:00')
    const end = new Date(l.end_date + 'T00:00:00')
    let i = 0
    while (cur <= end) {
      const dateStr = toDateStr(cur)
      items.push({
        key: `l-${l.id}-${i}`,
        date: dateStr,
        label: l.holiday_name ?? LEAVE_LABELS[l.leave_type] ?? 'Leave',
        type: 'leave',
        colour: '#f59e0b',
        id: l.id,
        description: l.half_day ? 'Half day' : undefined,
      })
      cur.setDate(cur.getDate() + 1)
      i++
    }
  })

  sessions.forEach(s => items.push({
    key: `s-${s.id}`,
    date: s.scheduled_at.slice(0, 10),
    label: s.title,
    type: 'session',
    colour: '#0891b2',
    id: s.id,
    clientId: s.client_id,
    startTime: s.scheduled_at,
  }))

  return items
}

export default function CalendarView({ userId, orgId, initialEvents, projects, tasks, leaveRequests = [], sessions = [] }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
  leaveRequests?: LeaveRequest[]
  sessions?: Session[]
}) {
  const [events, setEvents] = useState(initialEvents)
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')

  const year  = current.getFullYear()
  const month = current.getMonth()

  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    return dayNum >= 1 && dayNum <= daysInMonth ? new Date(year, month, dayNum) : null
  })

  const items = buildItems(events, projects, tasks, leaveRequests, sessions)
  const byDate: Record<string, CalendarItem[]> = {}
  items.forEach(item => { (byDate[item.date] ??= []).push(item) })

  const today = toDateStr(new Date())

  function prevMonth() { setCurrent(new Date(year, month - 1, 1)); setSelected(null) }
  function nextMonth() { setCurrent(new Date(year, month + 1, 1)); setSelected(null) }

  function openNewEvent(dateStr: string) {
    setFormDate(dateStr)
    setShowForm(true)
  }

  // Mobile agenda — all dates in current month that have items, sorted
  function AgendaView() {
    const sortedDates = Object.keys(byDate)
      .filter(dateStr => {
        const d = new Date(dateStr + 'T00:00:00')
        return d.getFullYear() === year && d.getMonth() === month
      })
      .sort()

    if (sortedDates.length === 0) {
      return (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">Nothing scheduled this month</p>
        </div>
      )
    }

    return (
      <div className="space-y-5">
        {sortedDates.map(dateStr => {
          const isToday = dateStr === today
          const isSelected = dateStr === selected
          const dayItems = byDate[dateStr] ?? []
          return (
            <div key={dateStr}>
              <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${isToday ? 'text-cyan-600' : 'text-gray-400'}`}>
                {agendaDateLabel(dateStr, today)}
              </p>
              <div className="space-y-2">
                {dayItems.map(item => (
                  <button
                    key={item.key}
                    onClick={() => setSelected(isSelected ? null : dateStr)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-gray-200"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.colour }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.label}</p>
                      {item.startTime && (
                        <p className="text-xs text-gray-400">{formatTime(item.startTime)}</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-gray-400">{item.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: item.colour }}>
                      {TYPE_LABELS[item.type]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Month navigation — shared */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <button onClick={prevMonth} className="rounded-xl bg-gray-50 px-3 py-2 text-xl font-bold text-gray-500 transition-colors hover:bg-cyan-50 hover:text-cyan-600">‹</button>
        <h2 className="text-xl font-bold text-gray-900">
          {current.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={nextMonth} className="rounded-xl bg-gray-50 px-3 py-2 text-xl font-bold text-gray-500 transition-colors hover:bg-cyan-50 hover:text-cyan-600">›</button>
      </div>

      {/* Mobile: agenda list */}
      <div className="md:hidden">
        <AgendaView />
      </div>

      {/* Desktop: month grid */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              const dateStr = date ? toDateStr(date) : ''
              const dayItems = date ? (byDate[dateStr] ?? []) : []
              const isToday = dateStr === today
              const isSelected = dateStr === selected
              return (
                <div key={i}
                  onClick={() => date && setSelected(isSelected ? null : dateStr)}
                  className={`min-h-[96px] cursor-pointer border-b border-r border-gray-100 p-2 transition-colors ${
                    !date ? 'bg-gray-50' : isSelected ? 'bg-cyan-50' : 'hover:bg-gray-50'
                  }`}>
                  {date && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          isToday ? 'bg-cyan-500 text-white' : 'text-gray-700'
                        }`}>
                          {date.getDate()}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map(item => (
                          <div key={item.key} className="truncate rounded-xl px-2 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: item.colour }}>
                            {item.label}
                          </div>
                        ))}
                        {dayItems.length > 3 && (
                          <div className="pl-1 text-xs font-semibold text-gray-500">+{dayItems.length - 3} more</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day detail panel — shared */}
      {selected && (
        <DayPanel
          date={selected}
          items={byDate[selected] ?? []}
          onAddEvent={() => openNewEvent(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Event form — shared */}
      {showForm && (
        <EventForm
          userId={userId}
          orgId={orgId}
          initialDate={formDate}
          onSave={newEvent => { setEvents(prev => [...prev, newEvent]); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Add event button — shared */}
      {!showForm && (
        <button onClick={() => openNewEvent(today)}
          className="w-full rounded-2xl border border-gray-100 bg-gradient-to-b from-cyan-500 to-cyan-600 p-4 text-left text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
          + Add event
        </button>
      )}
    </div>
  )
}
