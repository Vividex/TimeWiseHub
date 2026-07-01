# Client Edit Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal form on the client detail page that lets authorised users edit client name, email, phone, address, default rate, and currency.

**Architecture:** Extend the existing `/api/clients/[id]` PATCH route to handle field updates (alongside the existing archive toggle), fix a latent auth bug where solo freelancers couldn't update their own clients, then add two new client components (`EditClientModal`, `EditClientButton`) consumed by the existing server-side detail page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase SSR, `pnpm`.

## Global Constraints

- No test framework. Verification gate is `pnpm run build` (tsc + eslint), must pass clean after every task.
- TypeScript strict — no implicit `any`, no plain `as { … }` for foreign-key joins (use `as unknown as …` intermediate).
- Shell is PowerShell; use `pnpm` not `npm`.
- Styling follows existing pattern: `rounded-xl`, `border-gray-200`, `focus:ring-2 focus:ring-cyan-400`, dark-mode classes on every input.
- No new npm dependencies.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/app/api/clients/[id]/route.ts` | Add field-edit PATCH path, fix auth to allow client owner |
| Create | `src/components/clients/EditClientModal.tsx` | Form modal pre-populated with current values |
| Create | `src/components/clients/EditClientButton.tsx` | Button that manages open state + renders modal |
| Modify | `src/app/dashboard/clients/[id]/page.tsx` | Extend DB query, compute `canEdit`, render `EditClientButton` |

---

### Task 1: Extend PATCH route — field edits + auth fix

**Files:**
- Modify: `src/app/api/clients/[id]/route.ts`

**Interfaces:**
- Produces: `PATCH /api/clients/[id]` accepts two body shapes:
  - Field edit: `{ name: string, email?: string|null, phone?: string|null, address?: string|null, default_rate?: number|null, currency?: string }` — allowed when user is client owner OR org admin
  - Archive toggle (existing): `{ archived: boolean }` — allowed when user is org admin (unchanged)
- Returns `{ ok: true }` on success, `{ error: string }` on failure

- [ ] **Step 1: Replace `src/app/api/clients/[id]/route.ts` with the updated version**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Fetch client to confirm existence and get owner_id for auth
  const { data: clientRow } = await supabase
    .from('clients').select('id, owner_id').eq('id', id).maybeSingle()
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = clientRow.owner_id === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Field-edit path — triggered when body contains 'name'
  if ('name' in body) {
    const { name, email, phone, address, default_rate, currency } = body as {
      name: string
      email?: string | null
      phone?: string | null
      address?: string | null
      default_rate?: number | null
      currency?: string
    }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const { error } = await supabase.from('clients').update({
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      address: address || null,
      default_rate: default_rate ? Number(default_rate) : null,
      currency: currency || 'AUD',
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Archive toggle path (existing behaviour, admin-only)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await supabase
    .from('clients').update({ archived: body.archived ?? false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await requireAdmin(supabase, user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('id', id).maybeSingle()
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('clients').update({ archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Build verify**

```powershell
pnpm run build
```

Expected: clean build, no tsc or eslint errors.

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/clients/`[id`]/route.ts
git commit -m "fix: clients PATCH supports field edits + allows owner auth"
```

---

### Task 2: Create `EditClientModal` component

**Files:**
- Create: `src/components/clients/EditClientModal.tsx`

**Interfaces:**
- Consumes: `PATCH /api/clients/[id]` with field-edit body shape (defined in Task 1)
- Produces: `EditClientModal` default export with props:
  ```typescript
  type Client = {
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    default_rate: number | null
    currency: string
  }
  // Props: { client: Client; onClose: () => void }
  ```

- [ ] **Step 1: Create `src/components/clients/EditClientModal.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  default_rate: number | null
  currency: string
}

export default function EditClientModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [email, setEmail] = useState(client.email ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [address, setAddress] = useState(client.address ?? '')
  const [rate, setRate] = useState(client.default_rate?.toString() ?? '')
  const [currency, setCurrency] = useState(client.currency)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        default_rate: rate ? Number(rate) : null,
        currency,
      }),
    })
    if (res.ok) {
      onClose()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to save')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit client</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Client name *</label>
            <input ref={firstRef} required type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Default hourly rate</label>
              <input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

```powershell
pnpm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```powershell
git add src/components/clients/EditClientModal.tsx
git commit -m "feat: EditClientModal component"
```

---

### Task 3: Create `EditClientButton` component

**Files:**
- Create: `src/components/clients/EditClientButton.tsx`

**Interfaces:**
- Consumes: `EditClientModal` default export from `./EditClientModal` (defined in Task 2)
- Produces: `EditClientButton` default export with props:
  ```typescript
  // Props: { client: Client } — same Client type as EditClientModal
  ```

- [ ] **Step 1: Create `src/components/clients/EditClientButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditClientModal from './EditClientModal'

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  default_rate: number | null
  currency: string
}

export default function EditClientButton({ client }: { client: Client }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && <EditClientModal client={client} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: Build verify**

```powershell
pnpm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```powershell
git add src/components/clients/EditClientButton.tsx
git commit -m "feat: EditClientButton — opens edit modal"
```

---

### Task 4: Wire into client detail page

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `EditClientButton` default export from `@/components/clients/EditClientButton`

- [ ] **Step 1: Update the client query to include `owner_id`, `default_rate`, `currency`**

Find this line (~line 21):
```typescript
const { data: client } = await supabase
  .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
```

Replace with:
```typescript
const { data: client } = await supabase
  .from('clients').select('id, name, email, phone, address, owner_id, default_rate, currency').eq('id', id).maybeSingle()
```

- [ ] **Step 2: Add `canEdit` and import `EditClientButton`**

Add this import alongside the existing imports at the top of the file:
```typescript
import EditClientButton from '@/components/clients/EditClientButton'
```

After the `if (!client) notFound()` line (client is non-null after this), add:
```typescript
const canEdit = isAdmin || client.owner_id === user.id
```

- [ ] **Step 3: Render `EditClientButton` in the header action area**

Find the existing action area in the JSX (~line 67–75):
```tsx
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
    {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
    {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
    {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
  </div>
  {isAdmin && <DeleteClientButton clientId={id} clientName={client.name} />}
</div>
```

Replace with:
```tsx
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
    {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
    {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
    {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
  </div>
  <div className="flex shrink-0 items-center gap-2">
    {canEdit && (
      <EditClientButton client={{
        id: client.id,
        name: client.name,
        email: client.email ?? null,
        phone: client.phone ?? null,
        address: client.address ?? null,
        default_rate: client.default_rate ?? null,
        currency: client.currency,
      }} />
    )}
    {isAdmin && <DeleteClientButton clientId={id} clientName={client.name} />}
  </div>
</div>
```

- [ ] **Step 4: Build verify**

```powershell
pnpm run build
```

Expected: clean build, no type errors.

- [ ] **Step 5: Manual smoke test**

1. Navigate to any client detail page.
2. Confirm the "Edit" button appears.
3. Click it — modal should open with all fields pre-populated.
4. Change the name and save — page should refresh showing the new name.
5. Open modal again — verify all other fields still hold their values.
6. Press Escape — modal should close without saving.
7. Click the backdrop — modal should close without saving.
8. If you have a non-admin org member account, confirm the Edit button does NOT appear for them.

- [ ] **Step 6: Commit**

```powershell
git add src/app/dashboard/clients/`[id`]/page.tsx
git commit -m "feat: edit client details modal on detail page"
```
