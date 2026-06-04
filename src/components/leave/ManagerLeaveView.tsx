'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type LeaveReq = {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  half_day: boolean
  notes: string | null
  status: string
  user_id: string
  profiles: { email: string; full_name: string | null } | null
}

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', personal: 'Personal',
  public_holiday: 'Public Holiday', unpaid: 'Unpaid', other: 'Other',
}

function notifyLeaveReview(id: string) {
  fetch('/api/notifications/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'leave', id }),
  }).catch(error => console.error('Leave notification failed', error))
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function ManagerLeaveView({ pending }: { pending: LeaveReq[] }) {
  const router = useRouter()
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)

  async function handleApprove(id: string) {
    setProcessing(id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('leave_requests').update({
      status: 'approved',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    if (!error) notifyLeaveReview(id)
    setProcessing(null)
    router.refresh()
  }

  async function handleReject(id: string) {
    setProcessing(id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('leave_requests').update({
      status: 'rejected',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_note: rejectNote[id] || null,
    }).eq('id', id)
    if (!error) notifyLeaveReview(id)
    setProcessing(null)
    setRejectOpen(null)
    router.refresh()
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Pending approvals</h3>
        <p className="text-sm font-semibold text-gray-400">No pending leave requests.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">
        Pending approvals ({pending.length})
      </h3>
      <ul className="space-y-4">
        {pending.map(r => {
          const name = r.profiles?.full_name || r.profiles?.email || 'Unknown'
          return (
            <li key={r.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{name}</p>
                  <p className="text-sm font-semibold text-gray-600">
                    {TYPE_LABELS[r.leave_type] ?? r.leave_type} · {fmtDate(r.start_date)}
                    {r.start_date !== r.end_date ? ` – ${fmtDate(r.end_date)}` : ''}
                    {r.half_day ? ' (half day)' : ''}
                  </p>
                  {r.notes && <p className="mt-1 text-xs text-gray-500">{r.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(r.id)} disabled={!!processing}
                    className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => setRejectOpen(rejectOpen === r.id ? null : r.id)} disabled={!!processing}
                    className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </div>
              {rejectOpen === r.id && (
                <div className="mt-3 flex gap-2">
                  <input value={rejectNote[r.id] ?? ''} onChange={e => setRejectNote(n => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Reason (optional)"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  <button onClick={() => handleReject(r.id)} disabled={!!processing}
                    className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                    Confirm
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
