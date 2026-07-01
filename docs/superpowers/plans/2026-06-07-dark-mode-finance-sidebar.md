# Dark Mode · Finance Section · Sidebar Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system-aware dark mode, a grouped icon sidebar, and a full Finance/Revenue page (income + expenses P&L) to TimeWiseHub.

**Architecture:** `next-themes` manages theme state server-safely by mutating `<html class="dark">`. Tailwind v4 `@custom-variant` activates `dark:` utilities. Finance uses a new `income_entries` table alongside the existing `expenses` table to produce a complete P&L view; paid invoices auto-insert entries via the mark-paid API route.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, `next-themes`, `lucide-react`, Supabase (PostgreSQL + RLS), TypeScript. No test framework — use `pnpm run build` as verification gate.

---

## File Map

| Action | Path |
|---|---|
| Modify | `package.json` |
| Modify | `src/app/globals.css` |
| Modify | `src/app/layout.tsx` |
| Create | `src/components/ThemeToggle.tsx` |
| Create | `src/components/ThemeSelector.tsx` |
| Modify | `src/components/DashboardShell.tsx` |
| Modify | `src/app/settings/page.tsx` |
| Modify | `src/app/(auth)/login/page.tsx` |
| Modify | `src/app/(auth)/register/page.tsx` |
| Modify | `src/app/(auth)/reset-password/page.tsx` |
| Modify | `src/app/dashboard/page.tsx` (dark: classes on bg/card patterns) |
| Modify | `src/app/dashboard/expenses/page.tsx` |
| Modify | `src/app/dashboard/insights/page.tsx` |
| Modify | `src/app/dashboard/billing/page.tsx` |
| Create | `supabase/schema-027-income-entries.sql` |
| Create | `src/components/finance/FinanceSummary.tsx` |
| Create | `src/components/finance/FinanceChart.tsx` |
| Create | `src/components/finance/IncomeForm.tsx` |
| Create | `src/components/finance/IncomeList.tsx` |
| Create | `src/app/dashboard/finance/page.tsx` |
| Modify | `src/app/api/invoices/[id]/mark-paid/route.ts` |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install lucide-react and next-themes**

```bash
cd C:/GameForge/timewisehub
pnpm add lucide-react next-themes
```

Expected output: packages added, lockfile updated, no errors.

- [ ] **Step 2: Verify build still passes**

```bash
pnpm run build
```

Expected: `✓ Compiled successfully` (or `Route (app) ...` table, zero type errors).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install lucide-react and next-themes"
```

---

### Task 2: Dark mode CSS foundation

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add @custom-variant and html.dark token overrides**

Replace the full contents of `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/inter/700.css";
@import "@fontsource/poppins/700.css";
@import "@fontsource/poppins/900.css";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #0f172a;
}

html.dark {
  --background: #020617;
  --foreground: #f1f5f9;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: 'Inter', sans-serif;
}

h1, h2, h3 {
  font-family: 'Poppins', sans-serif;
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build.

---

### Task 3: ThemeProvider in layout.tsx

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Wrap body content in ThemeProvider**

Replace the entire file `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from 'next-themes'
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import CookieBanner from "@/components/CookieBanner";

export const metadata: Metadata = {
  title: "TimeWiseHub — Track Time. Control Costs. Grow Smarter.",
  description: "Track time, manage projects, and stay on top of deadlines.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TimeWiseHub",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="twh-theme">
          <ServiceWorkerRegistration />
          {children}
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build. The `suppressHydrationWarning` on `<html>` silences the next-themes class mutation warning.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: add next-themes ThemeProvider and Tailwind v4 dark variant"
```

---

### Task 4: ThemeToggle component

**Files:**
- Create: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ThemeToggle.tsx`:

```tsx
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-slate-800" />
  }

  function cycle() {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label} — click to cycle`}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-500 transition-colors hover:bg-gray-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
    >
      <Icon size={16} />
    </button>
  )
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build.

---

### Task 5: DashboardShell full rewrite (grouped sidebar + icons + dark mode)

**Files:**
- Modify: `src/components/DashboardShell.tsx`

- [ ] **Step 1: Replace entire file**

Replace the entire contents of `src/components/DashboardShell.tsx` with:

```tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Clock, FolderKanban, CalendarDays, Palmtree,
  Receipt, Users, FileText, TrendingUp,
  BarChart3, FileBarChart2, Activity,
  CreditCard, Download, HelpCircle, Settings,
  type LucideIcon,
} from 'lucide-react'
import SignOutButton from '@/components/SignOutButton'
import ThemeToggle from '@/components/ThemeToggle'

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavGroup = { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Work',
    items: [
      { label: 'Time', href: '/dashboard/time', icon: Clock },
      { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
      { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
      { label: 'Leave', href: '/dashboard/leave', icon: Palmtree },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
      { label: 'Clients', href: '/dashboard/clients', icon: Users },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
      { label: 'Reports', href: '/dashboard/reports', icon: FileBarChart2 },
      { label: 'Activity', href: '/dashboard/activity', icon: Activity },
    ],
  },
]

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Download App', href: '/download', icon: Download },
  { label: 'Help', href: '/help', icon: HelpCircle },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/time': 'Time tracking',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/clients': 'Clients',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/projects': 'Projects',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/reports': 'Reports',
  '/dashboard/activity': 'Activity',
  '/dashboard/billing': 'Billing',
  '/dashboard/finance': 'Finance',
}

