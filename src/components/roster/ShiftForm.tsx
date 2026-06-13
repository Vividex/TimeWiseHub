'use client'
import { useState } from 'react'

export type RosterShift = {
  id: string; org_id: string; user_id: string
  date: string; start_time: string; end_time: string
  notes: string | null; published: boolean
}
export type OrgMember = { user_id: string; display_name: string }

export default function ShiftForm({
  orgId, members, shift, defaultDate, onSaved, onDeleted, onClose,
}: {
  orgId: string; members: OrgMember[]; shift?: RosterShift
  defaultDate?: string; onSaved: (s: RosterShift) => void
  onDeleted?: (id: string) => void; onClose: () => void
}) {
  const [userId, setUserId] = useState(shift?.user_id ?? '')
  const [date, setDate] = useState(shift?.date ?? defaultDate ?? '')
  const [startTime, setStartTime] = useState(shift?.start_time ?? '09:00')
  const [endTime, setEndTime] = useState(shift?.end_time ?? '17:00')
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { setError('Select a team member'); return }
    if (startTime >= endTime) { setError('End time must be after start time'); return }
    setSaving(true); setError(null)
    const res = shift
      ? await fetch('/api/roster', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: shift.id, user_id: userId, date, start_time: startTime, end_time: endTime, notes: notes || null }) })
      : await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, user_id: userId, date, start_time: startTime, end_time: endTime, notes: notes || null }) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    onSaved(json)
  }

  async function handleDelete() {
    if (!shift) return
    setSaving(true)
    await fetch('/api/roster', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: shift.id }) })
    setSaving(false)
    onDeleted?.(shift.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">{shift ? 'Edit shift' : 'Add shift'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Team member</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="">Select…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-between gap-2 pt-2">
            {shift && (
              <button type="button" onClick={handleDelete} disabled={saving}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose}
                className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
