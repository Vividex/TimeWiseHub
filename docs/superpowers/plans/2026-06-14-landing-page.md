# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-facing marketing page at `/` with sticky navbar, full-viewport hero, auto-advancing feature carousel, pricing cards, and footer. Authenticated users are redirected to `/dashboard`.

**Architecture:** `src/app/page.tsx` is a server component that checks the Supabase session and redirects logged-in users. All child components are server components except `FeatureCarousel.tsx` (`'use client'`), which uses `useEffect` + `setInterval` for auto-advance.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, `@supabase/ssr` (session check only). No new dependencies.

**Division of labour (handover loop):**
- **Codex** — all `.ts`/`.tsx` file creation and edits.
- **Conductor** — runs `pnpm run build`, commits. Steps marked `[CONDUCTOR]` must NOT be executed by Codex.

---

## File Map

| File | Action |
|------|--------|
| `src/components/landing/Navbar.tsx` | Create |
| `src/components/landing/HeroSection.tsx` | Create |
| `src/components/landing/FeatureCarousel.tsx` | Create — `'use client'` |
| `src/components/landing/PricingSection.tsx` | Create |
| `src/components/landing/Footer.tsx` | Create |
| `src/app/page.tsx` | Modify — replace static redirect with auth check + landing page |

---

## Task 1 — Static layout components

**Files:**
- Create: `src/components/landing/Navbar.tsx`
- Create: `src/components/landing/HeroSection.tsx`
- Create: `src/components/landing/Footer.tsx`

- [ ] **Step C1-1 (Codex): Create `src/components/landing/Navbar.tsx`**

```tsx
import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur border-b border-slate-100">
      <span className="font-bold text-lg text-slate-900">TimeWiseHub</span>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          Get started free
        </Link>
      </div>
    </nav>
  )
}
```

- [ ] **Step C1-2 (Codex): Create `src/components/landing/HeroSection.tsx`**

```tsx
import Link from 'next/link'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-slate-900 via-slate-800 to-violet-950 pt-16">
      <h1 className="text-5xl md:text-7xl font-bold text-white max-w-4xl leading-tight">
        Everything your team needs,{' '}
        <span className="text-violet-400">in one place</span>
      </h1>
      <p className="mt-6 text-xl text-slate-300 max-w-2xl">
        Rostering, timesheets, payroll, chat, tasks, and HR — built for real
        businesses, not enterprise budgets.
      </p>
      <Link
        href="/register"
        className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet-600 text-white text-lg font-semibold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-900/40"
      >
        Get started free
      </Link>
      <p className="mt-4 text-sm text-slate-500">No credit card required</p>
    </section>
  )
}
```

- [ ] **Step C1-3 (Codex): Create `src/components/landing/Footer.tsx`**

```tsx
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 py-10 px-6 text-center text-sm text-slate-500">
      <p className="font-semibold text-slate-700 mb-2">TimeWiseHub</p>
      <div className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-slate-900 transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-slate-900 transition-colors">
          Privacy
        </Link>
      </div>
      <p className="mt-4">© {new Date().getFullYear()} TimeWiseHub. All rights reserved.</p>
    </footer>
  )
}
```

- [ ] **Step C1-4 [CONDUCTOR]: Commit**

```bash
git add src/components/landing/Navbar.tsx src/components/landing/HeroSection.tsx src/components/landing/Footer.tsx
git commit -m "feat: add landing page static components (Navbar, HeroSection, Footer)"
```

---

## Task 2 — FeatureCarousel client component

**Files:**
- Create: `src/components/landing/FeatureCarousel.tsx`

- [ ] **Step C2-1 (Codex): Create `src/components/landing/FeatureCarousel.tsx`**

