'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import ScrollFade from '@/components/ui/ScrollFade'

type RosterShift = { id: string; date: string; start_time: string; end_time: string; notes: string | null; published: boolean }
type AdditionalEntry = { id: string; started_at: string; ended_at: string; duration_seconds: number | null; description: string | null; projects: { name: string } | null }

export type TimesheetDetail = {
  timesheet: { id: string; user_id: string; week_start: string; total_seconds: number; status: string }
  profile: { full_name: string | null; email: string }
  roster_shifts: RosterShift[]
  additional_entries: AdditionalEntry[]
  rostered_seconds: number
  additional_seconds: number
  overtime_seconds: number
}

function fmtDur(sec: number | null) {
  if (!sec) return '0m'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(t: string) { return t.slice(0, 5) }
function fmtTs(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}
function fmtWeek(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TimesheetDetailModal({
  data,
  onClose,
  onReview,
  savingId,
}: {
  data: TimesheetDetail
  onClose: () => void
  onReview: (id: string, status: 'approved' | 'rejected', note?: string) => void
  savingId: string | null
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [note, setNote] = useState('')
  const { timesheet, profile, roster_shifts, additional_entries, rostered_seconds, additional_seconds, overtime_seconds } = data
  const name = profile.full_name || profile.email
  const saving = savingId === timesheet.id

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <ScrollFade wrapperClassName="w-full max-w-lg max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl" fadeFrom="from-white dark:from-slate-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
          <div>
            <p className="font-bold text-gray-900 dark:text-slate-100">{name}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Week of {fmtWeek(timesheet.week_start)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Rostered shifts */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Rostered shifts</p>
            {roster_shifts.length === 0 ? (
              <p className="text-sm text-slate-400">No rostered shifts this week.</p>
            ) : (
              <div className="space-y-1.5">
                {roster_shifts.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{fmtDate(s.date)}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional entries */}
          {additional_entries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Additional hours</p>
              <div className="space-y-1.5">
                {additional_entries.map(e => {
                  const proj = (e.projects as unknown as { name: string } | null)?.name
                  return (
                    <div key={e.id} className="flex items-center justify-between rounded-xl bg-orange-50 dark:bg-orange-900/20 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-300 truncate">{proj ?? '—'}</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {fmtTs(e.started_at)}–{fmtTs(e.ended_at)}
                          {e.description ? ` · ${e.description}` : ''}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 text-sm font-bold text-orange-800 dark:text-orange-300">{fmtDur(e.duration_seconds)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-sm text-slate-600 dark:text-slate-400">Rostered</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtDur(rostered_seconds)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-sm text-slate-600 dark:text-slate-400">Additional</span>
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">{fmtDur(additional_seconds)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total</span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{fmtDur(rostered_seconds + additional_seconds)}</span>
            </div>
          </div>

          {/* Overtime warning */}
          {overtime_seconds > 0 && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                Overtime: {fmtDur(overtime_seconds)} over 38h
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Fair Work threshold exceeded — review before approving.</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {!rejectOpen ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onReview(timesheet.id, 'approved')}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Approve'}
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white shadow-md shadow-red-500/25 transition-all duration-150 hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Reason for rejection (required)"
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRejectOpen(false); setNote('') }}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onReview(timesheet.id, 'rejected', note.trim())}
                    disabled={saving || note.trim().length === 0}
                    className="flex-1 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white shadow-md shadow-red-500/25 transition-all duration-150 hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Confirm reject'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollFade>
    </div>
  )
}
