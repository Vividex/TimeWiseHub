'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import ShiftForm, { type RosterShift, type OrgMember } from './ShiftForm'

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export type LeaveBlock = {
  id: string; user_id: string; leave_type: string
  start_date: string; end_date: string; half_day: boolean
}

const LEAVE_COLOURS: Record<string, string> = {
  annual:           'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sick:             'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  personal:         'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  long_service:     'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'long service':   'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
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

export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster, weekStartDay }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean; weekStartDay: number
}) {
  const router = useRouter()
  const [shifts, setShifts] = useState<RosterShift[]>(initialShifts)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [formState, setFormState] = useState<{ open: boolean; shift?: RosterShift; defaultDate?: string }>({ open: false })
  const [publishing, setPublishing] = useState(false)
  const [settingTemplate, setSettingTemplate] = useState(false)

  const weekDates = getWeekDates(weekAnchor, weekStartDay)
  const weekStart = toISO(weekDates[0])
  const weekEnd = toISO(weekDates[6])

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d) }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d) }

  function handleSaved(s: RosterShift) {
    setShifts(prev => { const idx = prev.findIndex(x => x.id === s.id); if (idx >= 0) { const n = [...prev]; n[idx] = s; return n } return [...prev, s] })
    setFormState({ open: false })
  }
  function handleDeleted(id: string) { setShifts(prev => prev.filter(s => s.id !== id)); setFormState({ open: false }) }

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
  }

  const unpublishedCount = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd && !s.published).length

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
        {canManageRoster && unpublishedCount > 0 && (
          <button onClick={publishWeek} disabled={publishing}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
            {publishing ? 'Publishing…' : `Publish week (${unpublishedCount} draft)`}
          </button>
        )}
        {canManageRoster && (
          <button onClick={setAsRecurring} disabled={settingTemplate}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            {settingTemplate ? 'Saving…' : 'Set as recurring'}
          </button>
        )}
      </div>

      {/* Leave colour legend */}
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.entries({
          Annual: 'annual', Sick: 'sick', Personal: 'personal',
          'Long Service': 'long service', Parental: 'parental',
          Bereavement: 'bereavement', Unpaid: 'unpaid',
        }).map(([label, key]) => (
          <span key={key} className={`rounded-full px-2 py-0.5 text-xs font-medium ${leaveColour(key)}`}>{label}</span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 py-2 pr-3 text-left text-xs font-medium text-gray-500">Member</th>
              {weekDates.map((d, i) => (
                <th key={i} className="min-w-[110px] px-2 py-2 text-center text-xs font-medium text-gray-500">
                  {d.toLocaleDateString('en-AU', { weekday: 'short' })} <span className="text-gray-400">{d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
              <tr key={member.user_id} className="border-t border-gray-100 dark:border-slate-800">
                <td className="py-2 pr-3 text-xs font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">{member.display_name}</td>
                {weekDates.map((d, i) => {
                  const iso = toISO(d)
                  const dayShifts = shifts.filter(s => s.user_id === member.user_id && s.date === iso)
                  const dayLeave = leaveBlocks.filter(l => l.user_id === member.user_id && l.start_date <= iso && l.end_date >= iso)
                  return (
                    <td key={i} className="px-1 py-1 align-top">
                      <div className="min-h-[48px] rounded-lg p-1">
                        {dayLeave.map(l => (
                          <div key={l.id}
                            className={`mb-1 w-full rounded-lg px-2 py-1 text-xs font-medium ${leaveColour(l.leave_type)}`}>
                            {leaveLabel(l.leave_type, l.half_day)}
                          </div>
                        ))}
                        {dayShifts.map(s => (
                          <button key={s.id} onClick={() => canManageRoster && setFormState({ open: true, shift: s })}
                            className={`mb-1 w-full rounded-lg px-2 py-1 text-left text-xs font-medium ${s.published ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                            {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}
                          </button>
                        ))}
                        {canManageRoster && (
                          <button onClick={() => setFormState({ open: true, defaultDate: iso })}
                            className="flex w-full items-center justify-center rounded-lg p-1 text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-500">
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
    </div>
  )
}
