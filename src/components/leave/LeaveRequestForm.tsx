'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const LEAVE_TYPES = [
  { value: 'annual',          label: 'Annual leave' },
  { value: 'sick',            label: 'Sick leave' },
  { value: 'personal',        label: 'Personal leave' },
  { value: 'public_holiday',  label: 'Public holiday' },
  { value: 'unpaid',          label: 'Unpaid leave' },
  { value: 'other',           label: 'Other' },
]

export default function LeaveRequestForm({ orgId, hasManager }: { orgId: string | null; hasManager: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [leaveType, setLeaveType] = useState('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (endDate && endDate < startDate) { setError('End date must be on or after start date.'); return }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Individual users get auto-approved; org users go to submitted for manager review
    const status = hasManager ? 'submitted' : 'approved'

    const { error: insertError } = await supabase.from('leave_requests').insert({
      user_id: user.id,
      org_id: orgId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate || startDate,
      half_day: halfDay,
      notes: notes || null,
      status,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setStartDate('')
      setEndDate('')
      setNotes('')
      setHalfDay(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold">
        {open ? 'Cancel' : '+ Request leave'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Leave type</label>
            <select required value={leaveType} onChange={e => setLeaveType(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Start date</label>
              <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">End date</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <p className="mt-1 text-xs text-gray-400">Leave blank for a single day</p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={halfDay} onChange={e => setHalfDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-cyan-500" />
            <span className="text-sm font-semibold text-gray-700">Half day</span>
          </label>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Doctor's appointment, holiday booking reference…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? 'Submitting…' : hasManager ? 'Submit for approval' : 'Log leave'}
          </button>
        </form>
      )}
    </div>
  )
}
