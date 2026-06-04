'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type MemberEntry = {
  email: string
  todaySeconds: number
  weekSeconds: number
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function ManagerTimeView({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<MemberEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const dayOfWeek = now.getDay() // 0=Sun … 6=Sat
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday).toISOString()

      const { data: orgMembers } = await supabase
        .from('organisation_members')
        .select('user_id, profiles(email)')
        .eq('org_id', orgId)

      if (!orgMembers) { setLoading(false); return }

      const results: MemberEntry[] = await Promise.all(
        orgMembers.map(async (m) => {
          const profile = m.profiles as unknown as { email: string }
          const [{ data: today }, { data: week }] = await Promise.all([
            supabase.from('time_entries').select('duration_seconds').eq('user_id', m.user_id).gte('started_at', todayStart).not('ended_at', 'is', null),
            supabase.from('time_entries').select('duration_seconds').eq('user_id', m.user_id).gte('started_at', weekStart).not('ended_at', 'is', null),
          ])
          const todaySeconds = (today ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
          const weekSeconds = (week ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
          return { email: profile?.email ?? 'Unknown', todaySeconds, weekSeconds }
        })
      )

      setMembers(results)
      setLoading(false)
    }
    load()
  }, [orgId])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Team time (today)</h2>
      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : (
        <ul className="space-y-3">
          {members.map(m => (
            <li key={m.email} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <span className="truncate font-semibold text-gray-900">{m.email}</span>
              <div className="text-right shrink-0 ml-4">
                <span className="font-medium text-gray-900">{formatDuration(m.todaySeconds)}</span>
                <span className="ml-2 text-xs font-medium text-gray-500">/ {formatDuration(m.weekSeconds)} this week</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
