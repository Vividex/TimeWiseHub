# Username & Nickname Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `username` (stable unique handle, set at registration) and `nickname` (display name, editable in settings) to every user profile, show `nickname ?? username` in chat and task views, and add a post-login org-selection flow for multi-org users.

**Architecture:** Two new nullable columns on `public.profiles` (`username unique`, `nickname`). The login page does a post-auth routing check (no username → `/setup-username`; 2+ orgs → `/select-org`). Active org is stored in an `HttpOnly` cookie and passed as a prop to `ChatRealtimeProvider`, replacing the current `.maybeSingle()` fallback. All peer-facing name renders use `nickname ?? username`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind v4. No test runner — verification gate is `pnpm run build`. Package manager: pnpm. Shell: PowerShell on Windows.

**Handover note:** Steps marked `[CONDUCTOR]` are run by Claude (the conductor), NOT by Codex. Codex does text edits only. Do not attempt to run `pnpm`, `git`, or Supabase MCP calls.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `supabase/schema-044-username-nickname.sql` | Migration: add columns (username, nickname, avatar_config), storage bucket, backfill demo accounts, update trigger |
| **Create** | `src/lib/username.ts` | `isUsernameTaken()` utility — shared by register and setup pages |
| **Create** | `src/components/UserAvatar.tsx` | Reusable avatar display: photo → DiceBear SVG → initials |
| **Create** | `src/components/AvatarBuilder.tsx` | Visual picker for hair, skin, accessories — live preview |
| **Create** | `src/components/AvatarPicker.tsx` | Tabbed wrapper: Build avatar / Upload photo |
| **Create** | `src/app/api/set-active-org/route.ts` | Route handler that writes `active_org_id` HttpOnly cookie |
| **Create** | `src/app/setup-username/page.tsx` | One-time gate for existing users with no username |
| **Create** | `src/app/select-org/page.tsx` | Org picker shown when user belongs to 2+ orgs |
| **Create** | `src/components/NicknameForm.tsx` | Client component for nickname editing in settings |
| **Modify** | `src/lib/chat/types.ts` | Add `username`, `nickname` to `ChatMember`; add `displayName()` helper |
| **Modify** | `src/app/(auth)/register/page.tsx` | Add username field with on-blur uniqueness check |
| **Modify** | `src/app/(auth)/login/page.tsx` | Post-auth routing: username check → org count check |
| **Modify** | `src/app/dashboard/layout.tsx` | Read `active_org_id` cookie; pass `orgId` to `ChatRealtimeProvider` |
| **Modify** | `src/components/chat/ChatRealtimeProvider.tsx` | Accept `orgId` prop; use it in `loadMembers()`; update notification display name |
| **Modify** | `src/components/chat/MessageThread.tsx` | Update `senderName()` to use `displayName()` helper |
| **Modify** | `src/components/chat/ConversationList.tsx` | Update `label()` to use `displayName()` helper |
| **Modify** | `src/components/chat/NewDmDialog.tsx` | Use `displayName()` for member list |
| **Modify** | `src/app/settings/page.tsx` | Add `username, nickname` to profile select; add Profile card with `NicknameForm` |

---

## Task 1: DB Migration SQL

**Files:**
- Create: `supabase/schema-044-username-nickname.sql`

- [ ] **Step 1.1: Write the migration file**

Create `supabase/schema-044-username-nickname.sql` with this exact content:

```sql
-- ============================================================
-- TimeWiseHub — Schema 044: Username & Nickname
-- ============================================================

-- Add columns (nullable so existing rows are unaffected)
alter table public.profiles
  add column if not exists username     text,
  add column if not exists nickname     text,
  add column if not exists avatar_config jsonb;

-- Unique constraint on username (nulls are not considered equal, so multiple
-- null rows are allowed — users without a username won't conflict)
create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

-- Public avatars bucket (profile photos visible to all org members)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Only the owner may upload/replace their avatar (path starts with their user id)
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Backfill demo accounts
update public.profiles
  set username = 'sam_rivers', nickname = 'Sam Rivers'
  where email = 'demo.manager@vividex.au';

update public.profiles
  set username = 'jordan_avery', nickname = 'Jordan Avery'
  where email = 'demo.employee@vividex.au';

-- Update the new-user trigger to capture username from sign-up metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data->>'username'), '')
  );
  return new;
end;
$$;
```

- [ ] **Step 1.2: [CONDUCTOR] Apply the migration via Supabase MCP**

```
mcp__supabase__apply_migration
  project_id: sdwwlnnsijcadkdwsvud
  name: username_nickname
  query: <contents of supabase/schema-044-username-nickname.sql>
```

- [ ] **Step 1.3: [CONDUCTOR] Commit**

```powershell
git add supabase/schema-044-username-nickname.sql
git commit -m "feat: add username and nickname columns to profiles"
```

---

## Task 2: Update `ChatMember` type and add `displayName` helper

**Files:**
- Modify: `src/lib/chat/types.ts`

- [ ] **Step 2.1: Replace the entire file**

