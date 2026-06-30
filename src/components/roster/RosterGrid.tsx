'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { AdditionalEntry } from '@/app/dashboard/roster/page'
import { createClient } from '@/lib/supabase-browser'
import ShiftForm, { type RosterShift, type OrgMember } from './ShiftForm'
import AvailabilityPanel from './AvailabilityPanel'

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export type LeaveBlock = {
  id: string; user_id: string; leave_type: string
  start_date: string; end_date: string; half_day: boolean
}

const LEAVE_COLOURS: Record<string, string> = {
  annual:           'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sick:             'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  personal:         'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  long_service:     'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'long service':   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  parental:         'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  bereavement:      'bg-stone-100 text-stone-600 dark:bg-stone-800/60 dark:text-stone-300',
  unpaid:           'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}
const DEFAULT_LEAVE_COLOUR = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'

function leaveColour(type: string) {
  return LEAVE_COLOURS[type.toLowerCase().replace(/ leave$/i, '').trim()] ?? DEFAULT_LEAVE_COLOUR
}
function leaveLabel(type: string, halfDay: boolean) {
  const base = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return halfDay ? `${base} (½ day)` : base
}

function getWeekDates(anchor: Date, weekStartDay: number): Date[] {
  const day = anchor.getDay()
  const start = new Date(anchor)
  const offset = (day - weekStartDay + 7) % 7
  start.setDate(anchor.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}
function toISO(d: Date) { return d.toISOString().split('T')[0] }

export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster, weekStartDay, currentUserId, initialAdditionalEntries }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean; weekStartDay: number
  currentUserId: string; initialAdditionalEntries?: AdditionalEntry[]
}) {
  const router = useRouter()
  const [shifts, setShifts] = useState<RosterShift[]>(initialShifts)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [formState, setFormState] = useState<{ open: boolean; shift?: RosterShift; defaultDate?: string }>({ open: false })
  const [leaveModal, setLeaveModal] = useState<{ open: boolean; leave?: LeaveBlock }>({ open: false })
  const [removedLeaveIds, setRemovedLeaveIds] = useState<Set<string>>(new Set())
  const [removingLeave, setRemovingLeave] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [settingTemplate, setSettingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [selectedAvailMember, setSelectedAvailMember] = useState<OrgMember | null>(null)
  const [additionalEntries, setAdditionalEntries] = useState<AdditionalEntry[]>(initialAdditionalEntries ?? [])

  function fmtDur(sec: number | null) {
    if (!sec) return ''
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const weekDates = getWeekDates(weekAnchor, weekStartDay)
  const weekStart = toISO(weekDates[0])
  const weekEnd = toISO(weekDates[6])

  useEffect(() => {
    const supabase = createClient()
    const userIds = members.map(m => m.user_id)
    supabase
      .from('time_entries')
      .select('id, user_id, started_at, ended_at, duration_seconds, description, projects(name)')
      .in('user_id', userIds)
      .gte('started_at', `${weekStart}T00:00:00`)
      .lte('started_at', `${weekEnd}T23:59:59`)
      .not('ended_at', 'is', null)
      .then(({ data }) => setAdditionalEntries((data ?? []) as unknown as AdditionalEntry[]))
  }, [weekStart, weekEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d) }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d) }

  function handleSaved(s: RosterShift) {
    setShifts(prev => { const idx = prev.findIndex(x => x.id === s.id); if (idx >= 0) { const n = [...prev]; n[idx] = s; return n } return [...prev, s] })
    setFormState({ open: false })
  }
  function handleDeleted(id: string) { setShifts(prev => prev.filter(s => s.id !== id)); setFormState({ open: false }) }

  async function handleRemoveLeave() {
    if (!leaveModal.leave) return
    setRemovingLeave(true)
    const res = await fetch('/api/roster/remove-leave', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveId: leaveModal.leave.id }),
    })
    setRemovingLeave(false)
    if (!res.ok) return
    setRemovedLeaveIds(prev => new Set([...prev, leaveModal.leave!.id]))
    setLeaveModal({ open: false })
    router.refresh()
  }

  async function publishWeek() {
    setPublishing(true)
    const ids = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd && !s.published).map(s => s.id)
    await Promise.all(ids.map(id => fetch('/api/roster', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, published: true }) })))
    setShifts(prev => prev.map(s => ids.includes(s.id) ? { ...s, published: true } : s))
    setPublishing(false)
    router.refresh()
  }

  async function setAsRecurring() {
    setSettingTemplate(true)
    const weekShifts = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd)
    const templateShifts = weekShifts.map(s => ({
      userId: s.user_id,
      dayOfWeek: new Date(s.date + 'T12:00:00Z').getUTCDay(),
      startTime: s.start_time,
      endTime: s.end_time,
      notes: s.notes,
    }))
    await fetch('/api/roster/set-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, shifts: templateShifts }),
    })
    setSettingTemplate(false)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2500)
  }

  const unpublishedCount = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd && !s.published).length
  const todayISO = toISO(new Date())
  const nowTime = new Date().toTimeString().slice(0, 8) // "HH:MM:SS" — string compare works on ISO times

  function isActiveNow(s: RosterShift) {
    return s.date === todayISO && s.start_time <= nowTime && s.end_time > nowTime
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">←</button>
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
            {weekDates[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {weekDates[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">→</button>
        </div>
        <div className="flex items-center gap-2">
          {canManageRoster && unpublishedCount > 0 && (
            <button onClick={publishWeek} disabled={publishing}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
              {publishing ? 'Publishing…' : `Publish week (${unpublishedCount} draft)`}
            </button>
          )}
          {canManageRoster && (
            <button onClick={setAsRecurring} disabled={settingTemplate || templateSaved}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                templateSaved
                  ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}>
              {settingTemplate ? 'Saving…' : templateSaved ? 'Recurring saved ✓' : 'Set as recurring'}
            </button>
          )}
        </div>
      </div>

      {/* Leave colour legend */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries({
          Annual: 'annual', Sick: 'sick', Personal: 'personal',
          'Long Service': 'long service', Parental: 'parental',
          Bereavement: 'bereavement', Unpaid: 'unpaid',
        }).map(([label, key]) => (
          <span key={key} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${leaveColour(key)}`}>{label}</span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="divide-x divide-gray-200 dark:divide-slate-700 bg-gray-50 dark:bg-slate-800">
              <th className="w-36 border-b border-gray-200 dark:border-slate-700 py-3 pl-4 pr-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Member
              </th>
              {weekDates.map((d, i) => {
                const iso = toISO(d)
                const isToday = iso === todayISO
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <th key={i} className={`min-w-[110px] border-b border-gray-200 dark:border-slate-700 px-2 py-3 text-center ${
                    isToday ? 'bg-cyan-50 dark:bg-cyan-900/20' : isWeekend ? 'bg-slate-100/80 dark:bg-slate-700/40' : ''
                  }`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-xs font-bold ${isToday ? 'text-cyan-600 dark:text-cyan-400' : isWeekend ? 'text-slate-500 dark:text-slate-400' : 'text-gray-700 dark:text-slate-300'}`}>
                        {d.toLocaleDateString('en-AU', { weekday: 'short' })}
                      </span>
                      <span className={`text-[11px] ${isToday ? 'font-bold text-cyan-500' : 'text-gray-400 dark:text-slate-500'}`}>
                        {d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      {isToday && <span className="mt-0.5 h-1 w-1 rounded-full bg-cyan-500" />}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {members.map((member, memberIdx) => (
              <tr key={member.user_id}
                className={`divide-x divide-gray-100 dark:divide-slate-800 ${memberIdx % 2 === 1 ? 'bg-gray-50/60 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900/20'}`}>
                <td className="py-2 pl-4 pr-3 text-xs font-semibold whitespace-nowrap">
                  <button
                    onClick={() => setSelectedAvailMember(prev => prev?.user_id === member.user_id ? null : member)}
                    className={`text-left transition-colors hover:text-cyan-400 ${
                      selectedAvailMember?.user_id === member.user_id
                        ? 'text-cyan-400'
                        : 'text-gray-700 dark:text-slate-300'
                    }`}
                  >
                    {member.display_name}
                  </button>
                </td>
                {weekDates.map((d, i) => {
                  const iso = toISO(d)
                  const isToday = iso === todayISO
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const dayShifts = shifts.filter(s => s.user_id === member.user_id && s.date === iso)
                  const dayLeave = leaveBlocks.filter(l => l.user_id === member.user_id && l.start_date <= iso && l.end_date >= iso && !removedLeaveIds.has(l.id))
                  const dayAdditional = additionalEntries.filter(e => {
                    const eDate = e.started_at.slice(0, 10)
                    return e.user_id === member.user_id && eDate === iso
                  })
                  return (
                    <td key={i} className={`px-1.5 py-1.5 align-top ${
                      isToday ? 'bg-cyan-50/50 dark:bg-cyan-900/10' : isWeekend ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''
                    }`}>
                      <div className="min-h-[52px]">
                        {dayLeave.map(l => (
                          canManageRoster
                            ? <button key={l.id} onClick={() => setLeaveModal({ open: true, leave: l })}
                                className={`mb-1 w-full rounded-lg px-2 py-1 text-left text-xs font-semibold ${leaveColour(l.leave_type)}`}>
                                {leaveLabel(l.leave_type, l.half_day)}
                              </button>
                            : <div key={l.id}
                                className={`mb-1 w-full rounded-lg px-2 py-1 text-xs font-semibold ${leaveColour(l.leave_type)}`}>
                                {leaveLabel(l.leave_type, l.half_day)}
                              </div>
                        ))}
                        {dayShifts.map(s => (
                          <button key={s.id} onClick={() => canManageRoster && setFormState({ open: true, shift: s })}
                            className={`mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold shadow-sm ${
                              isActiveNow(s)
                                ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300'
                                : s.published
                                  ? 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300'
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                            }`}>
                            {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}
                          </button>
                        ))}
                        {dayAdditional.map(e => (
                          <div key={e.id} className="mb-1 w-full rounded-lg px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            {fmtDur(e.duration_seconds) || 'Additional'}
                          </div>
                        ))}
                        {canManageRoster && (
                          <button onClick={() => setFormState({ open: true, defaultDate: iso })}
                            className="flex w-full items-center justify-center rounded-lg p-1 text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-500">
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {formState.open && (
        <ShiftForm orgId={orgId} members={members} shift={formState.shift} defaultDate={formState.defaultDate}
          onSaved={handleSaved} onDeleted={handleDeleted} onClose={() => setFormState({ open: false })} />
      )}

      {leaveModal.open && leaveModal.leave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Leave</h2>
            <p className="mb-1 text-sm text-gray-500 dark:text-slate-400">
              {leaveLabel(leaveModal.leave.leave_type, leaveModal.leave.half_day)}
            </p>
            <p className="mb-5 text-sm text-gray-400 dark:text-slate-500">
              {leaveModal.leave.start_date}{leaveModal.leave.end_date !== leaveModal.leave.start_date ? ` → ${leaveModal.leave.end_date}` : ''}
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={handleRemoveLeave}
                disabled={removingLeave}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950 disabled:opacity-50"
              >
                {removingLeave ? 'Removing…' : 'Remove leave'}
              </button>
              <button
                type="button"
                onClick={() => setLeaveModal({ open: false })}
                className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Availability</h2>
        <p className="mb-3 text-xs text-slate-600">
          Click an employee name above to view their weekly schedule.
        </p>
        {selectedAvailMember && (
          <AvailabilityPanel
            member={selectedAvailMember}
            orgId={orgId}
            canEdit={canManageRoster || selectedAvailMember.user_id === currentUserId}
            onClose={() => setSelectedAvailMember(null)}
          />
        )}
      </div>
    </div>
  )
}
