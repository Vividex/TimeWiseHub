# New User Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide new users through TimeWiseHub with a skip-or-proceed welcome modal, a spotlight-driven tour of key nav areas, and a tips screen at the end — all implemented without third-party libraries.

**Architecture:** `TutorialProvider` wraps the dashboard layout and holds tour state in memory. A fixed dark overlay with `z-50` blacks out the UI; the target nav element is elevated to `z-60` via context-driven className. Dismissal is persisted to a `user_onboarding_dismissed` Supabase table so the tour never re-shows after completion or skip. A bouncing arrow and explanation card are positioned using `getBoundingClientRect`.

**Tech Stack:** Next.js App Router, React 19 context, TypeScript strict, Tailwind v4, Supabase (browser client for dismissal write).

**Handover loop note:** Codex writes all file edits. Conductor runs `pnpm run build`, `git commit`, and Supabase MCP `apply_migration`.

**Dependency:** The `data-tutorial="roster"` attribute targets the Roster nav item added by the HR depth plan (`2026-06-13-hr-depth.md`). Apply that plan's Task 2 before this plan's Task 5.

---

## File Map

**New files**
- `supabase/schema-049-tutorial-dismissed.sql`
- `src/app/api/tutorial/dismiss/route.ts`
- `src/lib/tutorial-steps.ts`
- `src/components/tutorial/TutorialProvider.tsx`
- `src/components/tutorial/TutorialOverlay.tsx`
- `src/components/tutorial/WelcomeModal.tsx`
- `src/components/tutorial/TipsScreen.tsx`

**Modified files**
- `src/app/dashboard/layout.tsx` — wrap with TutorialProvider, pass `initialDismissed`
- `src/components/nav/SidebarNav.tsx` — add `data-tutorial` attributes + context-driven blocking

---

## Task 1: Database migration (conductor)

**Files:**
- Create: `supabase/schema-049-tutorial-dismissed.sql`

- [ ] **Step 1: Write `supabase/schema-049-tutorial-dismissed.sql`**

```sql
create table if not exists user_onboarding_dismissed (
  user_id      uuid references auth.users on delete cascade primary key,
  org_id       uuid references organisations on delete cascade,
  dismissed_at timestamptz default now() not null
);
alter table user_onboarding_dismissed enable row level security;
create policy "users manage own dismissal" on user_onboarding_dismissed
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Conductor applies migration via Supabase MCP `apply_migration`**

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-049-tutorial-dismissed.sql
git commit -m "feat: add tutorial dismissed tracking table"
```

---

## Task 2: Dismiss API route

**Files:**
- Create: `src/app/api/tutorial/dismiss/route.ts`

- [ ] **Step 1: Write `src/app/api/tutorial/dismiss/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()

  const { error } = await supabase
    .from('user_onboarding_dismissed')
    .upsert({ user_id: user.id, org_id: membership?.org_id ?? null })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Conductor runs `pnpm run build` — must pass clean**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tutorial/dismiss/route.ts
git commit -m "feat: add tutorial dismiss API route"
```

---

## Task 3: Steps config and TutorialProvider

**Files:**
- Create: `src/lib/tutorial-steps.ts`
- Create: `src/components/tutorial/TutorialProvider.tsx`

- [ ] **Step 1: Write `src/lib/tutorial-steps.ts`**

