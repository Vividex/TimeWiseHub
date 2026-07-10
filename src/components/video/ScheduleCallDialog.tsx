'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2 } from 'lucide-react'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type Props = {
  orgId: string
  members: OrgMember[]
  onClose: () => void
  projects?: { id: string; name: string; colour: string }[]
}

type ExternalGuest = { email: string; displayName: string }

export default function ScheduleCallDialog({ orgId, members, onClose, projects = [] }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMins, setDurationMins] = useState('60')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [externalGuests, setExternalGuests] = useState<ExternalGuest[]>([])
  const [guestEmail, setGuestEmail] = useState('')
  const [guestName, setGuestName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')

  function toggleMember(userId: string) {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  function addGuest() {
    if (!guestEmail.trim()) return
    setExternalGuests(prev => [...prev, { email: guestEmail.trim(), displayName: guestName.trim() }])
    setGuestEmail('')
    setGuestName('')
  }

  function removeGuest(i: number) {
    setExternalGuests(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !date || !startTime) return
    setSaving(true)
    setError(null)

    const startsAt = new Date(`${date}T${startTime}`).toISOString()
    const endsAt = new Date(new Date(startsAt).getTime() + Number(durationMins) * 60 * 1000).toISOString()

    // Include any external guest email that was typed but not yet added via the + button
    const pendingGuests = guestEmail.trim()
      ? [...externalGuests, { email: guestEmail.trim(), displayName: guestName.trim() }]
      : externalGuests

    const invitees = [
      ...selectedMemberIds.map(userId => {
        const m = members.find(m => m.userId === userId)
        return { userId, email: m?.email ?? '', displayName: m?.fullName ?? undefined }
      }),
      ...pendingGuests.map(g => ({ userId: null, email: g.email, displayName: g.displayName || undefined })),
    ]

    const res = await fetch('/api/video/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        invitees,
        ...(projectId ? { project_id: projectId } : {}),
      }),
    })

    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Failed to schedule call')
      setSaving(false)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Schedule a call</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Weekly team standup"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Duration</label>
            <select
              value={durationMins}
              onChange={e => setDurationMins(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {[30, 45, 60, 90, 120].map(m => (
                <option key={m} value={m}>{m < 60 ? `${m}m` : `${m / 60}h`}</option>
              ))}
            </select>
          </div>

          {projects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project (optional)</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Invite team members</label>
            <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
              {members.map(m => (
                <label key={m.userId} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.includes(m.userId)}
                    onChange={() => toggleMember(m.userId)}
                    className="rounded accent-cyan-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{m.fullName ?? m.email}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">External guests</label>
            {externalGuests.map((g, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1 truncate">{g.displayName ? `${g.displayName} (${g.email})` : g.email}</span>
                <button type="button" onClick={() => removeGuest(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                placeholder="guest@example.com"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Name (optional)"
                className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="button"
                onClick={addGuest}
                className="p-2 rounded-lg bg-cyan-100 text-cyan-600 hover:bg-cyan-200 dark:bg-cyan-900/50 dark:text-cyan-300"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Cancel</button>
            <button
              type="submit"
              disabled={saving || !title || !date || !startTime}
              className="px-5 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Scheduling…' : 'Schedule call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
