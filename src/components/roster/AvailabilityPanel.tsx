'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

// day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function defaultAvailable(hour: number): boolean {
  return hour >= 9 && hour < 17
}

function avKey(day: number, hour: number) {
  return `${day}-${hour}`
}

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

type AvailRow = { day_of_week: number; hour: number; available: boolean }

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
  const [avail, setAvail] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setAvail(new Map())
    supabase
      .from('member_availability')
      .select('day_of_week, hour, available')
      .eq('user_id', member.user_id)
      .eq('org_id', orgId)
      .then(({ data }) => {
        const map = new Map<string, boolean>()
        for (const r of (data ?? []) as AvailRow[]) {
          map.set(avKey(r.day_of_week, r.hour), r.available)
        }
        setAvail(map)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.user_id, orgId])

  function isAvailable(day: number, hour: number): boolean {
    const key = avKey(day, hour)
    return avail.has(key) ? avail.get(key)! : defaultAvailable(hour)
  }

  async function toggle(day: number, hour: number) {
    if (!canEdit || saving) return
    const key = avKey(day, hour)
    const next = !isAvailable(day, hour)
    setSaving(key)
    setAvail(prev => new Map(prev).set(key, next))
    await supabase.from('member_availability').upsert(
      { user_id: member.user_id, org_id: orgId, day_of_week: day, hour, available: next },
      { onConflict: 'user_id,org_id,day_of_week,hour' },
    )
    setSaving(null)
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">{member.display_name}</h3>
          <p className="text-xs text-slate-500">
            Weekly availability
            {canEdit ? ' · click a slot to toggle' : ' · read-only'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-12 border-b border-r border-slate-800 py-2 text-center text-[10px] text-slate-600" />
                {DAY_LABELS.map(d => (
                  <th key={d} className="border-b border-slate-800 py-2 text-center text-xs font-bold text-slate-400">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, h) => (
                <tr key={h} className="border-b border-slate-800/50 last:border-0">
                  <td className="border-r border-slate-800 py-0.5 pr-2 text-right text-[10px] text-slate-600 w-12">
                    {fmtHour(h)}
                  </td>
                  {Array.from({ length: 7 }, (_, d) => {
                    const available = isAvailable(d, h)
                    const key = avKey(d, h)
                    return (
                      <td key={d} className="py-0.5 text-center">
                        <button
                          onClick={() => toggle(d, h)}
                          disabled={!canEdit}
                          title={`${DAY_LABELS[d]} ${fmtHour(h)} — ${available ? 'Available' : 'Unavailable'}${canEdit ? ' (click to toggle)' : ''}`}
                          className={`mx-auto block h-4 w-4 rounded-full transition-all ${
                            saving === key
                              ? 'scale-75 opacity-50'
                              : available
                                ? 'bg-emerald-500 hover:bg-emerald-400'
                                : 'bg-slate-700 hover:bg-slate-600'
                          } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
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

      <div className="flex items-center gap-4 border-t border-slate-800 px-5 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" /> Unavailable
        </span>
        <span className="ml-auto text-[10px] text-slate-600">Default: Mon–Fri 9am–5pm</span>
      </div>
    </div>
  )
}