```ts
export type TutorialStep = {
  id: string
  target: string        // matches data-tutorial attribute value
  heading: string
  body: string
  roles: ('owner' | 'admin' | 'manager' | 'employee')[]
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'home',
    target: 'home',
    heading: 'Your home base',
    body: 'Everything important surfaces here — your tasks, upcoming shifts, and what needs attention today.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
  {
    id: 'clients',
    target: 'clients',
    heading: 'Your clients',
    body: 'Add clients first. Time entries, invoices, projects, and sessions all link back to a client.',
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'time',
    target: 'time',
    heading: 'Tracking time',
    body: 'Start the timer when you begin work, or log time manually. Entries attach to a client and project.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
  {
    id: 'roster',
    target: 'roster',
    heading: 'Scheduling your team',
    body: 'Build the week\'s roster here. Hit Publish and your team gets notified instantly.',
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'roster-employee',
    target: 'roster',
    heading: 'Your roster',
    body: 'See when you\'re scheduled to work. You\'ll get a notification whenever a new roster is published.',
    roles: ['employee'],
  },
  {
    id: 'assistant',
    target: 'assistant',
    heading: 'Your AI assistant',
    body: 'Ask it anything — "how many hours did I log this week?", "draft an invoice for Acme". It knows your data.',
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'chat',
    target: 'chat',
    heading: 'Team chat',
    body: 'Message your team without leaving the app. Respects quiet hours — no pings outside work time.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
]

export type UserRole = 'owner' | 'admin' | 'manager' | 'employee'

export function getStepsForRole(role: UserRole): TutorialStep[] {
  // Deduplicate: if two steps share a target, only include the one matching this role
  const seen = new Set<string>()
  return TUTORIAL_STEPS.filter(s => {
    if (!s.roles.includes(role)) return false
    if (seen.has(s.target)) return false
    seen.add(s.target)
    return true
  })
}
```

- [ ] **Step 2: Write `src/components/tutorial/TutorialProvider.tsx`**

```tsx
'use client'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { TutorialStep, UserRole } from '@/lib/tutorial-steps'
import { getStepsForRole } from '@/lib/tutorial-steps'

type TutorialPhase = 'welcome' | 'tour' | 'tips' | 'done'

type TutorialContextValue = {
  phase: TutorialPhase
  currentStep: TutorialStep | null
  stepIndex: number
  totalSteps: number
  activeTarget: string | null  // the data-tutorial value currently spotlit
  advance: () => void
  skip: () => void
}

const TutorialContext = createContext<TutorialContextValue>({
  phase: 'done',
  currentStep: null,
  stepIndex: 0,
  totalSteps: 0,
  activeTarget: null,
  advance: () => {},
  skip: () => {},
})

export function useTutorial() { return useContext(TutorialContext) }

async function writeDismissed() {
  await fetch('/api/tutorial/dismiss', { method: 'POST' })
}

export default function TutorialProvider({
  children,
  initialDismissed,
  role,
}: {
  children: ReactNode
  initialDismissed: boolean
  role: UserRole
}) {
  const steps = getStepsForRole(role)
  const [phase, setPhase] = useState<TutorialPhase>(initialDismissed ? 'done' : 'welcome')
  const [stepIndex, setStepIndex] = useState(0)

  const advance = useCallback(() => {
    if (phase === 'welcome') {
      setPhase('tour')
      setStepIndex(0)
    } else if (phase === 'tour') {
      if (stepIndex < steps.length - 1) {
        setStepIndex(i => i + 1)
      } else {
        setPhase('tips')
      }
    } else if (phase === 'tips') {
      writeDismissed()
      setPhase('done')
    }
  }, [phase, stepIndex, steps.length])

  const skip = useCallback(() => {
    writeDismissed()
    setPhase('done')
  }, [])

  const currentStep = phase === 'tour' ? steps[stepIndex] ?? null : null
  const activeTarget = currentStep?.target ?? null

  return (
    <TutorialContext.Provider value={{ phase, currentStep, stepIndex, totalSteps: steps.length, activeTarget, advance, skip }}>
      {children}
    </TutorialContext.Provider>
  )
}
```

- [ ] **Step 3: Conductor runs `pnpm run build` — must pass clean**

- [ ] **Step 4: Commit**

```bash
git add src/lib/tutorial-steps.ts src/components/tutorial/TutorialProvider.tsx
git commit -m "feat: add tutorial steps config and provider context"
```

---

## Task 4: Overlay, WelcomeModal, TipsScreen

**Files:**
- Create: `src/components/tutorial/WelcomeModal.tsx`
- Create: `src/components/tutorial/TipsScreen.tsx`
- Create: `src/components/tutorial/TutorialOverlay.tsx`

- [ ] **Step 1: Write `src/components/tutorial/WelcomeModal.tsx`**

```tsx
'use client'
import { useTutorial } from './TutorialProvider'

export default function WelcomeModal() {
  const { phase, advance, skip } = useTutorial()
  if (phase !== 'welcome') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to TimeWiseHub</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
          Let's show you around — takes about 2 minutes.
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={advance}
            className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
            Show me around
          </button>
          <button onClick={skip}
            className="w-full rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/tutorial/TipsScreen.tsx`**

