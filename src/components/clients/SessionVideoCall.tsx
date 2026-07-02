'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video, X } from 'lucide-react'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SessionVideoCall({
  clientId,
  sessionId,
  clientEmail,
  call,
}: {
  clientId: string
  sessionId: string
  clientEmail: string | null
  call: { id: string; startsAt: string; summary: string | null } | null
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function scheduleCall() {
    setScheduling(true)
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/sessions/${sessionId}/video-call`, { method: 'POST' })
    const json = await res.json()
    setScheduling(false)
    if (!res.ok) { setError(json.error ?? 'Failed to schedule call'); return }
    setShowConfirm(false)
    router.refresh()
  }

  if (call) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={`/dashboard/video/${call.id}`}
          className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-1 text-xs font-bold text-white hover:bg-violet-600"
        >
          <Video size={12} />
          Join call
        </a>
        <span className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(call.startsAt)}</span>
        {call.summary && (
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
          >
            View summary
          </button>
        )}

        {showSummary && call.summary && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowSummary(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Call summary</h3>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="whitespace-pre-line text-sm text-gray-700 dark:text-slate-300">{call.summary}</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Video size={12} />
        Schedule video call
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Schedule video call</h2>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            {clientEmail ? (
              <p className="text-sm text-gray-600 dark:text-slate-400">
                This will email <span className="font-semibold text-gray-900 dark:text-slate-100">{clientEmail}</span> a
                join link for this session&apos;s scheduled time.
              </p>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                This client has no email on file. Add one to their client record before scheduling a video call.
              </p>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={scheduleCall}
                disabled={scheduling || !clientEmail}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {scheduling ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
