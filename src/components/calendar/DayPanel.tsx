'use client'

import type { CalendarItem } from './CalendarView'

const TYPE_LABELS: Record<string, string> = { event: 'Event', project: 'Project deadline', task: 'Task due' }

export default function DayPanel({ date, items, onAddEvent, onClose }: {
  date: string
  items: CalendarItem[]
  onAddEvent: () => void
  onClose: () => void
}) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900">{formatted}</h3>
        <button onClick={onClose} className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">x</button>
      </div>

      {items.length === 0 ? (
        <p className="mb-4 text-sm font-semibold text-gray-500">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {items.map(item => (
            <li key={item.key} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colour }} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-xs font-medium text-gray-500">{TYPE_LABELS[item.type]}{item.priority ? ` · ${item.priority}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button onClick={onAddEvent}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
        + Add event on this day
      </button>
    </div>
  )
}
