'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'

type Slide = {
  title: string
  description: string
  mockup: ReactNode
}

const SLIDES: Slide[] = [
  {
    title: 'Rostering & Scheduling',
    description:
      'Build and publish weekly rosters in minutes. Set recurring shift patterns and notify your team instantly.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 font-mono text-xs">
        <div className="flex gap-1 mb-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="flex-1 text-center text-slate-400">
              {d}
            </div>
          ))}
        </div>
        {(
          [
            ['Alice', [1, 1, 1, 1, 1, 0, 0]],
            ['Bob', [1, 1, 0, 1, 1, 1, 0]],
            ['Carol', [0, 1, 1, 1, 1, 0, 0]],
          ] as [string, number[]][]
        ).map(([name, shifts]) => (
          <div key={name} className="flex gap-1 mb-1 items-center">
            <div className="w-10 text-slate-400 shrink-0">{name}</div>
            {shifts.map((v, i) => (
              <div
                key={i}
                className={`flex-1 h-6 rounded text-center leading-6 text-white text-xs ${
                  v ? 'bg-cyan-600' : 'bg-slate-700'
                }`}
              >
                {v ? '9–5' : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Timesheets',
    description:
      'Auto-generate timesheets from the roster. Employees review, managers approve — no chasing required.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs">
        <div className="grid grid-cols-4 gap-2 text-slate-400 mb-2 font-semibold">
          <span>Employee</span>
          <span>Hours</span>
          <span>Total</span>
          <span>Status</span>
        </div>
        {(
          [
            ['Alice', '8h', '40h', 'Approved'],
            ['Bob', '7.5h', '37.5h', 'Pending'],
            ['Carol', '8h', '40h', 'Approved'],
          ] as string[][]
        ).map(([n, d, t, s]) => (
          <div
            key={n}
            className="grid grid-cols-4 gap-2 py-1.5 border-t border-slate-700 text-slate-300"
          >
            <span>{n}</span>
            <span>{d}</span>
            <span>{t}</span>
            <span
              className={
                s === 'Approved' ? 'text-emerald-400' : 'text-amber-400'
              }
            >
              {s}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Payroll',
    description:
      'Calculate pay from approved timesheets. Generate payslips and track payroll history for every employee.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-2">
        <div className="flex justify-between text-slate-400 font-semibold mb-1">
          <span>Pay Run — Week 24</span>
          <span className="text-emerald-400">Ready</span>
        </div>
        {(
          [
            ['Alice Chen', '40h × $28', '$1,120.00'],
            ['Bob Smith', '37.5h × $25', '$937.50'],
            ['Carol Lee', '40h × $30', '$1,200.00'],
          ] as string[][]
        ).map(([n, calc, total]) => (
          <div
            key={n}
            className="flex justify-between items-center py-1.5 border-t border-slate-700 text-slate-300"
          >
            <span>{n}</span>
            <span className="text-slate-500">{calc}</span>
            <span className="text-white font-semibold">{total}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-slate-600 text-white font-bold">
          <span>Total</span>
          <span>$3,257.50</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Team Chat',
    description:
      'Channels, direct messages, and group chats — all in the same app as your roster and payroll.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-3">
        {[
          { name: 'Alice', msg: "Roster for next week is up 👀", time: '9:41', self: false },
          { name: 'Bob', msg: 'Can I swap Thursday?', time: '9:42', self: false },
          { name: 'You', msg: "Sure, I'll update it now", time: '9:43', self: true },
        ].map(({ name, msg, time, self }) => (
          <div key={time} className={`flex gap-2 ${self ? 'flex-row-reverse' : ''}`}>
            <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-white font-bold shrink-0">
              {name[0]}
            </div>
            <div
              className={`rounded-lg px-3 py-1.5 max-w-[75%] ${
                self ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-200'
              }`}
            >
              <p>{msg}</p>
              <p
                className={`text-right mt-0.5 text-xs ${
                  self ? 'text-cyan-300' : 'text-slate-500'
                }`}
              >
                {time}
              </p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Video Calls',
    description:
      'Start instant video calls from any group chat, or schedule team meetings with calendar invites and email reminders.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 font-semibold">Team Standup · Live</span>
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            3 in call
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: 'Alice', color: 'bg-cyan-600', speaking: true },
            { name: 'Bob', color: 'bg-cyan-600', speaking: false },
            { name: 'You', color: 'bg-slate-600', speaking: false },
          ].map(({ name, color, speaking }) => (
            <div
              key={name}
              className={`rounded-lg aspect-video flex flex-col items-center justify-center gap-1 ${color} ${speaking ? 'ring-2 ring-emerald-400' : ''}`}
            >
              <span className="text-white font-bold text-base">{name[0]}</span>
              <span className="text-white/70 text-xs">{name}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-3 pt-1">
          <div className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300">Mute</div>
          <div className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold">End</div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300">Chat</div>
        </div>
      </div>
    ),
  },
  {
    title: 'Tasks & Projects',
    description:
      'Assign tasks, set due dates, and track progress across projects — from a single dashboard view.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-1">
        {[
          { label: 'Update employee handbook', done: true, priority: 'Low', a: 'A' },
          { label: 'Finalise Q2 payroll run', done: false, priority: 'High', a: 'B' },
          { label: 'Review cert renewals', done: false, priority: 'Med', a: 'C' },
          { label: 'Schedule team training', done: false, priority: 'Med', a: 'A' },
        ].map(({ label, done, priority, a }) => (
          <div
            key={label}
            className="flex items-center gap-2 py-1.5 border-t border-slate-700 text-slate-300"
          >
            <div
              className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'
              }`}
            >
              {done && <span className="text-white text-xs">✓</span>}
            </div>
            <span className={`flex-1 ${done ? 'line-through text-slate-500' : ''}`}>
              {label}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                priority === 'High'
                  ? 'bg-red-900 text-red-300'
                  : priority === 'Med'
                  ? 'bg-amber-900 text-amber-300'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {priority}
            </span>
            <div className="w-5 h-5 rounded-full bg-cyan-700 flex items-center justify-center text-white text-xs">
              {a}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Finance & Invoicing',
    description:
      'Track revenue, expenses, and P&L. Create and send branded invoices directly from the app.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['Revenue', '$48,200', 'text-emerald-400'],
              ['Expenses', '$21,450', 'text-red-400'],
              ['Net P&L', '$26,750', 'text-cyan-400'],
            ] as string[][]
          ).map(([l, v, c]) => (
            <div key={l} className="bg-slate-700 rounded-lg p-2 text-center">
              <p className="text-slate-400">{l}</p>
              <p className={`font-bold mt-1 ${c}`}>{v}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-700 pt-2 text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span>Invoice #0042 — Acme Co</span>
            <span className="text-emerald-400">Paid</span>
          </div>
          <div className="flex justify-between">
            <span>Invoice #0043 — Beta Ltd</span>
            <span className="text-amber-400">Pending</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'HR Profiles & Compliance',
    description:
      'Employee profiles, certification tracking, and onboarding checklists — stay ahead of compliance.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-2">
        {[
          { name: 'Alice Chen', title: 'Senior Tech', certs: ['First Aid', 'Forklift'], ok: true },
          { name: 'Bob Smith', title: 'Technician', certs: ['First Aid'], ok: false },
        ].map(({ name, title, certs, ok }) => (
          <div key={name} className="flex items-start gap-3 py-2 border-t border-slate-700">
            <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white font-bold shrink-0">
              {name[0]}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{name}</p>
              <p className="text-slate-400">{title}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {certs.map((c) => (
                  <span key={c} className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {c}
                  </span>
                ))}
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    ok ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
                  }`}
                >
                  {ok ? 'Certs valid' : 'Renewal due'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'AI Assistant',
    description:
      'Ask questions about your business data in plain English. Instant answers from your own numbers.',
    mockup: (
      <div className="w-full rounded-xl bg-slate-800 p-4 text-xs space-y-3">
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 shrink-0 font-bold">
            U
          </div>
          <div className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5">
            Who worked the most hours last week?
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-white shrink-0 font-bold">
            AI
          </div>
          <div className="bg-cyan-900/50 text-slate-200 rounded-lg px-3 py-1.5 border border-cyan-700">
            <span className="text-cyan-300 font-semibold">Alice Chen</span> logged 44.5h — 4.5h
            overtime. Carol Lee was second with 42h.
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 shrink-0 font-bold">
            U
          </div>
          <div className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5">
            What&apos;s our payroll cost this month?
          </div>
        </div>
      </div>
    ),
  },
]

export default function FeatureCarousel() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset pause when the user returns to the tab/window so the interval
  // doesn't stay stuck after hovering then switching away.
  useEffect(() => {
    function resume() { setPaused(false) }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [])

  useEffect(() => {
    if (paused) return
    intervalRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length)
    }, 4000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [paused])

  const slide = SLIDES[active]

  return (
    <section
      className="bg-white py-24 px-6 border-y border-zinc-100"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="block h-px w-10 bg-cyan-500 shrink-0" />
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-cyan-600">Features</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-zinc-950 mb-16">
          Every tool your<br className="hidden sm:block" /> team needs.
        </h2>

        <div className="grid md:grid-cols-2 gap-12 items-center min-h-72">
          {/* Text side */}
          <div>
            <p className="text-zinc-300 text-sm font-bold uppercase tracking-widest mb-4">
              {String(active + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
            </p>
            <h3 className="text-2xl font-black text-zinc-950 mb-4">{slide.title}</h3>
            <p className="text-zinc-500 text-lg leading-relaxed">{slide.description}</p>
          </div>

          {/* Mockup side — dark panel intentionally shows the app's dark UI */}
          <div className="transition-opacity duration-300">{slide.mockup}</div>
        </div>

        {/* Dot navigation + arrows */}
        <div className="flex items-center justify-center gap-4 mt-12">
          <button
            onClick={() => setActive((active - 1 + SLIDES.length) % SLIDES.length)}
            aria-label="Previous slide"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-cyan-500 hover:text-cyan-500"
          >
            ‹
          </button>
          <div className="flex gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === active ? 'bg-cyan-500 w-6' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setActive((active + 1) % SLIDES.length)}
            aria-label="Next slide"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-cyan-500 hover:text-cyan-500"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  )
}
