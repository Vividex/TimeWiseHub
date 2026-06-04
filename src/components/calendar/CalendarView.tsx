'use client'

import { useState } from 'react'
import EventForm from './EventForm'
import DayPanel from './DayPanel'

type CalEvent = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; description: string | null; org_id: string | null; created_by: string }
type Project  = { id: string; name: string; colour: string; due_date: string }
type Task     = { id: string; title: string; due_date: string; priority: string; status: string; project_id: string }

export type CalendarItem = {
  key: string
  date: string
  label: string
  type: 'event' | 'project' | 'task'
  colour: string
  priority?: string
  id: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COLOURS: Record<string, string> = { urgent: '#dc2626', high: '#ea580c', normal: '#2563eb', low: '#6b7280' }

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function buildItems(events: CalEvent[], projects: Project[], tasks: Task[]): CalendarItem[] {
  const items: CalendarItem[] = []
  events.forEach(e => items.push({ key: `e-${e.id}`, date: e.start_at.slice(0, 10), label: e.title, type: 'event', colour: '#7c3aed', id: e.id }))
  projects.forEach(p => items.push({ key: `p-${p.id}`, date: p.due_date, label: p.name, type: 'project', colour: p.colour, id: p.id }))
  tasks.forEach(t => items.push({ key: `t-${t.id}`, date: t.due_date, label: t.title, type: 'task', colour: PRIORITY_COLOURS[t.priority] ?? '#2563eb', priority: t.priority, id: t.id }))
  return items
}

export default function CalendarView({ userId, orgId, initialEvents, projects, tasks }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
}) {
  const [events, setEvents] = useState(initialEvents)
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')

  const year  = current.getFullYear()
  const month = current.getMonth()

  // Build grid — weeks starting Monday
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    return dayNum >= 1 && dayNum <= daysInMonth ? new Date(year, month, dayNum) : null
  })

  const items = buildItems(events, projects, tasks)
  const byDate: Record<string, CalendarItem[]> = {}
  items.forEach(item => { (byDate[item.date] ??= []).push(item) })

  const today = toDateStr(new Date())

  function prevMonth() { setCurrent(new Date(year, month - 1, 1)); setSelected(null) }
  function nextMonth() { setCurrent(new Date(year, month + 1, 1)); setSelected(null) }

  function openNewEvent(dateStr: string) {
    setFormDate(dateStr)
    setShowForm(true)
  }

  return (
    <div className="space-y-4">

      {/* Month navigation */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <button onClick={prevMonth} className="rounded-xl bg-gray-50 px-3 py-2 text-xl font-bold text-gray-500 transition-colors hover:bg-cyan-50 hover:text-cyan-600">‹</button>
        <h2 className="text-xl font-bold text-gray-900">
          {current.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={nextMonth} className="rounded-xl bg-gray-50 px-3 py-2 text-xl font-bold text-gray-500 transition-colors hover:bg-cyan-50 hover:text-cyan-600">›</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-500">{d}</div>
          ))}
        </div>

        {/* Day cells */}
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

      {/* Day detail panel */}
      {selected && (
        <DayPanel
          date={selected}
          items={byDate[selected] ?? []}
          onAddEvent={() => openNewEvent(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Event form */}
      {showForm && (
        <EventForm
          userId={userId}
          orgId={orgId}
          initialDate={formDate}
          onSave={newEvent => { setEvents(prev => [...prev, newEvent]); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Add event button */}
      {!showForm && (
        <button onClick={() => openNewEvent(today)}
          className="w-full rounded-2xl border border-gray-100 bg-cyan-500 p-4 text-left text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-600">
          + Add event
        </button>
      )}
    </div>
  )
}

