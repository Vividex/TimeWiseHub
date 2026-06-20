'use client'

import type { QuietHours } from '@/lib/chat/types'

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' },
]

export default function QuietHoursSettings({
  chatEnabled,
  quietHours,
  onChatEnabledChange,
  onQuietHoursChange,
}: {
  chatEnabled: boolean
  quietHours: QuietHours
  onChatEnabledChange: (v: boolean) => void
  onQuietHoursChange: (q: QuietHours) => void
}) {
  function toggleDay(day: number) {
    const days = quietHours.days.includes(day)
      ? quietHours.days.filter(d => d !== day)
      : [...quietHours.days, day].sort((a, b) => a - b)
    onQuietHoursChange({ ...quietHours, days })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Chat notifications</h2>
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
          Messages always arrive in the app. These settings only control push notifications.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Push for new messages</p>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Notify me when I receive a chat message and I&apos;m not viewing it.</p>
        </div>
        <button
          type="button"
          onClick={() => onChatEnabledChange(!chatEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${chatEnabled ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-slate-700'}`}
        >
          <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${chatEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Quiet hours</p>
            <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Only push during my working hours. Outside them, on leave, and on public holidays, messages wait quietly.</p>
          </div>
          <button
            type="button"
            onClick={() => onQuietHoursChange({ ...quietHours, enabled: !quietHours.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${quietHours.enabled ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-slate-700'}`}
          >
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${quietHours.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {quietHours.enabled && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Highlighted days are when push notifications <span className="font-semibold text-cyan-500">will</span> be sent. Unhighlighted days are silent.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                    quietHours.days.includes(d.value)
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {quietHours.days.length === 0 && (
              <p className="text-xs font-semibold text-amber-500">
                No days selected — push notifications are blocked every day. Select at least one day.
              </p>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">From</label>
              <input
                type="time"
                value={quietHours.start}
                onChange={e => onQuietHoursChange({ ...quietHours, start: e.target.value })}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">to</label>
              <input
                type="time"
                value={quietHours.end}
                onChange={e => onQuietHoursChange({ ...quietHours, end: e.target.value })}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
