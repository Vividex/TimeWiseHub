'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ConfirmDialog'

type Request = {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  half_day: boolean
  notes: string | null
  status: string
  review_note: string | null
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', personal: 'Personal',
  public_holiday: 'Public Holiday', unpaid: 'Unpaid', other: 'Other',
}

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LeaveRequestList({ requests }: { requests: Request[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('leave_requests').delete().eq('id', id)
    setDeleting(null)
    setPendingDelete(null)
    router.refresh()
  }

  if (requests.length === 0) {
    return <p className="text-sm font-semibold text-gray-400">No leave requests yet.</p>
  }

  return (
    <ul className="space-y-3">
      {requests.map(r => (
        <li key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-bold text-gray-900">{TYPE_LABELS[r.leave_type] ?? r.leave_type}</span>
                <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.draft}`}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
                {r.half_day && <span className="rounded-xl bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Half day</span>}
              </div>
              <p className="text-sm font-semibold text-gray-600">
                {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` – ${fmtDate(r.end_date)}` : ''}
              </p>
              {r.notes && <p className="mt-1 text-xs text-gray-500">{r.notes}</p>}
              {r.review_note && (
                <p className="mt-1 text-xs font-semibold text-red-600">Reviewer note: {r.review_note}</p>
              )}
            </div>
            {(r.status === 'draft' || r.status === 'submitted') && (
              <button onClick={() => setPendingDelete(r.id)} disabled={deleting === r.id}
                className="shrink-0 text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50">
                Cancel
              </button>
            )}
          </div>
        </li>
      ))}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Cancel leave request"
        message="This leave request will be permanently deleted and cannot be recovered."
        confirmLabel="Cancel request"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </ul>
  )
}
