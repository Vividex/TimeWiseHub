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
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">{formatted}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {items.map(item => (
            <li key={item.key} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colour }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{item.label}</p>
                <p className="text-xs text-gray-400">{TYPE_LABELS[item.type]}{item.priority ? ` · ${item.priority}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button onClick={onAddEvent}
        className="text-sm text-blue-600 font-medium hover:underline">
        + Add event on this day
      </button>
    </div>
  )
}