function getTitle(pathname: string) {
  if (pathname.startsWith('/dashboard/projects/')) return 'Project detail'
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}

function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') return pathname === '/settings'
  if (href === '/dashboard') return pathname === href
  return pathname.startsWith(href)
}

function NavLink({ item, pathname, mobile }: { item: NavItem; pathname: string; mobile?: boolean }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  if (mobile) {
    return (
      <Link
        href={item.href}
        className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Icon size={15} className="shrink-0" />
        {item.label}
      </Link>
    )
  }
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-cyan-400 bg-slate-800 text-cyan-400'
          : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {item.label}
    </Link>
  )
}

export default function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode
  email: string
}) {
  const pathname = usePathname()
  const title = getTitle(pathname)
  const allItems = [...NAV_GROUPS.flatMap(g => g.items), ...BOTTOM_ITEMS]

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-900 px-4 py-6 lg:flex overflow-y-auto">
        <Link href="/dashboard" className="mb-8 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl overflow-hidden shadow-sm">
            <Image src="/logo.png" alt="TimeWiseHub" width={44} height={44} className="object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-['Poppins'] text-xl font-black tracking-tight text-white">TimeWiseHub</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Track Time. Control Costs. Grow Smarter.</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-0.5">
          {NAV_GROUPS.map(group => (
            <div key={group.title}>
              <p className="mt-6 mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {group.title}
              </p>
              {group.items.map(item => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}

          <div className="my-3 border-t border-slate-800" />

          {BOTTOM_ITEMS.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="mt-4 rounded-xl bg-slate-800 p-3">
          <p className="truncate text-sm font-semibold text-white">{email}</p>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-400">Vividex</span>
        </p>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
              <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-sm">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-800 bg-slate-900 px-4 py-3 text-white lg:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {allItems.map(item => (
              <NavLink key={item.href} item={item} pathname={pathname} mobile />
            ))}
            <div className="shrink-0 flex items-center">
              <SignOutButton />
            </div>
          </nav>
        </div>

        <main>{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardShell.tsx src/components/ThemeToggle.tsx
git commit -m "feat: grouped sidebar with icons and ThemeToggle in header"
```

---

### Task 6: ThemeSelector component + Settings page Theme section

**Files:**
- Create: `src/components/ThemeSelector.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create ThemeSelector**

Create `src/components/ThemeSelector.tsx`:

```tsx
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  return (
    <div className="flex gap-3">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
              active
                ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600'
            }`}
          >
            <Icon size={20} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add Theme card to settings page**

In `src/app/settings/page.tsx`, add the import and insert the Theme card **before** the Reports card. The top of the file (after the existing imports) should look like:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AccountSettingsForm from '@/components/AccountSettingsForm'
import OrgBillingSettingsForm from '@/components/OrgBillingSettingsForm'
import ThemeSelector from '@/components/ThemeSelector'
```

Then inside the `<div className="mx-auto max-w-3xl space-y-6">`, insert this block immediately after the header card (`<div>` with `<h1>Account settings</h1>`):

```tsx
        {/* Theme */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Appearance</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">Choose your preferred colour scheme.</p>
          <div className="mt-4">
            <ThemeSelector />
          </div>
        </div>
```

Also add `dark:` variants to the existing wrapper and header card:

```tsx
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">Account settings</h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">{user.email}</p>
        </div>
```

- [ ] **Step 3: Build check**

```bash
pnpm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeSelector.tsx src/app/settings/page.tsx
git commit -m "feat: ThemeSelector component and settings appearance section"
```

---

### Task 7: Auth pages dark mode

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`
- Modify: `src/app/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Update login page**

In `src/app/(auth)/login/page.tsx`, change the outermost div and the right-side panel div:

```tsx
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
```

```tsx
      <div className="flex min-h-screen w-full items-center justify-center bg-white px-4 py-10 lg:w-1/2 dark:bg-slate-950">
```

Add dark variants to form elements (labels, inputs, heading):

```tsx
          <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Sign in to TimeWiseHub</h1>
```

```tsx
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
```

```tsx
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
```

```tsx
            <p className="font-medium text-gray-500 dark:text-slate-400">
              No account?{' '}
```

- [ ] **Step 2: Apply same pattern to register and reset-password pages**

For each file, find these patterns and add the matching `dark:` counterpart:
- `bg-white` on outer div → add `dark:bg-slate-950`
- `text-slate-900` on headings/labels → add `dark:text-slate-100` or `dark:text-slate-200`
- `border-gray-200 ... text-slate-900` inputs → add `dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100`
- `text-gray-500` muted text → add `dark:text-slate-400`

- [ ] **Step 3: Build check**

```bash
pnpm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: dark mode on auth pages"
```

---

### Task 8: Dashboard pages bulk dark mode

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/expenses/page.tsx`
- Modify: `src/app/dashboard/insights/page.tsx`
- Modify: `src/app/dashboard/billing/page.tsx`

These are server components that only render wrapper shells — the `dark:` classes are needed on the page-level `<div>` wrappers. Client components passed as children manage their own dark mode.

- [ ] **Step 1: Find and replace page-level wrapper patterns in all four files**

In each of the four files, locate the outermost page wrapper (pattern: `className="... bg-gray-50 ..."` or `className="px-4 py-8 sm:px-8"`) and add `dark:bg-slate-950` or `dark:bg-slate-900` as appropriate.

For `src/app/dashboard/page.tsx`, change:
```tsx
<div className="px-4 py-8 sm:px-8">
```
to:
```tsx
<div className="px-4 py-8 sm:px-8 dark:bg-slate-950">
```

For `src/app/dashboard/expenses/page.tsx`:
```tsx
<div className="px-4 py-8 sm:px-8">
```
→
```tsx
<div className="px-4 py-8 sm:px-8 dark:bg-slate-950">
```

For `src/app/dashboard/insights/page.tsx`: find the outermost div in the return and add `dark:bg-slate-950`.

For `src/app/dashboard/billing/page.tsx`: find the outermost div and add `dark:bg-slate-950`.

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/
git commit -m "feat: dark mode wrapper classes on dashboard pages"
```

---

### Task 9: Supabase migration — income_entries table

**Files:**
- Create: `supabase/schema-027-income-entries.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/schema-027-income-entries.sql`:

```sql
-- Income entries: manual income + auto-captured invoice payments
create table income_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid references organisations(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  currency     text not null default 'AUD',
  category     text not null default 'Other',
  date         date not null,
  description  text,
  source_type  text not null default 'manual'
               check (source_type in ('manual', 'invoice')),
  invoice_id   uuid references invoices(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table income_entries enable row level security;

create policy "owner_all" on income_entries for all
  using (user_id = auth.uid());

create policy "org_manager_read" on income_entries for select
  using (
    org_id is not null and
    org_id in (
      select org_id from organisation_members
      where user_id = auth.uid() and role in ('owner','admin','manager')
    )
  );
```

- [ ] **Step 2: Run migration in Supabase**

Go to **Supabase Dashboard → SQL Editor** and paste + run the contents of `supabase/schema-027-income-entries.sql`.

Verify: the `income_entries` table appears in the Table Editor with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-027-income-entries.sql
git commit -m "feat: income_entries table with RLS (schema-027)"
```

---

### Task 10: FinanceSummary component

**Files:**
- Create: `src/components/finance/FinanceSummary.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/finance/FinanceSummary.tsx`:

```tsx
type Props = {
  totalIncome: number
  totalExpenses: number
  currency: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export default function FinanceSummary({ totalIncome, totalExpenses, currency }: Props) {
  const net = totalIncome - totalExpenses
  const netPositive = net >= 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total Income</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{fmt(totalIncome, currency)}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total Expenses</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{fmt(totalExpenses, currency)}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Net</p>
        <p className={`mt-2 text-2xl font-black tracking-tight ${netPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {netPositive ? '+' : ''}{fmt(net, currency)}
        </p>
      </div>
    </div>
  )
}
```

---

### Task 11: FinanceChart component

**Files:**
- Create: `src/components/finance/FinanceChart.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/finance/FinanceChart.tsx`:

```tsx
export type MonthBar = {
  label: string
  income: number
  expenses: number
}

export default function FinanceChart({ months }: { months: MonthBar[] }) {
  const maxVal = Math.max(...months.flatMap(m => [m.income, m.expenses]), 1)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Monthly P&amp;L</h3>
      <div className="mb-4 flex items-center gap-4 text-xs font-semibold text-gray-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />Income</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />Expenses</span>
      </div>
      <div className="flex items-end gap-3" style={{ height: '140px' }}>
        {months.map(m => {
          const incomePct = (m.income / maxVal) * 100
          const expensesPct = (m.expenses / maxVal) * 100
          return (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end gap-0.5 rounded-xl bg-gray-50 dark:bg-slate-800" style={{ height: '100px' }}>
                <div
                  className="flex-1 rounded-l-xl bg-cyan-500 transition-all"
                  style={{ height: `${m.income > 0 ? Math.max(incomePct, 4) : 0}%` }}
                />
                <div
                  className="flex-1 rounded-r-xl bg-rose-400 transition-all"
                  style={{ height: `${m.expenses > 0 ? Math.max(expensesPct, 4) : 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{m.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

### Task 12: IncomeForm component

**Files:**
- Create: `src/components/finance/IncomeForm.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/finance/IncomeForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']
const CATEGORIES = ['Sales', 'Consulting', 'Retainer', 'Reimbursement', 'Other']

export default function IncomeForm({ userId, orgId }: { userId: string; orgId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [category, setCategory] = useState('Sales')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.from('income_entries').insert({
      user_id: userId,
      org_id: orgId,
      amount: parseFloat(amount),
      currency,
      category,
      description: description || null,
      date,
      source_type: 'manual',
    })

    if (error) { setError(error.message); setLoading(false); return }

    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        + Add Income
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">Add Income Entry</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

---

### Task 13: IncomeList component

**Files:**
- Create: `src/components/finance/IncomeList.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/finance/IncomeList.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type IncomeEntry = {
  id: string
  amount: number
  currency: string
  category: string
  date: string
  description: string | null
  source_type: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export default function IncomeList({ entries }: { entries: IncomeEntry[] }) {
  const router = useRouter()

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('income_entries').delete().eq('id', id)
    router.refresh()
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No income entries yet. Add one above.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-800">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Category</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Description</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Source</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{e.date}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.category}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    e.source_type === 'invoice'
                      ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {e.source_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {fmt(e.amount, e.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.source_type === 'manual' && (
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

### Task 14: Finance page

**Files:**
- Create: `src/app/dashboard/finance/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/dashboard/finance/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FinanceSummary from '@/components/finance/FinanceSummary'
import FinanceChart, { type MonthBar } from '@/components/finance/FinanceChart'
import IncomeForm from '@/components/finance/IncomeForm'
import IncomeList from '@/components/finance/IncomeList'

type Period = 'month' | 'quarter' | 'year' | 'all'

function getPeriodRange(period: Period): { from: string | null; to: string | null } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  if (period === 'all') return { from: null, to: null }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { from, to }
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10)
    return { from, to }
  }
  // year
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  return { from, to }
}

function getMonthlyData(
  incomeEntries: { amount: number; date: string }[],
  expenses: { amount: number; expense_date: string }[],
): MonthBar[] {
  const months: MonthBar[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString('en-AU', { month: 'short' })
    const y = d.getFullYear()
    const m = d.getMonth()
    const income = incomeEntries
      .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === y && ed.getMonth() === m })
      .reduce((s, e) => s + e.amount, 0)
    const exp = expenses
      .filter(e => { const ed = new Date(e.expense_date); return ed.getFullYear() === y && ed.getMonth() === m })
      .reduce((s, e) => s + e.amount, 0)
    months.push({ label, income, expenses: exp })
  }
  return months
}

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month',
  quarter: 'This Quarter',
  year: 'This Year',
  all: 'All Time',
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const period: Period = (['month', 'quarter', 'year', 'all'].includes(params.period ?? '') ? params.period : 'month') as Period
  const { from, to } = getPeriodRange(period)

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null

  const buildIncomeQuery = () => {
    let q = supabase.from('income_entries').select('id, amount, currency, category, date, description, source_type').eq('user_id', user.id).order('date', { ascending: false })
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    return q
  }

  const buildExpenseQuery = () => {
    let q = supabase.from('expenses').select('amount, expense_date').eq('user_id', user.id)
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)
    return q
  }

  const [incomeResult, expenseResult, allIncomeResult, allExpenseResult] = await Promise.all([
    buildIncomeQuery(),
    buildExpenseQuery(),
    supabase.from('income_entries').select('amount, date').eq('user_id', user.id),
    supabase.from('expenses').select('amount, expense_date').eq('user_id', user.id),
  ])

  const incomeEntries = incomeResult.data ?? []
  const expenses = expenseResult.data ?? []
  const totalIncome = incomeEntries.reduce((s, e) => s + e.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenseResult.data ?? [])

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Period selector */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <Link
              key={p}
              href={`/dashboard/finance?period=${p}`}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                period === p
                  ? 'bg-cyan-500 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>

        {/* Summary cards */}
        <FinanceSummary totalIncome={totalIncome} totalExpenses={totalExpenses} currency="AUD" />

        {/* Monthly P&L chart */}
        <FinanceChart months={monthlyData} />

        {/* Income section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Income</h2>
            <IncomeForm userId={user.id} orgId={orgId} />
          </div>
          <IncomeList entries={incomeEntries} />
        </div>

        {/* Expenses section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Expenses</h2>
            <Link
              href="/dashboard/expenses"
              className="text-sm font-semibold text-cyan-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {expenses.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">No expenses in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.slice(0, 10).map((e, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{e.expense_date}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                        {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build. If TypeScript errors mention `searchParams`, ensure Next.js 16 async searchParams pattern is used (it already is in the code above).

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/ src/app/dashboard/finance/
git commit -m "feat: Finance page with income entries, P&L chart and expenses summary"
```

---

### Task 15: Mark-paid API extension

**Files:**
- Modify: `src/app/api/invoices/[id]/mark-paid/route.ts`

- [ ] **Step 1: Replace file contents**

Replace the entire contents of `src/app/api/invoices/[id]/mark-paid/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('owner_id, org_id, subtotal, currency, invoice_number, clients(name)')
    .eq('id', id)
    .single()

  if (!invoice || invoice.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const clientName = (invoice.clients as { name: string } | null)?.name ?? ''
  const description = `Invoice ${invoice.invoice_number}${clientName ? ` — ${clientName}` : ''}`

  await Promise.all([
    service.from('invoices').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', id),

    service.from('income_entries').insert({
      user_id: invoice.owner_id,
      org_id: invoice.org_id ?? null,
      amount: invoice.subtotal,
      currency: invoice.currency ?? 'AUD',
      category: 'Sales',
      date: today,
      description,
      source_type: 'invoice',
      invoice_id: id,
    }),
  ])

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Build check**

```bash
pnpm run build
```

Expected: clean build. The `clients` join returns a single object (not array) because it's a foreign key to one row — the cast `as { name: string } | null` is correct.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invoices/
git commit -m "feat: mark-paid auto-inserts income_entry for invoice payments"
```

---

### Task 16: Final build verification

- [ ] **Step 1: Clean build**

```bash
cd C:/GameForge/timewisehub
pnpm run build
```

Expected: `Route (app)` table lists `/dashboard/finance`, zero TypeScript errors, zero import errors.

- [ ] **Step 2: Update GOALS.md**

In `GOALS.md`, under the Parking Lot section, optionally note that dark mode, sidebar restructure and Finance section have been completed. No phase update needed as these are cross-cutting enhancements.

- [ ] **Step 3: Final commit**

```bash
git add GOALS.md
git commit -m "docs: update GOALS with dark mode / finance / sidebar completion"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Dark mode: `@custom-variant`, `ThemeProvider`, `ThemeToggle`, `ThemeSelector`, `dark:` classes on Shell/settings/auth/dashboard
- ✅ Sidebar: `NAV_GROUPS` structure, `lucide-react` icons, category `<p>` labels, divider before bottom items
- ✅ Finance: `income_entries` SQL, `FinanceSummary`, `FinanceChart`, `IncomeForm`, `IncomeList`, `/dashboard/finance` page, period selector
- ✅ Invoice integration: mark-paid extends to insert `income_entries` row with `source_type: 'invoice'`
- ✅ Dark mode on finance components: all cards use `dark:border-slate-800 dark:bg-slate-900`

**Type consistency:**
- `MonthBar` defined in `FinanceChart.tsx` and imported in `finance/page.tsx` — consistent
- `IncomeEntry` type local to `IncomeList.tsx`, matches `income_entries` columns
- `invoice.subtotal` used (not `total`) — matches `schema-019-invoices.sql`
- `invoice.owner_id` used (not `user_id`) — matches invoice table

**No placeholders:** All steps include complete code. No TBDs.
