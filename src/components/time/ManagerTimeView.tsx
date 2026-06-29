'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type MemberRow = {
  userId: string
  displayName: string
  todaySeconds: number
  weekSeconds: number
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftSecs(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
}

function fmt(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function ManagerTimeView({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const now = new Date()

      const todayStr = toDateStr(now)
      const dow = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
      monday.setHours(0, 0, 0, 0)
      const weekStartStr = toDateStr(monday)
      const nextMonday = new Date(monday)
      nextMonday.setDate(monday.getDate() + 7)
      const weekEndStr = toDateStr(nextMonday)
      const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const weekStartIso = monday.toISOString()

      const { data: orgMembers } = await supabase
        .from('organisation_members')
        .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
        .eq('org_id', orgId)

      if (!orgMembers || orgMembers.length === 0) { setLoading(false); return }

      const userIds = orgMembers.map(m => m.user_id)

      const [
        { data: todayShifts },
        { data: weekShifts },
        { data: todayEntries },
        { data: weekEntries },
      ] = await Promise.all([
        supabase.from('roster_shifts').select('user_id, start_time, end_time')
          .in('user_id', userIds).eq('date', todayStr).eq('published', true).is('deleted_at', null),
        supabase.from('roster_shifts').select('user_id, start_time, end_time')
          .in('user_id', userIds).gte('date', weekStartStr).lt('date', weekEndStr).eq('published', true).is('deleted_at', null),
        supabase.from('time_entries').select('user_id, duration_seconds')
          .in('user_id', userIds).gte('started_at', todayIso).not('ended_at', 'is', null),
        supabase.from('time_entries').select('user_id, duration_seconds')
          .in('user_id', userIds).gte('started_at', weekStartIso).not('ended_at', 'is', null),
      ])

      const todayRosterMap = new Map<string, number>()
      for (const s of todayShifts ?? []) {
        todayRosterMap.set(s.user_id, (todayRosterMap.get(s.user_id) ?? 0) + shiftSecs(s.start_time, s.end_time))
      }
      const weekRosterMap = new Map<string, number>()
      for (const s of weekShifts ?? []) {
        weekRosterMap.set(s.user_id, (weekRosterMap.get(s.user_id) ?? 0) + shiftSecs(s.start_time, s.end_time))
      }
      const todayEntryMap = new Map<string, number>()
      for (const e of todayEntries ?? []) {
        todayEntryMap.set(e.user_id, (todayEntryMap.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0))
      }
      const weekEntryMap = new Map<string, number>()
      for (const e of weekEntries ?? []) {
        weekEntryMap.set(e.user_id, (weekEntryMap.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0))
      }

      const rows: MemberRow[] = orgMembers.map(m => {
        const profile = m.profiles as unknown as { full_name: string | null; email: string }
        return {
          userId: m.user_id,
          displayName: profile?.full_name || profile?.email || 'Unknown',
          todaySeconds: (todayRosterMap.get(m.user_id) ?? 0) + (todayEntryMap.get(m.user_id) ?? 0),
          weekSeconds: (weekRosterMap.get(m.user_id) ?? 0) + (weekEntryMap.get(m.user_id) ?? 0),
        }
      })

      rows.sort((a, b) => b.weekSeconds - a.weekSeconds)
      setMembers(rows)
      setLoading(false)
    }
    load()
  }, [orgId])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-slate-100">Team hours</h2>
      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No team members found.</p>
      ) : (
        <ul className="space-y-2">
          {members.map(m => (
            <li key={m.userId} className="flex items-center justify-between rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-4 py-3 text-sm">
              <span className="truncate font-semibold text-gray-900 dark:text-slate-100">{m.displayName}</span>
              <div className="text-right shrink-0 ml-4">
                <span className="font-bold text-gray-900 dark:text-slate-100">{fmt(m.todaySeconds)}</span>
                <span className="ml-2 text-xs font-medium text-gray-400 dark:text-slate-500">/ {fmt(m.weekSeconds)} this week</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
