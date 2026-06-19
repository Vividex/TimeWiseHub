'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Clock, Users, Video, X } from 'lucide-react'

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

type Invitee = { email: string; display_name: string | null }

type Props = {
  calls: ScheduledCall[]
  canManage?: boolean
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney',
  })
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function agendaDateLabel(date: Date, now: Date): string {
  if (sameDay(date, now)) return 'Today'
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (sameDay(date, tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function VideoCalendar({ calls: initialCalls, canManage = false }: Props) {
  const [calls, setCalls] = useState(initialCalls)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedCall, setSelectedCall] = useState<ScheduledCall | null>(null)
  const [invitees, setInvitees] = useState<Invitee[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addingInvitee, setAddingInvitee] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const router = useRouter()

  const now = new Date()

  function callsForDay(day: Date): ScheduledCall[] {
    return calls.filter(c => {
      if (!c.starts_at) return false
      return sameDay(new Date(c.starts_at), day)
    })
  }

  function isLive(call: ScheduledCall): boolean {
    if (!call.starts_at) return false
    const start = new Date(call.starts_at)
    const end = call.ends_at ? new Date(call.ends_at) : addDays(start, 0)
    return now >= start && now <= end
  }

  async function openCall(call: ScheduledCall) {
    setSelectedCall(call)
    setConfirmCancel(false)
    setCancelError(null)
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/video/schedule/${call.id}`)
      if (res.ok) {
        const data = await res.json() as { invitees: Invitee[] }
        setInvitees(data.invitees)
      }
    } finally {
      setLoadingDetails(false)
    }
  }

  function closeModal() {
    setSelectedCall(null)
    setInvitees([])
    setConfirmCancel(false)
    setCancelError(null)
    setAddEmail('')
    setAddName('')
    setAddError(null)
  }

  async function handleAddInvitee(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCall || !addEmail.trim()) return
    setAddingInvitee(true)
    setAddError(null)
    try {
      const res = await fetch(`/api/video/schedule/${selectedCall.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), displayName: addName.trim() || undefined }),
      })
      const data = await res.json() as { email?: string; display_name?: string | null; error?: string }
      if (res.ok) {
        setInvitees(prev => [...prev, { email: data.email!, display_name: data.display_name ?? null }])
        setAddEmail('')
        setAddName('')
      } else {
        setAddError(data.error ?? 'Could not add invitee.')
      }
    } finally {
      setAddingInvitee(false)
    }
  }

  async function handleCancel() {
    if (!selectedCall) return
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/video/schedule/${selectedCall.id}`, { method: 'DELETE' })
      if (res.ok) {
        setCalls(prev => prev.filter(c => c.id !== selectedCall.id))
        closeModal()
      } else {
        const data = await res.json() as { error?: string }
        setCancelError(data.error ?? 'Could not cancel the meeting.')
        setConfirmCancel(false)
      }
    } finally {
      setCancelling(false)
    }
  }

  function CallModal() {
    if (!selectedCall) return null
    const live = isLive(selectedCall)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-5 dark:border-slate-800">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Scheduled call</p>
              <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{selectedCall.title}</h2>
            </div>
            <button onClick={closeModal} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {selectedCall.starts_at && (
              <div className="flex items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-violet-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateTime(selectedCall.starts_at)}
                  </p>
                  {selectedCall.ends_at && (
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      until {formatTime(selectedCall.ends_at)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Users size={16} className="mt-0.5 shrink-0 text-violet-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Participants {!loadingDetails && `(${invitees.length})`}
                </p>
                {loadingDetails ? (
                  <p className="mt-1 text-xs text-gray-400">Loading…</p>
                ) : invitees.length === 0 ? (
                  <p className="mt-1 text-xs text-gray-400">No invitees added</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {invitees.map(inv => (
                      <li key={inv.email} className="text-xs text-gray-600 dark:text-slate-400">
                        {inv.display_name ? `${inv.display_name} (${inv.email})` : inv.email}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {cancelError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950">
                {cancelError}
              </p>
            )}

            {canManage && (
              <form onSubmit={handleAddInvitee} className="rounded-xl border border-gray-100 dark:border-slate-700 p-3 space-y-2">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Add invitee</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="Name (optional)"
                    className="w-28 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <button
                    type="submit"
                    disabled={addingInvitee || !addEmail.trim()}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {addingInvitee ? '…' : 'Invite'}
                  </button>
                </div>
                {addError && <p className="text-xs font-semibold text-red-500">{addError}</p>}
              </form>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-5 dark:border-slate-800">
            {canManage && !confirmCancel && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
              >
                Cancel meeting
              </button>
            )}
            {canManage && confirmCancel && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Send cancellation emails and delete?</span>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-600"
                >
                  Keep
                </button>
              </div>
            )}
            {!canManage && <span />}
            <button
              onClick={() => router.push(`/dashboard/video/${selectedCall.id}`)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-colors ${
                live ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'
              }`}
            >
              <Video size={14} />
              {live ? 'Join now' : 'Join call'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Mobile agenda view ---
  function AgendaView() {
    const sorted = [...calls]
      .filter(c => c.starts_at)
      .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())

    const groups: { date: Date; items: ScheduledCall[] }[] = []
    for (const call of sorted) {
      const d = new Date(call.starts_at!)
      const existing = groups.find(g => sameDay(g.date, d))
      if (existing) existing.items.push(call)
      else groups.push({ date: d, items: [call] })
    }

    if (groups.length === 0) {
      return (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <Video size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-400">No upcoming meetings</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.date.toISOString()}>
            <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${
              sameDay(group.date, now) ? 'text-violet-600' : 'text-slate-400 dark:text-slate-500'
            }`}>
              {agendaDateLabel(group.date, now)}
            </p>
            <div className="space-y-2">
              {group.items.map(call => {
                const live = isLive(call)
                return (
                  <button
                    key={call.id}
                    onClick={() => openCall(call)}
                    className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                      live
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                        : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-violet-200 dark:hover:border-violet-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${live ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {call.title}
                        </p>
                        {call.starts_at && (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {formatTime(call.starts_at)}
                            {call.ends_at && ` – ${formatTime(call.ends_at)}`}
                          </p>
                        )}
                      </div>
                      {live ? (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">LIVE</span>
                      ) : (
                        <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // --- Desktop grid views ---
  if (view === 'week') {
    const weekStart = startOfWeek(anchor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const weekLabel = `${days[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

    return (
      <>
        <CallModal />
        <div className="md:hidden"><AgendaView /></div>
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnchor(a => addDays(a, -7))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{weekLabel}</span>
              <button onClick={() => setAnchor(a => addDays(a, 7))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
            </div>
            <button onClick={() => setView('month')} className="text-xs text-violet-600 hover:underline">Month view</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
            ))}
            {days.map((day, i) => {
              const dayCalls = callsForDay(day)
              const isToday = sameDay(day, now)
              return (
                <div key={i} className={`min-h-24 rounded-lg p-1.5 border ${isToday ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                  <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-violet-600' : 'text-slate-400'}`}>{day.getDate()}</p>
                  {dayCalls.map(call => (
                    <button
                      key={call.id}
                      onClick={() => openCall(call)}
                      className={`w-full text-left text-xs rounded px-1.5 py-1 mb-1 truncate font-medium transition-colors ${
                        isLive(call)
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900'
                      }`}
                    >
                      {call.starts_at && formatTime(call.starts_at)} {call.title}
                      {isLive(call) && ' • LIVE'}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // Month view
  const monthStart = startOfMonth(anchor)
  const firstDayOfWeek = ((monthStart.getDay() + 6) % 7)
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)),
  ]
  const monthLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <>
      <CallModal />
      <div className="md:hidden"><AgendaView /></div>
      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() - 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{monthLabel}</span>
            <button onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          </div>
          <button onClick={() => setView('week')} className="text-xs text-violet-600 hover:underline">Week view</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />
            const dayCalls = callsForDay(day)
            const isToday = sameDay(day, now)
            return (
              <div key={i} className={`min-h-16 rounded-lg p-1.5 border ${isToday ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-violet-600' : 'text-slate-400'}`}>{day.getDate()}</p>
                {dayCalls.slice(0, 2).map(call => (
                  <button
                    key={call.id}
                    onClick={() => openCall(call)}
                    className={`w-full text-left text-xs rounded px-1 py-0.5 mb-0.5 truncate ${
                      isLive(call) ? 'bg-emerald-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
                    }`}
                  >
                    {call.title}
                  </button>
                ))}
                {dayCalls.length > 2 && (
                  <p className="text-xs text-slate-400">+{dayCalls.length - 2} more</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