```tsx
'use client'
import { useTutorial } from './TutorialProvider'

const TIPS = [
  { heading: 'Quiet hours', body: 'Set your working hours in Settings. Chat notifications won\'t interrupt you outside them.' },
  { heading: 'Expense export', body: 'Log expenses as you go, then export a CSV for your accountant at tax time.' },
  { heading: 'Insights', body: 'See billable vs non-billable time, project health, and team activity at a glance.' },
  { heading: 'Payslips', body: 'Your payslips are stored in Finance → Payslips, always accessible.' },
  { heading: 'Leave balances', body: 'Request leave and track your balance under People → Leave.' },
]

export default function TipsScreen() {
  const { phase, advance } = useTutorial()
  if (phase !== 'tips') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">A few things worth knowing</h2>
        <div className="space-y-4 mb-8">
          {TIPS.map((t, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">{t.heading}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t.body}</p>
            </div>
          ))}
        </div>
        <button onClick={advance}
          className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
          Let's go
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/tutorial/TutorialOverlay.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useTutorial } from './TutorialProvider'

export default function TutorialOverlay() {
  const { phase, currentStep, stepIndex, totalSteps, advance, skip } = useTutorial()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase !== 'tour' || !currentStep) { setTargetRect(null); return }

    function measure() {
      const el = document.querySelector(`[data-tutorial="${currentStep!.target}"]`)
      if (el) setTargetRect(el.getBoundingClientRect())
    }

    measure()
    intervalRef.current = setInterval(measure, 200)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phase, currentStep])

  if (phase !== 'tour' || !currentStep) return null

  const CARD_WIDTH = 280
  const ARROW_SIZE = 20

  // Position card to the right of target, or left if near right edge
  let cardLeft = targetRect ? targetRect.right + 16 : 0
  let cardTop = targetRect ? targetRect.top : 0
  if (targetRect && cardLeft + CARD_WIDTH > window.innerWidth - 16) {
    cardLeft = targetRect.left - CARD_WIDTH - 16
  }

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 z-50 bg-black/60 pointer-events-none" />

      {/* Skip button always accessible */}
      <button onClick={skip}
        className="fixed top-4 right-4 z-[70] rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm">
        Skip tour
      </button>

      {/* Bouncing arrow */}
      {targetRect && (
        <div
          className="fixed z-[70] pointer-events-none"
          style={{ left: targetRect.right + 4, top: targetRect.top + targetRect.height / 2 - ARROW_SIZE / 2 }}
        >
          <style>{`
            @keyframes bounce-x { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
            .tutorial-arrow { animation: bounce-x 0.8s ease-in-out infinite; }
          `}</style>
          <div className="tutorial-arrow text-cyan-400 text-lg leading-none">›</div>
        </div>
      )}

      {/* Explanation card */}
      {targetRect && (
        <div
          className="fixed z-[70] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5"
          style={{ left: cardLeft, top: Math.max(8, Math.min(cardTop, window.innerHeight - 220)), width: CARD_WIDTH }}
        >
          <p className="text-xs font-medium text-cyan-500 mb-1">{stepIndex + 1} of {totalSteps}</p>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{currentStep.heading}</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">{currentStep.body}</p>
          <button onClick={advance}
            className="w-full rounded-xl bg-cyan-500 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
            {stepIndex < totalSteps - 1 ? 'Next →' : 'Done'}
          </button>
        </div>
      )}

      {/* Spotlight ring on target element — achieved via box-shadow on the element itself via a style tag */}
      {targetRect && (
        <style>{`
          [data-tutorial="${currentStep.target}"] {
            position: relative;
            z-index: 60 !important;
            box-shadow: 0 0 0 3px rgb(34 211 238), 0 0 0 6px rgba(34,211,238,0.2) !important;
            border-radius: 12px;
          }
        `}</style>
      )}
    </>
  )
}
```

- [ ] **Step 4: Conductor runs `pnpm run build` — must pass clean**

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/WelcomeModal.tsx src/components/tutorial/TipsScreen.tsx src/components/tutorial/TutorialOverlay.tsx
git commit -m "feat: add tutorial overlay, welcome modal, and tips screen"
```

---

## Task 5: Wire into dashboard layout and nav

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/nav/SidebarNav.tsx`

- [ ] **Step 1: Update `src/app/dashboard/layout.tsx` to wrap children with TutorialProvider**

Replace the entire file content with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import WelcomeModal from '@/components/tutorial/WelcomeModal'
import TipsScreen from '@/components/tutorial/TipsScreen'
import TutorialOverlay from '@/components/tutorial/TutorialOverlay'
import type { UserRole } from '@/lib/tutorial-steps'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role, created_at').eq('user_id', user.id).maybeSingle()

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const isNewMember = membership?.created_at
    ? new Date(membership.created_at) > thirtyDaysAgo
    : false

  let initialDismissed = true
  if (isNewMember) {
    const { data: dismissed } = await supabase
      .from('user_onboarding_dismissed').select('user_id').eq('user_id', user.id).maybeSingle()
    initialDismissed = !!dismissed
  }

  const role = (membership?.role ?? 'employee') as UserRole

  return (
    <TutorialProvider initialDismissed={initialDismissed} role={role}>
      <ChatRealtimeProvider userId={user.id}>
        <DashboardShell email={user.email ?? ''}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} />
        </DashboardShell>
      </ChatRealtimeProvider>
      <WelcomeModal />
      <TipsScreen />
      <TutorialOverlay />
    </TutorialProvider>
  )
}
```

- [ ] **Step 2: Add `data-tutorial` attributes and nav blocking to `src/components/nav/SidebarNav.tsx`**

Add `tutorialId?: string` to the `NavItem` type and update `NAV_GROUPS`:

```tsx
type NavItem = { label: string; href: string; icon: LucideIcon; tutorialId?: string }
```

Update the nav groups to add `tutorialId` to the relevant items:

```tsx
export const NAV_GROUPS: NavGroup[] = [
  { title: 'Home', items: [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard, tutorialId: 'home' },
  ] },
  { title: 'Delivery', items: [
    { label: 'Clients', href: '/dashboard/clients', icon: Users, tutorialId: 'clients' },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
    { label: 'Time', href: '/dashboard/time', icon: Clock, tutorialId: 'time' },
  ] },
  { title: 'Communication', items: [
    { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare, tutorialId: 'chat' },
    { label: 'Assistant', href: '/dashboard/assistant', icon: Sparkles, tutorialId: 'assistant' },
  ] },
  { title: 'Money', items: [
    { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
    { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
    { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
  ] },
  { title: 'People', items: [
    { label: 'Leave',   href: '/dashboard/leave',  icon: Palmtree },
    { label: 'Roster',  href: '/dashboard/roster', icon: CalendarRange, tutorialId: 'roster' },
    { label: 'Team',    href: '/dashboard/team',   icon: Users2 },
  ] },
  { title: 'Insights', items: [
    { label: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
  ] },
]
```

Add `useTutorial` import at the top of `SidebarNav.tsx`:

```tsx
import { useTutorial } from '@/components/tutorial/TutorialProvider'
```

Update `NavLink` to read from tutorial context and apply blocking + `data-tutorial` attribute:

```tsx
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  const unread = useChatUnreadTotal()
  const badge = item.href === '/dashboard/chat' && unread > 0 ? (unread > 99 ? '99+' : unread) : null
  const { activeTarget } = useTutorial()

  const isBlocked = !!activeTarget && item.tutorialId !== activeTarget
  const isSpotlit = !!activeTarget && item.tutorialId === activeTarget

  return (
    <Link
      href={item.href}
      data-tutorial={item.tutorialId}
      className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-cyan-400 bg-slate-800 text-cyan-400' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
      } ${isBlocked ? 'pointer-events-none opacity-30' : ''} ${isSpotlit ? 'relative' : ''}`}
      tabIndex={isBlocked ? -1 : undefined}
    >
      <Icon size={16} className="shrink-0" />
      {item.label}
      {badge && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}
```

- [ ] **Step 3: Conductor runs `pnpm run build` — must pass clean**

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/layout.tsx src/components/nav/SidebarNav.tsx
git commit -m "feat: wire tutorial provider into dashboard layout and nav with spotlight blocking"
```
