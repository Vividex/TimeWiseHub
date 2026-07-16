'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

type Timesheet = {
  id: string
  status: TimesheetStatus
  total_seconds: number
  review_note: string | null
}

const STATUS_LABELS: Record<TimesheetStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_STYLES: Record<TimesheetStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-cyan-50 text-cyan-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatWeek(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TimesheetSection({
  userId,
  orgId,
  weekStart,
  totalSeconds,
  initialTimesheet,
  rosterManaged,
}: {
  userId: string
  orgId: string | null
  weekStart: string
  totalSeconds: number
  initialTimesheet: Timesheet | null
  rosterManaged: boolean
}) {
  const router = useRouter()
  const [timesheet, setTimesheet] = useState(initialTimesheet)
  const [submitting, setSubmitting] = useState(false)
  const status = timesheet?.status ?? 'draft'
  const disabled = submitting || !orgId || status === 'submitted' || status === 'approved'

  async function submitTimesheet() {
    if (!orgId || disabled) return

    setSubmitting(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('timesheets')
      .upsert({
        user_id: userId,
        org_id: orgId,
        week_start: weekStart,
        status: 'submitted',
        total_seconds: totalSeconds,
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      }, { onConflict: 'user_id,week_start' })
      .select('id, status, total_seconds, review_note')
      .single()

    if (!error && data) {
      setTimesheet(data as Timesheet)
      router.refresh()
      fetch('/api/notifications/timesheet-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetId: data.id }),
      }).catch(err => console.error('Timesheet notification failed', err))
    }

    setSubmitting(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">This week&apos;s timesheet</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
          </div>
          <p className="text-sm font-semibold text-gray-500">Week starting {formatWeek(weekStart)}</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{formatDuration(totalSeconds)}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">Completed time entries included in this week.</p>
          {status === 'rejected' && timesheet?.review_note && (
            <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Rejected: {timesheet.review_note}</p>
          )}
          {!orgId && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-600">Join or create an organisation before submitting timesheets for approval.</p>
          )}
        </div>
        {rosterManaged ? (
          <p className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700">
            Your timesheet is submitted automatically from your roster.
          </p>
        ) : (
          <button
            type="button"
            onClick={submitTimesheet}
            disabled={disabled}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : status === 'rejected' ? 'Resubmit for approval' : 'Submit for approval'}
          </button>
        )}
      </div>
    </div>
  )
}
