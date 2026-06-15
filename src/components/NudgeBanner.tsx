'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Nudge = { type: 'deadline' | 'priority'; message: string }

export default function NudgeBanner({ userId }: { userId: string }) {
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const found: Nudge[] = []
      // Use browser local timezone for date comparisons
      const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local TZ
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toLocaleDateString('en-CA')
      // Check for tasks due today or tomorrow
      const { data: dueSoon } = await supabase
        .from('tasks')
        .select('title, due_date, priority')
        .eq('assignee_id', userId)
        .in('status', ['todo', 'in_progress'])
        .lte('due_date', tomorrowStr)
        .order('due_date', { ascending: true })

      if (dueSoon && dueSoon.length > 0) {
        const overdue = dueSoon.filter(t => t.due_date < todayStr)
        const dueToday = dueSoon.filter(t => t.due_date === todayStr)
        if (overdue.length > 0) found.push({ type: 'deadline', message: `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue.` })
        if (dueToday.length > 0) found.push({ type: 'deadline', message: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today.` })
      }

      // Check for priority conflict — urgent/high task sitting in todo while something is in progress
      const { data: inProgress } = await supabase
        .from('tasks')
        .select('id')
        .eq('assignee_id', userId)
        .eq('status', 'in_progress')

      if (inProgress && inProgress.length > 0) {
        const { data: higherPriority } = await supabase
          .from('tasks')
          .select('title')
          .eq('assignee_id', userId)
          .eq('status', 'todo')
          .in('priority', ['urgent', 'high'])
          .limit(1)

        if (higherPriority && higherPriority.length > 0) {
          found.push({ type: 'priority', message: `Higher-priority task waiting: "${higherPriority[0].title}"` })
        }
      }

      setNudges(found)
    }
    check()
  }, [userId])

  if (nudges.length === 0 || dismissed) return null

  const COLOURS = { deadline: 'bg-red-50 border-red-200 text-red-600', priority: 'bg-amber-50 border-amber-200 text-amber-600' }

  return (
    <div className="space-y-2">
      {nudges.map((nudge, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${COLOURS[nudge.type]}`}>
          <span>{nudge.message}</span>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900">Dismiss</button>
        </div>
      ))}
    </div>
  )
}

