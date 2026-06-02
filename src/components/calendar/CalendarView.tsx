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
  projects.forEach(p => items.push({ key: `p-${p.id}`, date: p.due_date, label: `📁 ${p.name}`, type: 'project', colour: p.colour, id: p.id }))
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
      <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
        <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 text-xl px-2">‹</button>
        <h2 className="text-base font-semibold text-gray-900">
          {current.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 text-xl px-2">›</button>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
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
                className={`min-h-[80px] p-1.5 border-b border-r border-gray-50 cursor-pointer transition-colors ${
                  !date ? 'bg-gray-50' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                {date && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                      }`}>
                        {date.getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 3).map(item => (
                        <div key={item.key} className="text-xs px-1 py-0.5 rounded truncate text-white font-medium"
                          style={{ backgroundColor: item.colour }}>
                          {item.label}
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <div className="text-xs text-gray-400 pl-1">+{dayItems.length - 3} more</div>
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
          className="w-full bg-white rounded-2xl shadow p-4 text-sm text-blue-600 font-semibold hover:shadow-md transition-shadow text-left">
          + Add event
        </button>
      )}
    </div>
  )
}
