'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

// day_of_week: 0=Mon … 6=Sun
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Status = 'available' | 'unavailable' | 'uncontactable'

function defaultStatus(hour: number): Status {
  return hour >= 9 && hour < 17 ? 'available' : 'unavailable'
}

function cycleStatus(s: Status): Status {
  if (s === 'available') return 'unavailable'
  if (s === 'unavailable') return 'uncontactable'
  return 'available'
}

function avKey(day: number, hour: number) { return `${day}-${hour}` }

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function getWeekDates(anchor: Date): Date[] {
  const dow = anchor.getDay()
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - ((dow + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

// Map a meeting's time range onto (day, hour) cells for the displayed week.
// now is passed in so past meetings (and past hours of ongoing meetings) are excluded.
function meetingToSlots(
  title: string,
  startsAt: string,
  endsAt: string | null,
  weekDates: Date[],
  map: Map<string, string>,
  now: Date,
) {
  const start = new Date(startsAt)
  const end = endsAt
    ? new Date(endsAt)
    : new Date(start.getTime() + 60 * 60 * 1000)

  // Meeting has fully ended — nothing to block
  if (now >= end) return

  // Find which weekDates index this meeting falls on (local date comparison)
  const startDay = start.toLocaleDateString('en-CA') // YYYY-MM-DD local
  const dayIdx = weekDates.findIndex(
    d => d.toLocaleDateString('en-CA') === startDay,
  )
  if (dayIdx === -1) return

  const startHour = start.getHours()
  const endHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0)
  for (let h = startHour; h < Math.min(endHour, 24); h++) {
    // Each hour slot h covers h:00–(h+1):00 on that day.
    // Only block the slot if we haven't passed the end of it yet.
    const slotEnd = new Date(weekDates[dayIdx])
    slotEnd.setHours(h + 1, 0, 0, 0)
    if (now < slotEnd) {
      map.set(avKey(dayIdx, h), title)
    }
  }
}

export default function AvailabilityPanel({
  member,
  orgId,
  canEdit,
  onClose,
}: {
  member: { user_id: string; display_name: string }
  orgId: string
  canEdit: boolean
  onClose: () => void
}) {
  const supabase = createClient()
  const [avail, setAvail] = useState<Map<string, Status>>(new Map())
  const [meetingSlots, setMeetingSlots] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())

  const weekDates = getWeekDates(weekAnchor)
  const weekStartStr = weekDates[0].toLocaleDateString('en-CA')

  useEffect(() => {
    setLoading(true)

    const weekEnd = new Date(weekDates[6])
    weekEnd.setHours(23, 59, 59, 999)

    Promise.all([
      // Manual availability (recurring weekly template)
      supabase
        .from('member_availability')
        .select('day_of_week, hour, status')
        .eq('user_id', member.user_id)
        .eq('org_id', orgId),

      // Org-wide scheduled calls (affects all members)
      supabase
        .from('scheduled_calls')
        .select('title, starts_at, ends_at')
        .eq('org_id', orgId)
        .gte('starts_at', weekDates[0].toISOString())
        .lte('starts_at', weekEnd.toISOString()),

      // This user's personal calendar events
      supabase
        .from('calendar_events')
        .select('title, start_at, end_at, all_day')
        .eq('created_by', member.user_id)
        .gte('start_at', weekDates[0].toISOString())
        .lte('start_at', weekEnd.toISOString()),
    ]).then(([availRes, callsRes, eventsRes]) => {
      // Build availability map
      const aMap = new Map<string, Status>()
      for (const r of (availRes.data ?? []) as { day_of_week: number; hour: number; status: Status }[]) {
        aMap.set(avKey(r.day_of_week, r.hour), r.status)
      }
      setAvail(aMap)

      // Build meeting-slot overlay — only block hours that haven't ended yet
      const now = new Date()
      const mMap = new Map<string, string>()
      for (const c of (callsRes.data ?? []) as { title: string; starts_at: string; ends_at: string | null }[]) {
        meetingToSlots(c.title, c.starts_at, c.ends_at, weekDates, mMap, now)
      }
      for (const e of (eventsRes.data ?? []) as { title: string; start_at: string; end_at: string | null; all_day: boolean }[]) {
        if (!e.all_day) meetingToSlots(e.title, e.start_at, e.end_at, weekDates, mMap, now)
      }
      setMeetingSlots(mMap)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.user_id, orgId, weekStartStr])

  function getStatus(day: number, hour: number): Status {
    const key = avKey(day, hour)
    return avail.has(key) ? avail.get(key)! : defaultStatus(hour)
  }

  async function toggle(day: number, hour: number) {
    if (!canEdit || saving) return
    const key = avKey(day, hour)
    const next = cycleStatus(getStatus(day, hour))
    setSaving(key)
    setAvail(prev => new Map(prev).set(key, next))
    await supabase.from('member_availability').upsert(
      { user_id: member.user_id, org_id: orgId, day_of_week: day, hour, status: next },
      { onConflict: 'user_id,org_id,day_of_week,hour' },
    )
    setSaving(null)
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">{member.display_name}</h3>
          <p className="text-xs text-slate-500">
            {canEdit ? 'Click a slot to cycle: available → unavailable → uncontactable' : 'Read-only'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d) }}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[128px] text-center text-xs font-medium text-slate-400">
            {fmt(weekDates[0])} – {fmt(weekDates[6])}
          </span>
          <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d) }}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300">
            <ChevronRight size={14} />
          </button>
          <button onClick={onClose}
            className="ml-2 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-12 border-b border-r border-slate-800 py-2" />
                {DAY_LABELS.map((label, i) => (
                  <th key={label} className="border-b border-slate-800 py-2 text-center">
                    <div className="text-xs font-bold text-slate-400">{label}</div>
                    <div className="text-[10px] text-slate-600">
                      {weekDates[i].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, h) => (
                <tr key={h} className="border-b border-slate-800/50 last:border-0">
                  <td className="w-12 border-r border-slate-800 py-0.5 pr-2 text-right text-[10px] text-slate-600">
                    {fmtHour(h)}
                  </td>
                  {Array.from({ length: 7 }, (_, d) => {
                    const key = avKey(d, h)
                    const meetingTitle = meetingSlots.get(key)
                    const status = getStatus(d, h)
                    const isSaving = saving === key

                    let dotCls: string
                    let tipText: string
                    if (meetingTitle) {
                      dotCls = 'bg-rose-600 ring-1 ring-rose-400/60 cursor-default'
                      tipText = `Meeting: ${meetingTitle}`
                    } else if (status === 'available') {
                      dotCls = `bg-emerald-500 ${canEdit ? 'hover:bg-emerald-400 cursor-pointer' : 'cursor-default'}`
                      tipText = `${DAY_LABELS[d]} ${fmtHour(h)} — Available`
                    } else if (status === 'uncontactable') {
                      dotCls = `bg-red-500 ${canEdit ? 'hover:bg-red-400 cursor-pointer' : 'cursor-default'}`
                      tipText = `${DAY_LABELS[d]} ${fmtHour(h)} — Uncontactable`
                    } else {
                      dotCls = `bg-slate-700 ${canEdit ? 'hover:bg-slate-600 cursor-pointer' : 'cursor-default'}`
                      tipText = `${DAY_LABELS[d]} ${fmtHour(h)} — Unavailable`
                    }

                    return (
                      <td key={d} className="py-0.5 text-center">
                        <button
                          onClick={() => !meetingTitle && toggle(d, h)}
                          disabled={!canEdit || !!meetingTitle}
                          title={tipText}
                          className={`mx-auto block h-4 w-4 rounded-full transition-all ${isSaving ? 'scale-75 opacity-50' : ''} ${dotCls}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-800 px-5 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" /> Unavailable
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Uncontactable
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-600 ring-1 ring-rose-400/60" /> Meeting (auto)
        </span>
      </div>
    </div>
  )
}
