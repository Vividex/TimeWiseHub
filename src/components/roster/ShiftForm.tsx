'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type RosterShift = {
  id: string; org_id: string; user_id: string
  date: string; start_time: string; end_time: string
  notes: string | null; published: boolean
}
export type OrgMember = { user_id: string; display_name: string }

const LEAVE_TYPES = [
  { value: 'annual',         label: 'Annual leave' },
  { value: 'sick',           label: 'Sick leave' },
  { value: 'personal',       label: 'Personal leave' },
  { value: 'public_holiday', label: 'Public holiday' },
  { value: 'unpaid',         label: 'Unpaid leave' },
  { value: 'other',          label: 'Other' },
]

export default function ShiftForm({
  orgId, members, shift, defaultDate, onSaved, onDeleted, onClose,
}: {
  orgId: string; members: OrgMember[]; shift?: RosterShift
  defaultDate?: string; onSaved: (s: RosterShift) => void
  onDeleted?: (id: string) => void; onClose: () => void
}) {
  const router = useRouter()
  const [userId, setUserId] = useState(shift?.user_id ?? '')
  const [date, setDate] = useState(shift?.date ?? defaultDate ?? '')
  const [startTime, setStartTime] = useState(shift?.start_time ?? '09:00')
  const [endTime, setEndTime] = useState(shift?.end_time ?? '17:00')
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showConvert, setShowConvert] = useState(false)
  const [convertLeaveType, setConvertLeaveType] = useState('annual')
  const [convertHalfDay, setConvertHalfDay] = useState(false)
  const [converting, setConverting] = useState(false)

  const memberName = members.find(m => m.user_id === (shift?.user_id ?? userId))?.display_name ?? ''

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

  async function handleConvert() {
    if (!shift) return
    setConverting(true)
    setError(null)
    const res = await fetch('/api/roster/convert-to-leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftId: shift.id, leaveType: convertLeaveType, halfDay: convertHalfDay }),
    })
    const json = await res.json()
    setConverting(false)
    if (!res.ok) { setError(json.error ?? 'Conversion failed'); return }
    onDeleted?.(shift.id)
    router.refresh()
  }

  if (showConvert && shift) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Convert to leave</h2>
          <p className="mb-5 text-sm text-gray-500 dark:text-slate-400">
            {memberName} · {shift.date} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Leave type</label>
              <select
                value={convertLeaveType}
                onChange={e => setConvertLeaveType(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
              >
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={convertHalfDay}
                onChange={e => setConvertHalfDay(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-cyan-500"
              />
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Half day</span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowConvert(false); setError(null) }}
                className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={converting}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {converting ? 'Converting…' : 'Confirm conversion'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
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
            <div className="flex gap-2">
              {shift && (
                <button type="button" onClick={handleDelete} disabled={saving}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950">
                  Delete
                </button>
              )}
              {shift && (
                <button type="button" onClick={() => setShowConvert(true)} disabled={saving}
                  className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-950">
                  Convert to leave
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving}
                className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
