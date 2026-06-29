'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import TimesheetDetailModal, { type TimesheetDetail } from './TimesheetDetailModal'

type Timesheet = {
  id: string
  week_start: string
  total_seconds: number
  profiles: { email: string; full_name: string | null } | null
}

function notifyTimesheetReview(id: string) {
  fetch('/api/notifications/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'timesheet', id }),
  }).catch(error => console.error('Timesheet notification failed', error))
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatWeek(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManagerTimesheetView({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<TimesheetDetail | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)

  const loadTimesheets = useCallback(async function loadTimesheets() {
    const supabase = createClient()
    const { data } = await supabase
      .from('timesheets')
      .select('id, week_start, total_seconds, profiles!timesheets_user_id_fkey(email, full_name)')
      .eq('org_id', orgId)
      .eq('status', 'submitted')
      .order('week_start', { ascending: false })

    setTimesheets((data ?? []) as unknown as Timesheet[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadTimesheets()
  }, [loadTimesheets])

  async function reviewTimesheet(id: string, status: 'approved' | 'rejected', note?: string) {
    if (status === 'rejected' && !note?.trim()) return

    setSavingId(id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSavingId(null)
      return
    }

    const { error } = await supabase
      .from('timesheets')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: status === 'rejected' ? (note?.trim() ?? null) : null,
      })
      .eq('id', id)

    if (!error) {
      notifyTimesheetReview(id)
      setTimesheets(prev => prev.filter(timesheet => timesheet.id !== id))
      setSelectedDetail(null)
      router.refresh()
      if (status === 'approved') {
        const ts = timesheets.find(t => t.id === id)
        if (ts) {
          fetch('/api/timesheets/check-and-run-pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId, weekStart: ts.week_start }),
          }).catch(err => console.error('Pay run check failed:', err))
        }
      }
    }

    setSavingId(null)
  }

  async function fetchDetail(id: string) {
    setLoadingDetailId(id)
    const res = await fetch(`/api/timesheets/${id}/detail`)
    if (res.ok) {
      const data = await res.json()
      setSelectedDetail(data)
    }
    setLoadingDetailId(null)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Timesheet approvals</h2>
      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : timesheets.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No timesheets pending approval.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400 dark:text-slate-500">Click a row to review details before approving.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Week</th>
                  <th className="py-3 pr-4">Total</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {timesheets.map(timesheet => {
                  const name = timesheet.profiles?.full_name || timesheet.profiles?.email || 'Unknown'
                  return (
                    <tr
                      key={timesheet.id}
                      onClick={() => fetchDetail(timesheet.id)}
                      className={`align-top cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${loadingDetailId === timesheet.id ? 'opacity-60' : ''}`}
                    >
                      <td className="py-4 pr-4 font-semibold text-gray-900">{name}</td>
                      <td className="py-4 pr-4 font-medium text-gray-500">{formatWeek(timesheet.week_start)}</td>
                      <td className="py-4 pr-4 font-bold text-slate-900">{formatDuration(timesheet.total_seconds)}</td>
                      <td className="py-4 text-right">
                        <span className="text-xs text-gray-400">{loadingDetailId === timesheet.id ? 'Loading…' : 'Review →'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selectedDetail && (
        <TimesheetDetailModal
          data={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onReview={reviewTimesheet}
          savingId={savingId}
        />
      )}
    </div>
  )
}
