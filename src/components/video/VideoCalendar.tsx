'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

type Props = {
  calls: ScheduledCall[]
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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function VideoCalendar({ calls }: Props) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
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

  function handleCallClick(call: ScheduledCall) {
    router.push(`/dashboard/video/${call.id}`)
  }

  if (view === 'week') {
    const weekStart = startOfWeek(anchor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const weekLabel = `${days[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

    return (
      <div>
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
                    onClick={() => handleCallClick(call)}
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
    )
  }

  // Month view
  const monthStart = startOfMonth(anchor)
  const firstDayOfWeek = ((monthStart.getDay() + 6) % 7) // 0=Mon
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)),
  ]
  const monthLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <div>
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
                  onClick={() => handleCallClick(call)}
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
  )
}