```typescript
export type ChatConversationType = 'channel' | 'dm'

export type ChatConversation = {
  id: string
  org_id: string
  type: ChatConversationType
  title: string | null
  dm_key: string | null
  created_at: string
}

export type ChatAttachment = {
  id: string
  message_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  deleted_at: string | null
  created_at: string
  chat_attachments: ChatAttachment[]
}

export type AvatarConfig = {
  top: string
  hairColor: string
  skin: string
  accessories: string
  facialHair: string
}

export type ChatMember = {
  user_id: string
  full_name: string | null
  email: string
  role: 'owner' | 'admin' | 'manager' | 'employee'
  username: string | null
  nickname: string | null
  avatar_url: string | null
  avatar_config: AvatarConfig | null
}

/** Peer-facing display name. Never returns the user's email. */
export function displayName(member: ChatMember | null | undefined): string {
  if (!member) return 'Unknown'
  return member.nickname ?? member.username ?? 'Unknown'
}

export type QuietHours = {
  enabled: boolean
  days: number[] // ISO weekday, Mon=1 … Sun=7
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export type AvailabilityReason = 'after_hours' | 'on_leave' | 'holiday' | null

export type Availability = {
  available: boolean
  reason: AvailabilityReason
}
```

- [ ] **Step 2.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

Expected: build passes (only type changes so far).

- [ ] **Step 2.3: [CONDUCTOR] Commit**

```powershell
git add src/lib/chat/types.ts
git commit -m "feat: add username/nickname to ChatMember type and displayName helper"
```

---

## Task 3: `isUsernameTaken` utility

**Files:**
- Create: `src/lib/username.ts`

- [ ] **Step 3.1: Create the file**

```typescript
import { createClient } from '@/lib/supabase-browser'

/** Returns true if the given username is already taken in profiles. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const supabase = createClient()
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', username)
  return !!(count && count > 0)
}
```

- [ ] **Step 3.2: [CONDUCTOR] Commit**

```powershell
git add src/lib/username.ts
git commit -m "feat: add isUsernameTaken utility"
```

---

## Task 4: `POST /api/set-active-org` route handler

**Files:**
- Create: `src/app/api/set-active-org/route.ts`

