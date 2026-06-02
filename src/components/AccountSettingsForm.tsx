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
      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Profile</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Timezone</h2>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Notifications</h2>

        {(
          [
            { key: 'deadline_alerts', label: 'Deadline alerts', description: 'Notify me when a project or task deadline is approaching' },
            { key: 'priority_nudges', label: 'Priority nudges', description: 'Alert me when a higher-priority task needs attention' },
            { key: 'daily_digest', label: 'Daily digest', description: 'Morning summary of today\'s deadlines and priorities' },
            { key: 'idle_alerts', label: 'Idle alerts', description: 'Prompt me to resume work if no activity is logged' },
          ] as { key: keyof NotificationPreferences; label: string; description: string }[]
        ).map(({ key, label, description }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleNotification(key)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${
                notifications[key] ? 'bg-blue-600' : 'bg-gray-200'
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : saved ? 'Saved!' : 'Save settings'}
      </button>
    </form>
  )
}