```tsx
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
                  v ? 'bg-violet-600' : 'bg-slate-700'
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
            <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold shrink-0">
              {name[0]}
            </div>
            <div
              className={`rounded-lg px-3 py-1.5 max-w-[75%] ${
                self ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-200'
              }`}
            >
              <p>{msg}</p>
              <p
                className={`text-right mt-0.5 text-xs ${
                  self ? 'text-violet-300' : 'text-slate-500'
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
            <div className="w-5 h-5 rounded-full bg-violet-700 flex items-center justify-center text-white text-xs">
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
              ['Net P&L', '$26,750', 'text-violet-400'],
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
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold shrink-0">
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
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-white shrink-0 font-bold">
            AI
          </div>
          <div className="bg-violet-900/50 text-slate-200 rounded-lg px-3 py-1.5 border border-violet-700">
            <span className="text-violet-300 font-semibold">Alice Chen</span> logged 44.5h — 4.5h
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
      className="bg-slate-950 py-24 px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
          One platform. Every tool your team needs.
        </h2>

        <div className="grid md:grid-cols-2 gap-12 items-center min-h-72">
          {/* Text side */}
          <div>
            <p className="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-3">
              {String(active + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
            </p>
            <h3 className="text-2xl font-bold text-white mb-4">{slide.title}</h3>
            <p className="text-slate-400 text-lg leading-relaxed">{slide.description}</p>
          </div>

          {/* Mockup side */}
          <div className="transition-opacity duration-300">{slide.mockup}</div>
        </div>

        {/* Dot navigation */}
        <div className="flex justify-center gap-2 mt-12">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === active ? 'bg-violet-400 w-6' : 'bg-slate-600 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step C2-2 [CONDUCTOR]: Commit**

```bash
git add src/components/landing/FeatureCarousel.tsx
git commit -m "feat: add FeatureCarousel client component with 8 slides"
```

---

## Task 3 — PricingSection

**Files:**
- Create: `src/components/landing/PricingSection.tsx`

- [ ] **Step C3-1 (Codex): Create `src/components/landing/PricingSection.tsx`**

```tsx
import Link from 'next/link'
import { PLANS } from '@/lib/stripe'

const FREE_FEATURES = [
  'Up to 3 projects',
  '30-day history',
  'Team chat (channels & DMs)',
  'Tasks & timesheets',
  'Basic invoicing',
]

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited projects',
  'Full history',
  'Finance & P&L reporting',
  'AI assistant',
  'Payslip vault',
]

const BUSINESS_FEATURES = [
  'Everything in Pro',
  'Roster-driven timesheets',
  'Payroll processing',
  'HR profiles & certifications',
  'Onboarding checklists',
  'Push notifications',
  'Priority support',
]

type CardProps = {
  label: string
  price: string
  note: string
  features: string[]
  highlight: boolean
}

function PricingCard({ label, price, note, features, highlight }: CardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 ${
        highlight
          ? 'bg-violet-600 text-white ring-2 ring-violet-400'
          : 'bg-white text-slate-900 ring-1 ring-slate-200'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-violet-400 text-white">
          Most popular
        </span>
      )}
      <h3 className={`text-xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>
        {label}
      </h3>
      <div className="mt-4 flex items-end gap-1">
        <span className="text-4xl font-bold">{price}</span>
        {price !== 'Free' && (
          <span className={`text-sm mb-1 ${highlight ? 'text-violet-200' : 'text-slate-500'}`}>
            /mo
          </span>
        )}
      </div>
      <p className={`text-sm mt-1 ${highlight ? 'text-violet-200' : 'text-slate-500'}`}>{note}</p>
      <ul className="mt-6 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 ${highlight ? 'text-violet-200' : 'text-violet-600'}`}>
              ✓
            </span>
            <span className={highlight ? 'text-violet-100' : 'text-slate-700'}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/register"
        className={`mt-8 block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
          highlight
            ? 'bg-white text-violet-700 hover:bg-violet-50'
            : 'bg-violet-600 text-white hover:bg-violet-700'
        }`}
      >
        Get started free
      </Link>
    </div>
  )
}

export default function PricingSection() {
  return (
    <section className="bg-slate-50 py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-4">
          Simple, transparent pricing
        </h2>
        <p className="text-slate-500 text-center mb-16">
          Start free. Upgrade when your team grows.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <PricingCard
            label={PLANS.free.label}
            price="Free"
            note="Perfect for getting started"
            features={FREE_FEATURES}
            highlight={false}
          />
          <PricingCard
            label={PLANS.pro.label}
            price={`$${PLANS.pro.priceAud}`}
            note="For growing teams"
            features={PRO_FEATURES}
            highlight={true}
          />
          <PricingCard
            label={PLANS.team.label}
            price={`$${PLANS.team.priceAud}`}
            note={`Per ${PLANS.team.unitSize} employees/mo`}
            features={BUSINESS_FEATURES}
            highlight={false}
          />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step C3-2 [CONDUCTOR]: Commit**

```bash
git add src/components/landing/PricingSection.tsx
git commit -m "feat: add PricingSection component pulling from PLANS"
```

---

## Task 4 — Wire page.tsx + build gate

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step C4-1 (Codex): Replace `src/app/page.tsx` with auth-check + landing page**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Navbar from '@/components/landing/Navbar'
import HeroSection from '@/components/landing/HeroSection'
import FeatureCarousel from '@/components/landing/FeatureCarousel'
import PricingSection from '@/components/landing/PricingSection'
import Footer from '@/components/landing/Footer'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main>
      <Navbar />
      <HeroSection />
      <FeatureCarousel />
      <PricingSection />
      <Footer />
    </main>
  )
}
```

- [ ] **Step C4-2 [CONDUCTOR]: `pnpm run build` — must pass clean**

- [ ] **Step C4-3 [CONDUCTOR]: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace root redirect with landing page"
```

---

## Verification

`pnpm run build` must pass clean after Task 4.

Manual smoke:
- Visit `/` while logged out → landing page renders with sticky navbar, hero, carousel, pricing, footer
- Auto-advance cycles through all 8 slides; hover pauses it; dot nav jumps to slide
- "Get started free" buttons → `/register`; "Log in" → `/login`
- Visit `/` while logged in → immediately redirects to `/dashboard`
- Pricing cards show correct labels and prices from `PLANS` (Free $0, Pro $12, Business $29)