- [ ] **Step 4.1: Create the file**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId } = await request.json() as { orgId: string }

  // Verify the caller is actually a member of that org before accepting the cookie
  const { count } = await supabase
    .from('organisation_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('user_id', user.id)

  if (!count || count === 0) {
    return NextResponse.json({ error: 'Not a member of this organisation' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('active_org_id', orgId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
}
```

- [ ] **Step 4.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 4.3: [CONDUCTOR] Commit**

```powershell
git add src/app/api/set-active-org/route.ts
git commit -m "feat: add set-active-org route handler"
```

---

## Task 5: Registration page — add username field

**Files:**
- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 5.1: Replace the entire file**

```typescript
'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { isUsernameTaken } from '@/lib/username'

type AccountType = 'personal' | 'org_owner'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleUsernameBlur() {
    if (!username.trim()) return
    const taken = await isUsernameTaken(username.trim())
    setUsernameError(taken ? 'Username already taken' : null)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (usernameError) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { account_type: accountType, username: username.trim() },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('username')) {
        setUsernameError('Username already taken')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Check your email</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <div className="hidden min-h-screen w-1/2 bg-slate-900 px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md">
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden">
              <Image src="/logo.png" alt="TimeWiseHub" width={56} height={56} className="object-contain" />
            </div>
            <h1 className="font-['Poppins'] text-3xl font-black tracking-tight text-white">TimeWiseHub</h1>
            <p className="mt-3 text-sm font-semibold text-cyan-400">Track Time. Control Costs. Grow Smarter.</p>
            <ul className="mt-10 space-y-4 text-sm font-medium text-slate-300">
              <li>Log time with one click</li>
              <li>Track expenses and receipts</li>
              <li>Hit every project deadline</li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-500">Vividex</span>
        </p>
      </div>

      <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-slate-950 px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-xl">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Create your account</h1>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-200">I am signing up as</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType('personal')}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                    accountType === 'personal'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-500 hover:border-cyan-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">Personal</div>
                  <div className="mt-0.5 text-xs font-normal opacity-75">Individual use</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('org_owner')}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-colors ${
                    accountType === 'org_owner'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-500 hover:border-cyan-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">Business</div>
                  <div className="mt-0.5 text-xs font-normal opacity-75">I own or manage a team</div>
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={e => { setUsername(e.target.value); setUsernameError(null) }}
                onBlur={handleUsernameBlur}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {usernameError && (
                <p className="mt-1 text-xs font-semibold text-red-500">{usernameError}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !!usernameError}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-gray-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-cyan-600 hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-gray-400">
            By registering you agree to our{' '}
            <Link href="/terms" className="hover:underline">Terms</Link>
            {' and '}
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 5.3: [CONDUCTOR] Commit**

```powershell
git add src/app/'(auth)'/register/page.tsx
git commit -m "feat: add username field to registration form"
```

---

## Task 6: Login page — post-auth routing

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 6.1: Replace the entire file**

```typescript
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !user) {
      setError(authError?.message ?? 'Sign in failed')
      setLoading(false)
      return
    }

    // Gate 1: existing users who predate the username feature
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (!profile?.username) {
      router.push('/setup-username')
      return
    }

    // Gate 2: org membership count
    const { data: memberships } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)

    const count = memberships?.length ?? 0

    if (count === 0) {
      router.push('/onboarding')
      router.refresh()
      return
    }

    if (count > 1) {
      router.push('/select-org')
      router.refresh()
      return
    }

    // Single org — set cookie and go straight to dashboard
    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: memberships![0].org_id }),
    })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <div className="hidden min-h-screen w-1/2 bg-slate-900 px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md">
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden">
              <Image src="/logo.png" alt="TimeWiseHub" width={56} height={56} className="object-contain" />
            </div>
            <h1 className="font-['Poppins'] text-3xl font-black tracking-tight text-white">TimeWiseHub</h1>
            <p className="mt-3 text-sm font-semibold text-cyan-400">Track Time. Control Costs. Grow Smarter.</p>
            <ul className="mt-10 space-y-4 text-sm font-medium text-slate-300">
              <li>Log time with one click</li>
              <li>Track expenses and receipts</li>
              <li>Hit every project deadline</li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs font-semibold text-slate-600 tracking-wide">
          Powered by <span className="text-slate-500">Vividex</span>
        </p>
      </div>

      <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-slate-950 px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">Welcome back</p>
          <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Sign in to TimeWiseHub</h1>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <p>
              <Link href="/reset-password" className="font-semibold text-cyan-600 hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p className="font-medium text-gray-500 dark:text-slate-400">
              No account?{' '}
              <Link href="/register" className="font-semibold text-cyan-600 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 6.3: [CONDUCTOR] Commit**

```powershell
git add src/app/'(auth)'/login/page.tsx
git commit -m "feat: post-auth routing (username gate + org picker)"
```

---

## Task 7: `/setup-username` page

**Files:**
- Create: `src/app/setup-username/page.tsx`

- [ ] **Step 7.1: Create the file**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { isUsernameTaken } from '@/lib/username'

export default function SetupUsernamePage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleUsernameBlur() {
    if (!username.trim()) return
    const taken = await isUsernameTaken(username.trim())
    setUsernameError(taken ? 'Username already taken' : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (usernameError) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', user.id)

    if (updateError) {
      // code 23505 = unique_violation
      if (updateError.code === '23505' || updateError.message.toLowerCase().includes('unique')) {
        setUsernameError('Username already taken')
      } else {
        setError(updateError.message)
      }
      setLoading(false)
      return
    }

    // Continue to org check (same logic as login page)
    const { data: memberships } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)

    const count = memberships?.length ?? 0

    if (count === 0) {
      router.push('/onboarding')
      router.refresh()
      return
    }

    if (count > 1) {
      router.push('/select-org')
      router.refresh()
      return
    }

    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: memberships![0].org_id }),
    })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Choose a username</h1>
        <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
          Your username is your unique identity on TimeWiseHub. You can set a display nickname later in settings.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => { setUsername(e.target.value); setUsernameError(null) }}
              onBlur={handleUsernameBlur}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {usernameError && (
              <p className="mt-1 text-xs font-semibold text-red-500">{usernameError}</p>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !!usernameError}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 7.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 7.3: [CONDUCTOR] Commit**

```powershell
git add src/app/setup-username/page.tsx
git commit -m "feat: add /setup-username gate for existing users"
```

---

## Task 8: `/select-org` page

**Files:**
- Create: `src/app/select-org/page.tsx`

- [ ] **Step 8.1: Create the file**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type OrgOption = {
  org_id: string
  role: string
  name: string
}

export default function SelectOrgPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('organisation_members')
        .select('org_id, role, organisations!organisation_members_org_id_fkey(name)')
        .eq('user_id', user.id)

      setOrgs(
        ((data ?? []) as unknown as {
          org_id: string
          role: string
          organisations: { name: string } | null
        }[]).map(row => ({
          org_id: row.org_id,
          role: row.role,
          name: row.organisations?.name ?? 'Unknown organisation',
        }))
      )
      setLoading(false)
    }
    load()
  }, [router])

  async function select(orgId: string) {
    setSelecting(orgId)
    await fetch('/api/set-active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  if (loading) return null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Select organisation</h1>
        <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
          You belong to multiple organisations. Choose which one to open.
        </p>
        <div className="space-y-3">
          {orgs.map(org => (
            <button
              key={org.org_id}
              onClick={() => select(org.org_id)}
              disabled={!!selecting}
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 text-left transition-colors hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{org.name}</p>
                <p className="text-xs font-medium capitalize text-gray-500 dark:text-slate-400">{org.role}</p>
              </div>
              {selecting === org.org_id && (
                <span className="text-xs font-semibold text-cyan-500">Opening…</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 8.3: [CONDUCTOR] Commit**

```powershell
git add src/app/select-org/page.tsx
git commit -m "feat: add /select-org page for multi-org users"
```

---

## Task 9: Dashboard layout — read cookie, pass `orgId`

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 9.1: Replace the entire file**

```typescript
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve active org from cookie, with fallback to first membership
  const cookieStore = await cookies()
  let orgId = cookieStore.get('active_org_id')?.value ?? null

  if (orgId) {
    // Validate the cookie is still correct (user may have been removed from that org)
    const { count } = await supabase
      .from('organisation_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', user.id)
    if (!count) orgId = null
  }

  if (!orgId) {
    const { data: membership } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    orgId = membership?.org_id ?? null
  }

  return (
    <ChatRealtimeProvider userId={user.id} orgId={orgId ?? ''}>
      <DashboardShell email={user.email ?? ''}>
        {children}
        <FloatingWidgets userEmail={user.email ?? ''} />
      </DashboardShell>
    </ChatRealtimeProvider>
  )
}
```

- [ ] **Step 9.2: [CONDUCTOR] Build check — expect a type error**

```powershell
pnpm run build
```

Expected: TypeScript error because `ChatRealtimeProvider` does not yet accept `orgId`. That is correct — Task 10 fixes it. Note the error and continue.

- [ ] **Step 9.3: [CONDUCTOR] Commit (with build warning noted)**

```powershell
git add src/app/dashboard/layout.tsx
git commit -m "feat: resolve active org from cookie in dashboard layout"
```

---

## Task 10: `ChatRealtimeProvider` — accept `orgId`, update `loadMembers`

**Files:**
- Modify: `src/components/chat/ChatRealtimeProvider.tsx`

Make the following targeted edits (do **not** rewrite the whole file — it has many effects that must be preserved):

- [ ] **Step 10.1: Update the component signature (line 78)**

Find:
```typescript
export default function ChatRealtimeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
```

Replace with:
```typescript
export default function ChatRealtimeProvider({ userId, orgId, children }: { userId: string; orgId: string; children: React.ReactNode }) {
```

- [ ] **Step 10.2: Replace `loadMembers` callback**

Find the entire `loadMembers` callback (starts with `const loadMembers = useCallback(async () => {` and ends with `}, [supabase, userId])`).

Replace with:

```typescript
  const loadMembers = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('organisation_members')
      .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email, username, nickname, avatar_url, avatar_config)')
      .eq('org_id', orgId)
    const map: Record<string, ChatMember> = {}
    for (const row of (data ?? []) as unknown as {
      user_id: string
      role: ChatMember['role']
      profiles: { full_name: string | null; email: string; username: string | null; nickname: string | null; avatar_url: string | null; avatar_config: AvatarConfig | null } | null
    }[]) {
      map[row.user_id] = {
        user_id: row.user_id,
        role: row.role,
        full_name: row.profiles?.full_name ?? null,
        email: row.profiles?.email ?? '',
        username: row.profiles?.username ?? null,
        nickname: row.profiles?.nickname ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
        avatar_config: row.profiles?.avatar_config ?? null,
      }
    }
    setMembers(map)
  }, [supabase, orgId])
```

- [ ] **Step 10.3: Update `showInAppNotification` to use `displayName`**

Add the import for `displayName` at the top of the file alongside the existing `ChatConversation` and `ChatMember` imports:

Find:
```typescript
import type { ChatConversation, ChatMember } from '@/lib/chat/types'
```

Replace with:
```typescript
import { displayName } from '@/lib/chat/types'
import type { AvatarConfig, ChatConversation, ChatMember } from '@/lib/chat/types'
```

Then find inside `showInAppNotification`:
```typescript
  const name = m?.full_name || m?.email || 'New message'
```

Replace with:
```typescript
  const name = m ? displayName(m) : 'New message'
```

- [ ] **Step 10.4: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

Expected: build passes clean — the `orgId` prop is now accepted and the layout type error from Task 9 resolves.

- [ ] **Step 10.5: [CONDUCTOR] Commit**

```powershell
git add src/components/chat/ChatRealtimeProvider.tsx
git commit -m "feat: scope ChatRealtimeProvider to explicit orgId, add username/nickname to member map"
```

---

## Task 11: Chat display — `MessageThread` and `ConversationList`

**Files:**
- Modify: `src/components/chat/MessageThread.tsx`
- Modify: `src/components/chat/ConversationList.tsx`

- [ ] **Step 11.1: Update `MessageThread.tsx` — import and `senderName`**

Add `displayName` import. Find:
```typescript
import type { ChatMessage } from '@/lib/chat/types'
```

Replace with:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatMessage } from '@/lib/chat/types'
```

Then find:
```typescript
function senderName(members: ReturnType<typeof useChat>['members'], id: string): string {
  const m = members[id]
  return m?.full_name || m?.email || 'Unknown'
}
```

Replace with:
```typescript
function senderName(members: ReturnType<typeof useChat>['members'], id: string): string {
  return displayName(members[id])
}
```

- [ ] **Step 11.2: Update `ConversationList.tsx` — import and `label`**

Add `displayName` import. Find:
```typescript
import type { ChatConversation } from '@/lib/chat/types'
```

Replace with:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
```

Then find:
```typescript
  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m?.full_name || m?.email || 'Direct message'
  }
```

Replace with:
```typescript
  function label(conv: ChatConversation): string {
    if (conv.type === 'channel') return conv.title ?? 'Announcements'
    const peer = dmPeerId(conv, userId)
    const m = peer ? members[peer] : null
    return m ? displayName(m) : 'Direct message'
  }
```

- [ ] **Step 11.3: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 11.4: [CONDUCTOR] Commit**

```powershell
git add src/components/chat/MessageThread.tsx src/components/chat/ConversationList.tsx
git commit -m "feat: use displayName helper in chat message and conversation list"
```

---

## Task 12: `NewDmDialog` — display names

**Files:**
- Modify: `src/components/chat/NewDmDialog.tsx`

- [ ] **Step 12.1: Add `displayName` import**

Find:
```typescript
import { useChat } from '@/components/chat/ChatRealtimeProvider'
```

Replace with:
```typescript
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
```

- [ ] **Step 12.2: Update the avatar initial and name display**

Find:
```typescript
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
                {(m.full_name || m.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {m.full_name || m.email}
                </span>
```

Replace with:
```typescript
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
                {displayName(m).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {displayName(m)}
                </span>
```

- [ ] **Step 12.3: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 12.4: [CONDUCTOR] Commit**

```powershell
git add src/components/chat/NewDmDialog.tsx
git commit -m "feat: use displayName in new DM dialog"
```

---

## Task 13: `NicknameForm` component + Settings page

**Files:**
- Create: `src/components/NicknameForm.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 13.1: Create `NicknameForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function NicknameForm({
  username,
  initialNickname,
}: {
  username: string
  initialNickname: string
}) {
  const [nickname, setNickname] = useState(initialNickname)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() || null })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">Username</label>
        <p className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-600 dark:text-slate-400">
          {username}
        </p>
        <p className="mt-1 text-xs text-gray-400">Your unique handle — contact support to change it.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-900 dark:text-slate-200">
          Nickname{' '}
          <span className="font-normal text-gray-400">(shown to others in chat and tasks)</span>
        </label>
        <input
          type="text"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder={username}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <p className="mt-1 text-xs text-gray-400">Leave blank to display your username instead.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save nickname'}
      </button>
    </form>
  )
}
```

- [ ] **Step 13.2: Update `src/app/settings/page.tsx`**

Add the `NicknameForm` import near the top of the file, below the existing imports:

Find:
```typescript
import { effectivePlan, getSubscription } from '@/lib/subscription'
```

Replace with:
```typescript
import { effectivePlan, getSubscription } from '@/lib/subscription'
import NicknameForm from '@/components/NicknameForm'
```

Add `username` and `nickname` to the profile select. Find:
```typescript
    supabase
      .from('profiles')
      .select('full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details')
      .eq('id', user.id)
      .single(),
```

Replace with:
```typescript
    supabase
      .from('profiles')
      .select('full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details, username, nickname')
      .eq('id', user.id)
      .single(),
```

Add the Profile card immediately after the closing `</div>` of the Appearance card (the `ThemeSelector` block). Find the comment `{/* Reports & data export */}` and insert the new card just before it:

```typescript
        {/* Profile */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Your username is your unique handle. Your nickname is what others see in chat and tasks.
          </p>
          <NicknameForm
            username={profile?.username ?? ''}
            initialNickname={profile?.nickname ?? ''}
          />
        </div>

        {/* Reports & data export */}
```

- [ ] **Step 13.3: [CONDUCTOR] Final build check**

```powershell
pnpm run build
```

Expected: clean build, zero TypeScript or ESLint errors.

- [ ] **Step 13.4: [CONDUCTOR] Commit**

```powershell
git add src/components/NicknameForm.tsx src/app/settings/page.tsx
git commit -m "feat: add nickname editing to settings page"
```

---

---

## Task 14: Install DiceBear packages

**Files:** none (package install only)

- [ ] **Step 14.1: [CONDUCTOR] Install**

```powershell
pnpm add @dicebear/core @dicebear/collection
```

- [ ] **Step 14.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 14.3: [CONDUCTOR] Commit**

```powershell
git add package.json pnpm-lock.yaml
git commit -m "feat: add DiceBear avatar packages"
```

---

## Task 15: `UserAvatar` display component

**Files:**
- Create: `src/components/UserAvatar.tsx`

- [ ] **Step 15.1: Create the file**

```typescript
'use client'

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { avataaars } from '@dicebear/collection'
import type { AvatarConfig } from '@/lib/chat/types'

function buildSvgUrl(config: AvatarConfig): string {
  const svg = createAvatar(avataaars, {
    seed: 'fixed',
    backgroundColor: ['transparent'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(config as any),
  }).toString()
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

export default function UserAvatar({
  avatarUrl,
  avatarConfig,
  name,
  size = 36,
}: {
  avatarUrl?: string | null
  avatarConfig?: AvatarConfig | null
  name: string
  size?: number
}) {
  const svgUrl = useMemo(
    () => (!avatarUrl && avatarConfig ? buildSvgUrl(avatarConfig) : null),
    [avatarUrl, avatarConfig],
  )

  const style = { width: size, height: size }

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover"
      />
    )
  }

  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={name}
        style={style}
        className="rounded-full"
      />
    )
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-cyan-500 font-black text-white"
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
```

- [ ] **Step 15.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 15.3: [CONDUCTOR] Commit**

```powershell
git add src/components/UserAvatar.tsx
git commit -m "feat: add UserAvatar display component"
```

---

## Task 16: `AvatarBuilder` component

**Files:**
- Create: `src/components/AvatarBuilder.tsx`

- [ ] **Step 16.1: Create the file**

```typescript
'use client'

import { useState } from 'react'
import UserAvatar from '@/components/UserAvatar'
import type { AvatarConfig } from '@/lib/chat/types'

const HAIR_STYLES: { value: string; label: string }[] = [
  { value: 'shortCurly',         label: 'Short Curly' },
  { value: 'shortFlat',          label: 'Short Flat' },
  { value: 'shortRound',         label: 'Short Round' },
  { value: 'shortWaved',         label: 'Short Waved' },
  { value: 'shavedSides',        label: 'Shaved Sides' },
  { value: 'sides',              label: 'Sides' },
  { value: 'straight01',         label: 'Straight' },
  { value: 'straight02',         label: 'Straight Alt' },
  { value: 'longButNotTooLong',  label: 'Long' },
  { value: 'miaWallace',        label: 'Mia Wallace' },
  { value: 'curly',              label: 'Curly' },
  { value: 'curvy',              label: 'Curvy' },
  { value: 'fro',                label: 'Afro' },
  { value: 'froBand',            label: 'Afro Band' },
  { value: 'dreads',             label: 'Dreads' },
  { value: 'frida',              label: 'Frida' },
  { value: 'bun',                label: 'Bun' },
  { value: 'bob',                label: 'Bob' },
  { value: 'winterHat1',         label: 'Beanie' },
  { value: 'winterHat02',        label: 'Pompom Hat' },
  { value: 'winterHat03',        label: 'Striped Hat' },
  { value: 'winterHat04',        label: 'Knit Hat' },
]

const HAIR_COLOURS: { value: string; hex: string; label: string }[] = [
  { value: 'black',        hex: '#2c1b18', label: 'Black' },
  { value: 'brown',        hex: '#724133', label: 'Brown' },
  { value: 'brownDark',    hex: '#4a312c', label: 'Dark Brown' },
  { value: 'auburn',       hex: '#a55728', label: 'Auburn' },
  { value: 'blonde',       hex: '#b58143', label: 'Blonde' },
  { value: 'blondeGolden', hex: '#d6b370', label: 'Golden Blonde' },
  { value: 'red',          hex: '#c93305', label: 'Red' },
  { value: 'pastelPink',   hex: '#f59797', label: 'Pink' },
  { value: 'platinum',     hex: '#ecdcbf', label: 'Platinum' },
  { value: 'silverGray',   hex: '#e8e1e1', label: 'Silver' },
]

const SKIN_TONES: { value: string; hex: string; label: string }[] = [
  { value: 'pale',      hex: '#ffdbb4', label: 'Pale' },
  { value: 'light',     hex: '#edb98a', label: 'Light' },
  { value: 'tanned',    hex: '#d08b5b', label: 'Tanned' },
  { value: 'yellow',    hex: '#f8d25c', label: 'Yellow' },
  { value: 'brown',     hex: '#ae5d29', label: 'Brown' },
  { value: 'darkBrown', hex: '#614335', label: 'Dark Brown' },
  { value: 'black',     hex: '#3c1a07', label: 'Deep' },
]

const ACCESSORIES: { value: string; label: string }[] = [
  { value: 'blank',          label: 'None' },
  { value: 'round',          label: 'Round' },
  { value: 'prescription01', label: 'Classic' },
  { value: 'prescription02', label: 'Rimless' },
  { value: 'kurt',           label: 'Square' },
  { value: 'sunglasses',     label: 'Sunglasses' },
  { value: 'wayfarers',      label: 'Wayfarers' },
]

const FACIAL_HAIR: { value: string; label: string }[] = [
  { value: 'blank',           label: 'None' },
  { value: 'beardLight',      label: 'Stubble' },
  { value: 'beardMedium',     label: 'Short Beard' },
  { value: 'beardMagestic',   label: 'Full Beard' },
  { value: 'moustacheFancy',  label: 'Moustache' },
  { value: 'moustacheMagnum', label: 'Thick Moustache' },
]

const DEFAULT_CONFIG: AvatarConfig = {
  top: 'shortCurly',
  hairColor: 'brown',
  skin: 'light',
  accessories: 'blank',
  facialHair: 'blank',
}

function SwatchRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; hex?: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border-2 transition-all ${
              value === opt.value
                ? 'border-cyan-500 scale-110'
                : 'border-transparent hover:border-gray-300 dark:hover:border-slate-600'
            }`}
          >
            {opt.hex ? (
              <span
                className="block h-7 w-7 rounded-md"
                style={{ background: opt.hex }}
              />
            ) : (
              <span className="block rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {opt.label}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AvatarBuilder({
  initial,
  displayName,
  onSave,
  saving,
}: {
  initial: AvatarConfig | null
  displayName: string
  onSave: (config: AvatarConfig) => void
  saving: boolean
}) {
  const [config, setConfig] = useState<AvatarConfig>(initial ?? DEFAULT_CONFIG)

  function set(key: keyof AvatarConfig) {
    return (value: string) => setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="flex justify-center py-2">
        <UserAvatar avatarConfig={config} name={displayName} size={96} />
      </div>

      <SwatchRow label="Hair Style" options={HAIR_STYLES} value={config.top} onChange={set('top')} />
      <SwatchRow label="Hair Colour" options={HAIR_COLOURS} value={config.hairColor} onChange={set('hairColor')} />
      <SwatchRow label="Skin Tone" options={SKIN_TONES} value={config.skin} onChange={set('skin')} />
      <SwatchRow label="Accessories" options={ACCESSORIES} value={config.accessories} onChange={set('accessories')} />
      <SwatchRow label="Facial Hair" options={FACIAL_HAIR} value={config.facialHair} onChange={set('facialHair')} />

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(config)}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save avatar'}
      </button>
    </div>
  )
}
```

- [ ] **Step 16.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 16.3: [CONDUCTOR] Commit**

```powershell
git add src/components/AvatarBuilder.tsx
git commit -m "feat: add AvatarBuilder component"
```

---

## Task 17: `AvatarPicker` — tabbed settings component (Build / Upload Photo)

**Files:**
- Create: `src/components/AvatarPicker.tsx`

- [ ] **Step 17.1: Create the file**

```typescript
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import AvatarBuilder from '@/components/AvatarBuilder'
import UserAvatar from '@/components/UserAvatar'
import type { AvatarConfig } from '@/lib/chat/types'

type Tab = 'build' | 'upload'

export default function AvatarPicker({
  userId,
  initialAvatarUrl,
  initialAvatarConfig,
  displayName,
}: {
  userId: string
  initialAvatarUrl: string | null
  initialAvatarConfig: AvatarConfig | null
  displayName: string
}) {
  const [tab, setTab] = useState<Tab>(initialAvatarConfig && !initialAvatarUrl ? 'build' : 'upload')
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [avatarConfig, setAvatarConfig] = useState(initialAvatarConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveConfig(config: AvatarConfig) {
    setSaving(true)
    setSaved(false)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ avatar_config: config, avatar_url: null })
      .eq('id', userId)
    if (err) { setError(err.message) } else {
      setAvatarConfig(config)
      setAvatarUrl(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) { setError(uploadErr.message); setSaving(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Append timestamp to bust CDN cache
    const bustedUrl = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl, avatar_config: null })
      .eq('id', userId)

    if (updateErr) { setError(updateErr.message) } else {
      setAvatarUrl(bustedUrl)
      setAvatarConfig(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const currentName = displayName || 'Me'

  return (
    <div className="mt-4 space-y-4">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <UserAvatar avatarUrl={avatarUrl} avatarConfig={avatarConfig} name={currentName} size={64} />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {avatarUrl ? 'Photo' : avatarConfig ? 'Custom avatar' : 'Default (initials)'}
          </p>
          {saved && <p className="text-xs font-semibold text-cyan-500">Saved!</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 dark:border-slate-700 p-1">
        {(['build', 'upload'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-cyan-500 text-white'
                : 'text-gray-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t === 'build' ? 'Build avatar' : 'Upload photo'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {tab === 'build' && (
        <AvatarBuilder
          initial={avatarConfig}
          displayName={currentName}
          onSave={saveConfig}
          saving={saving}
        />
      )}

      {tab === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            Upload a JPG, PNG, or WebP image. Max 2 MB.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Uploading…' : 'Choose file'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 17.2: [CONDUCTOR] Build check**

```powershell
pnpm run build
```

- [ ] **Step 17.3: [CONDUCTOR] Commit**

```powershell
git add src/components/AvatarPicker.tsx
git commit -m "feat: add AvatarPicker (build/upload tabs)"
```

---

## Task 18: Wire avatar into settings page and chat

**Files:**
- Modify: `src/app/settings/page.tsx` — fetch `avatar_url, avatar_config, id`; add Avatar card above Profile card
- Modify: `src/components/chat/ConversationList.tsx` — use `UserAvatar` for DM avatars
- Modify: `src/components/chat/NewDmDialog.tsx` — use `UserAvatar` in member list
- Modify: `src/components/chat/MessageThread.tsx` — show small avatar beside each message

- [ ] **Step 18.1: Update `src/app/settings/page.tsx`**

Add imports near the top. Find:
```typescript
import NicknameForm from '@/components/NicknameForm'
```
Replace with:
```typescript
import NicknameForm from '@/components/NicknameForm'
import AvatarPicker from '@/components/AvatarPicker'
import type { AvatarConfig } from '@/lib/chat/types'
```

Add `id, avatar_url, avatar_config` to the profiles select. Find:
```typescript
      .select('full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details, username, nickname')
```
Replace with:
```typescript
      .select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details, username, nickname, avatar_url, avatar_config')
```

Add the Avatar card immediately before the existing Profile card. Find:
```typescript
        {/* Profile */}
```
Insert before it:
```typescript
        {/* Avatar */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Avatar</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Build a custom avatar or upload a photo — shown in chat and across the app.
          </p>
          <AvatarPicker
            userId={profile?.id ?? user.id}
            initialAvatarUrl={profile?.avatar_url ?? null}
            initialAvatarConfig={(profile?.avatar_config ?? null) as AvatarConfig | null}
            displayName={profile?.nickname ?? profile?.username ?? ''}
          />
        </div>

        {/* Profile */}
```

- [ ] **Step 18.2: Update `ConversationList.tsx` — DM avatar**

Add import. Find:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
```
Replace with:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatConversation } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
```

Inside `row()`, replace the DM avatar `<span>` (the cyan circle with initials). Find:
```typescript
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
            {label(conv).slice(0, 1).toUpperCase()}
          </span>
        )}
```
Replace with:
```typescript
        ) : (
          (() => {
            const peer = dmPeerId(conv, userId)
            const m = peer ? members[peer] : null
            return (
              <UserAvatar
                avatarUrl={m?.avatar_url}
                avatarConfig={m?.avatar_config}
                name={label(conv)}
                size={36}
              />
            )
          })()
        )}
```

- [ ] **Step 18.3: Update `NewDmDialog.tsx` — member list avatar**

Add import. Find:
```typescript
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
```
Replace with:
```typescript
import { useChat } from '@/components/chat/ChatRealtimeProvider'
import { displayName } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
```

Replace the avatar `<span>` inside `others.map`. Find:
```typescript
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">
                {displayName(m).slice(0, 1).toUpperCase()}
              </span>
```
Replace with:
```typescript
              <UserAvatar avatarUrl={m.avatar_url} avatarConfig={m.avatar_config} name={displayName(m)} size={36} />
```

- [ ] **Step 18.4: Update `MessageThread.tsx` — avatar beside messages**

Add import. Find:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatMessage } from '@/lib/chat/types'
```
Replace with:
```typescript
import { displayName } from '@/lib/chat/types'
import type { ChatMessage } from '@/lib/chat/types'
import UserAvatar from '@/components/UserAvatar'
```

In the message render loop, add the avatar beside the sender name. Find:
```typescript
            <div className="mb-0.5 flex items-center gap-2 px-1">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {mine ? 'You' : senderName(members, m.sender_id)}
              </span>
```
Replace with:
```typescript
            <div className="mb-0.5 flex items-center gap-2 px-1">
              {!mine && (
                <UserAvatar
                  avatarUrl={members[m.sender_id]?.avatar_url}
                  avatarConfig={members[m.sender_id]?.avatar_config}
                  name={senderName(members, m.sender_id)}
                  size={20}
                />
              )}
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {mine ? 'You' : senderName(members, m.sender_id)}
              </span>
```

- [ ] **Step 18.5: [CONDUCTOR] Final build check**

```powershell
pnpm run build
```

Expected: clean build with zero TypeScript or ESLint errors.

- [ ] **Step 18.6: [CONDUCTOR] Commit**

```powershell
git add src/app/settings/page.tsx src/components/chat/ConversationList.tsx src/components/chat/NewDmDialog.tsx src/components/chat/MessageThread.tsx
git commit -m "feat: wire avatars into settings and chat"
```

---

## Final Verification Checklist

Before handing back to the conductor for ship:

- [ ] `pnpm run build` passes clean
- [ ] Demo accounts (`demo.manager@vividex.au`, `demo.employee@vividex.au`) have `username` and `nickname` set in DB
- [ ] Registering a new account shows the Username field; blurring a taken username shows the inline error
- [ ] Logging in as `admin@vividex.au` redirects to `/setup-username`; submitting a username then reaches the dashboard
- [ ] Chat messages show `nickname` (or `username` if no nickname) — never email
- [ ] New DM dialog shows display names in the member list
- [ ] Settings page shows the Avatar card (Build / Upload tabs), Profile card (username read-only, nickname editable)
- [ ] Building and saving a custom avatar → appears as small avatar beside chat messages and in DM list
- [ ] Uploading a photo → replaces the DiceBear avatar
- [ ] Changing nickname in settings → chat reflects new name on next load
