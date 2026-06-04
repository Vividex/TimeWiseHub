'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

const TIMEZONES = [
  'UTC',
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]

type NotificationPreferences = {
  deadline_alerts: boolean
  priority_nudges: boolean
  daily_digest: boolean
  idle_alerts: boolean
}

type Props = {
  email: string
  initialFullName: string
  initialTimezone: string
  initialNotifications: NotificationPreferences
}

export default function AccountSettingsForm({
  email,
  initialFullName,
  initialTimezone,
  initialNotifications,
}: Props) {
  const [fullName, setFullName] = useState(initialFullName)
  const [timezone, setTimezone] = useState(initialTimezone)
  const [notifications, setNotifications] = useState<NotificationPreferences>(initialNotifications)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleNotification(key: keyof NotificationPreferences) {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, timezone, notification_preferences: notifications })
      .eq('id', user.id)

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* Profile */}
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Profile</h2>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-900">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-900">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Timezone</h2>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Notifications */}
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Notifications</h2>

        {(
          [
            { key: 'deadline_alerts', label: 'Deadline alerts', description: 'Notify me when a project or task deadline is approaching' },
            { key: 'priority_nudges', label: 'Priority nudges', description: 'Alert me when a higher-priority task needs attention' },
            { key: 'daily_digest', label: 'Daily digest', description: 'Morning summary of today\'s deadlines and priorities' },
            { key: 'idle_alerts', label: 'Idle alerts', description: 'Prompt me to resume work if no activity is logged' },
          ] as { key: keyof NotificationPreferences; label: string; description: string }[]
        ).map(({ key, label, description }) => (
          <div key={key} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-bold text-gray-900">{label}</p>
              <p className="text-xs font-medium text-gray-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleNotification(key)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${
                notifications[key] ? 'bg-cyan-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
                  notifications[key] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {loading ? 'Saving...' : saved ? 'Saved!' : 'Save settings'}
      </button>
    </form>
  )
}

