# Avatar Removal + Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the DiceBear cartoon avatar builder entirely (keep photo uploads), then rewrite the Terms of Service page and create a new Privacy Policy page.

**Architecture:** Part 1 drops the `avatar_config` DB column and removes all TypeScript types/component code referencing it. Part 2 rewrites `src/app/terms/page.tsx` in-place and creates `src/app/privacy/page.tsx` as a new file. No new dependencies. No API routes needed — both legal pages are static RSC.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind v4, Supabase (MCP for migration). Package manager: pnpm.

---

## File Map

| File | Action |
|------|--------|
| `supabase/schema-050-drop-avatar-config.sql` | Create — migration file |
| `src/components/AvatarBuilder.tsx` | Delete — entire file removed |
| `src/components/UserAvatar.tsx` | Modify — remove DiceBear branch |
| `src/components/AvatarPicker.tsx` | Modify — remove build tab, upload-only |
| `src/lib/chat/types.ts` | Modify — remove AvatarConfig type and ChatMember field |
| `src/app/settings/page.tsx` | Modify — remove AvatarConfig import, avatar_config from select, initialAvatarConfig prop, update description |
| `src/components/chat/ChatRealtimeProvider.tsx` | Modify — remove AvatarConfig import and avatar_config from select/type/map |
| `src/components/chat/MessageThread.tsx` | Modify — remove avatarConfig prop from UserAvatar |
| `src/components/chat/ConversationList.tsx` | Modify — remove avatarConfig prop from UserAvatar |
| `src/components/chat/NewDmDialog.tsx` | Modify — remove avatarConfig prop from UserAvatar |
| `src/app/terms/page.tsx` | Modify — full content rewrite |
| `src/app/privacy/page.tsx` | Create — new Privacy Policy page |

---

## Task 1: DB Migration — Drop avatar_config Column

> **Conductor task** — requires Supabase MCP + git. Codex writes the SQL file; conductor applies it.

**Files:**
- Create: `supabase/schema-050-drop-avatar-config.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/schema-050-drop-avatar-config.sql` with this exact content:

```sql
-- Remove the DiceBear avatar config column; photo uploads (avatar_url) are retained.
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_config;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Conductor runs: `apply_migration` MCP tool with name `drop-avatar-config` and the SQL above.

Expected: migration applies cleanly with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-050-drop-avatar-config.sql
git commit -m "feat: drop avatar_config column from profiles"
```

---

## Task 2: Simplify UserAvatar Component

> **Codex task** — text edit only.

**Files:**
- Modify: `src/components/UserAvatar.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `src/components/UserAvatar.tsx` with:

```tsx
'use client'

export default function UserAvatar({
  avatarUrl,
  name,
  size = 36,
}: {
  avatarUrl?: string | null
  name: string
  size?: number
}) {
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

- [ ] **Step 2: Commit**

```bash
git add src/components/UserAvatar.tsx
git commit -m "feat: simplify UserAvatar to photo + initials only"
```

---

## Task 3: Simplify AvatarPicker to Upload-Only

> **Codex task** — text edit only.

**Files:**
- Modify: `src/components/AvatarPicker.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `src/components/AvatarPicker.tsx` with:

```tsx
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import UserAvatar from '@/components/UserAvatar'

export default function AvatarPicker({
  userId,
  initialAvatarUrl,
  displayName,
}: {
  userId: string
  initialAvatarUrl: string | null
  displayName: string
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    const bustedUrl = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', userId)

    if (updateErr) { setError(updateErr.message) } else {
      setAvatarUrl(bustedUrl)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const currentName = displayName || 'Me'

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4">
        <UserAvatar avatarUrl={avatarUrl} name={currentName} size={64} />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {avatarUrl ? 'Photo' : 'Default (initials)'}
          </p>
          {saved && <p className="text-xs font-semibold text-cyan-500">Saved!</p>}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

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
          {saving ? 'Uploading…' : 'Choose photo'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete AvatarBuilder.tsx**

Delete the file `src/components/AvatarBuilder.tsx` entirely.

- [ ] **Step 3: Commit**

```bash
git add src/components/AvatarPicker.tsx
git rm src/components/AvatarBuilder.tsx
git commit -m "feat: remove avatar builder, simplify picker to photo upload only"
```

---

## Task 4: Remove AvatarConfig Type from chat/types.ts

> **Codex task** — text edit only.

**Files:**
- Modify: `src/lib/chat/types.ts`

- [ ] **Step 1: Delete the AvatarConfig type block**

In `src/lib/chat/types.ts`, remove these lines (the entire AvatarConfig type definition):

```ts
export type AvatarConfig = {
  top: string
  hairColor: string           // hex e.g. '724133'
  skinColor: string           // hex e.g. 'edb98a'
  accessories: string | null  // null = none
  facialHair: string | null   // null = none
  clothing?: string           // optional — defaults to shirtCrewNeck
  background?: string         // optional hex — defaults to b6e3f4 (light blue)
  hatColor?: string           // hex for headwear items; ignored for hair styles
}
```

- [ ] **Step 2: Remove avatar_config from ChatMember**

In `src/lib/chat/types.ts`, find the `ChatMember` type and remove the `avatar_config` field. The type should become:

```ts
export type ChatMember = {
  user_id: string
  full_name: string | null
  email: string
  role: 'owner' | 'admin' | 'manager' | 'employee'
  username: string | null
  nickname: string | null
  avatar_url: string | null
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat/types.ts
git commit -m "feat: remove AvatarConfig type and avatar_config from ChatMember"
```

---

## Task 5: Clean Up Settings Page

> **Codex task** — text edit only.

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Remove AvatarConfig import**

Remove this line from the imports at the top of `src/app/settings/page.tsx`:

```ts
import type { AvatarConfig } from '@/lib/chat/types'
```

- [ ] **Step 2: Remove avatar_config from the Supabase select**

Find this select string:
```ts
.select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details, username, nickname, avatar_url, avatar_config')
```

Replace with:
```ts
.select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, invoice_payment_details, username, nickname, avatar_url')
```

- [ ] **Step 3: Update the Avatar section description and AvatarPicker props**

Find this block:
```tsx
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
```

Replace with:
```tsx
        {/* Profile Photo */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile photo</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Upload a photo — shown in chat and across the app.
          </p>
          <AvatarPicker
            userId={profile?.id ?? user.id}
            initialAvatarUrl={profile?.avatar_url ?? null}
            displayName={profile?.nickname ?? profile?.username ?? ''}
          />
        </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: remove avatar_config references from settings page"
```

---

## Task 6: Clean Up ChatRealtimeProvider

> **Codex task** — text edit only.

**Files:**
- Modify: `src/components/chat/ChatRealtimeProvider.tsx`

- [ ] **Step 1: Remove AvatarConfig import**

Remove this import line:
```ts
import type { AvatarConfig, ChatConversation, ChatMember } from '@/lib/chat/types'
```

Replace with:
```ts
import type { ChatConversation, ChatMember } from '@/lib/chat/types'
```

- [ ] **Step 2: Update the Supabase select string**

Find:
```ts
      .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email, username, nickname, avatar_url, avatar_config)')
```

Replace with:
```ts
      .select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email, username, nickname, avatar_url)')
```

- [ ] **Step 3: Update the inline row type**

Find this inline type annotation:
```ts
      profiles: { full_name: string | null; email: string; username: string | null; nickname: string | null; avatar_url: string | null; avatar_config: AvatarConfig | null } | null
```

Replace with:
```ts
      profiles: { full_name: string | null; email: string; username: string | null; nickname: string | null; avatar_url: string | null } | null
```

- [ ] **Step 4: Remove avatar_config from the member map**

Find:
```ts
        avatar_url: row.profiles?.avatar_url ?? null,
        avatar_config: row.profiles?.avatar_config ?? null,
```

Replace with:
```ts
        avatar_url: row.profiles?.avatar_url ?? null,
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatRealtimeProvider.tsx
git commit -m "feat: remove avatar_config from chat member loading"
```

---

## Task 7: Clean Up Chat Display Components

> **Codex task** — text edit only.

**Files:**
- Modify: `src/components/chat/MessageThread.tsx`
- Modify: `src/components/chat/ConversationList.tsx`
- Modify: `src/components/chat/NewDmDialog.tsx`

- [ ] **Step 1: MessageThread.tsx — remove avatarConfig prop**

Find:
```tsx
                <UserAvatar
                  avatarUrl={members[m.sender_id]?.avatar_url}
                  avatarConfig={members[m.sender_id]?.avatar_config}
                  name={senderName(members, m.sender_id)}
                  size={20}
                />
```

Replace with:
```tsx
                <UserAvatar
                  avatarUrl={members[m.sender_id]?.avatar_url}
                  name={senderName(members, m.sender_id)}
                  size={20}
                />
```

- [ ] **Step 2: ConversationList.tsx — remove avatarConfig prop**

Find:
```tsx
              <UserAvatar
                avatarUrl={m?.avatar_url}
                avatarConfig={m?.avatar_config}
                name={label(conv)}
                size={36}
```

Replace with:
```tsx
              <UserAvatar
                avatarUrl={m?.avatar_url}
                name={label(conv)}
                size={36}
```

- [ ] **Step 3: NewDmDialog.tsx — remove avatarConfig prop**

Find:
```tsx
              <UserAvatar avatarUrl={m.avatar_url} avatarConfig={m.avatar_config} name={displayName(m)} size={36} />
```

Replace with:
```tsx
              <UserAvatar avatarUrl={m.avatar_url} name={displayName(m)} size={36} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/MessageThread.tsx src/components/chat/ConversationList.tsx src/components/chat/NewDmDialog.tsx
git commit -m "feat: remove avatarConfig props from chat display components"
```

---

## Task 8: Remove @dicebear Packages

> **Conductor task** — requires pnpm.

- [ ] **Step 1: Uninstall packages**

```bash
pnpm remove @dicebear/core @dicebear/collection
```

Expected: `package.json` no longer contains `@dicebear/core` or `@dicebear/collection`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify build passes**

```bash
pnpm run build
```

Expected: clean build with no TypeScript errors and no references to dicebear or AvatarConfig. If any file still imports from `@dicebear` or `@/lib/chat/types` for `AvatarConfig`, fix those before committing.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: remove @dicebear packages"
```

---

## Task 9: Rewrite Terms of Service Page

> **Codex task** — text edit only.

**Files:**
- Modify: `src/app/terms/page.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `src/app/terms/page.tsx` with:

```tsx
import Link from 'next/link'

export const metadata = { title: 'Terms of Service — TimeWiseHub' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Terms of Service</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 14 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Acceptance</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              By creating an account or using TimeWiseHub, you agree to be bound by these Terms of Service ("Terms"). If you are using TimeWiseHub on behalf of an organisation, you represent and warrant that you have the authority to bind that organisation to these Terms, in which case "you" refers to that organisation.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              If you do not agree to these Terms, do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. Accounts</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>You must provide accurate and complete information when registering.</li>
              <li>You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.</li>
              <li>You must be at least 16 years old to use the service.</li>
              <li>One person or organisation may not maintain more than one free account.</li>
              <li>You must notify us immediately at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a> if you become aware of any unauthorised use of your account.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. Subscriptions and billing</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Paid plans are billed monthly in advance in AUD.</li>
              <li>You may cancel at any time. Access continues until the end of the current billing period. No partial refunds are issued for unused time.</li>
              <li>We reserve the right to change pricing with 30 days&apos; written notice.</li>
              <li>The Business plan is billed per seat. Adding members increases your monthly charge at the next billing cycle.</li>
              <li>Refunds are issued at our sole discretion and only for verified billing errors.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. User content</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              All content you submit, post, upload, or transmit through TimeWiseHub — including but not limited to messages, task notes, files, attachments, and profile images ("User Content") — remains your property.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              By submitting User Content, you grant Vividex a limited, non-exclusive, royalty-free licence to store, display, and process that content solely as necessary to provide the service.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">You warrant that:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>you have all rights necessary to submit the User Content;</li>
              <li>the User Content does not infringe any third-party intellectual property, privacy, or other legal rights; and</li>
              <li>the User Content does not contain material that is unlawful, threatening, abusive, harassing, defamatory, obscene, or otherwise objectionable.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex does not endorse, monitor, or assume any responsibility for User Content. We reserve the right — but have no obligation — to review, edit, or remove any User Content at our sole discretion and without notice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Acceptable use</h2>
            <p className="text-sm text-gray-600">You agree not to use TimeWiseHub to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>harass, bully, threaten, defame, or discriminate against any person;</li>
              <li>upload, share, or transmit content that is unlawful, infringing, pornographic, or contains malware or malicious code;</li>
              <li>access, export, or misuse payroll data, HR records, or personal information of other users beyond what is required for your authorised role within your organisation;</li>
              <li>access or attempt to access accounts, systems, or data you are not authorised to view;</li>
              <li>interfere with or disrupt the service or the servers or networks connected to it;</li>
              <li>reverse engineer, decompile, or attempt to extract the source code of any part of the platform;</li>
              <li>impersonate any person or entity, or misrepresent your affiliation with any person or entity;</li>
              <li>use the service for any unlawful purpose or in violation of any applicable law or regulation.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Platform role</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              TimeWiseHub is a software platform and tool — not a publisher, editor, or speaker of User Content. Vividex acts solely as a passive conduit for the transmission and storage of User Content and has no obligation to screen, review, monitor, or moderate any User Content or user interactions.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Users access and use TimeWiseHub and interact with other users entirely at their own risk. Vividex and TimeWiseHub are not liable for any actions, conduct, communications, content, or data created or shared by any user, whether or not such conduct is in violation of these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Indemnification</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You agree to indemnify, defend, and hold harmless Vividex, its directors, officers, employees, contractors, and agents from and against any and all claims, liabilities, losses, damages, and expenses (including reasonable legal costs) arising out of or in connection with:
            </p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>your use of or access to the service;</li>
              <li>your User Content;</li>
              <li>your breach of any provision of these Terms; or</li>
              <li>your violation of any applicable law or the rights of any third party.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              This indemnity survives termination of your account and these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Intellectual property</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex owns all rights in the platform, including its software, design, trademarks, and brand. You own your data. No licence is granted to copy, reproduce, modify, or reverse-engineer any part of the platform beyond what is necessary to use the service as intended.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Disclaimers</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The service is provided <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> without warranty of any kind. To the maximum extent permitted by law, Vividex expressly disclaims all warranties, express or implied, including but not limited to:
            </p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>implied warranties of merchantability and fitness for a particular purpose;</li>
              <li>warranties that the service will be uninterrupted, timely, secure, or error-free;</li>
              <li>warranties regarding the accuracy, reliability, or completeness of any content on the platform; and</li>
              <li>warranties that any defects or errors in the service will be corrected.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              You use the service entirely at your own risk.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">10. Limitation of liability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">To the maximum extent permitted by applicable law:</p>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Vividex shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, goodwill, or business opportunity, arising from or related to your use of or inability to use the service — even if Vividex has been advised of the possibility of such damages;</li>
              <li>Vividex&apos;s total aggregate liability to you for all claims arising out of or relating to these Terms or the service shall not exceed the total fees paid by you to Vividex in the twelve (12) months immediately preceding the event giving rise to the claim; and</li>
              <li>Vividex is not liable for any loss or damage arising from user conduct, User Content, unauthorised access to our servers or the personal information stored on them, interruptions or cessation of service, or any bugs, viruses, or harmful code transmitted through the service.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              These limitations apply regardless of the legal theory under which any claim is brought. Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities — in such cases, our liability is limited to the fullest extent permitted by applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">11. Your data</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You own your data. We use it only to provide and improve the service, as described in our <Link href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</Link>. You can export or request deletion of your data at any time by contacting us at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">12. Service availability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We aim for high availability but do not guarantee uninterrupted service. We are not liable for losses arising from downtime, data loss, maintenance windows, or service interruptions beyond our control.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">13. Termination</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You may close your account at any time via account settings or by contacting us. We may suspend or terminate accounts that violate these Terms, with or without notice. Upon termination, your data will be deleted within 30 days, subject to any legal retention obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">14. Governing law</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              These Terms are governed by the laws of New South Wales, Australia. You agree to submit to the exclusive jurisdiction of the courts of New South Wales for the resolution of any dispute arising from these Terms or your use of the service.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Nothing in this clause limits any rights you may have under mandatory consumer protection laws applicable in your jurisdiction, including the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">15. Changes to these Terms</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We may update these Terms from time to time. Material changes will be notified by email at least 14 days before they take effect. Continued use of the service after the effective date of any changes constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">
            Questions about these Terms? Contact us at{' '}
            <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/terms/page.tsx
git commit -m "feat: rewrite Terms of Service — add indemnification, platform role, NSW governing law"
```

---

## Task 10: Create Privacy Policy Page

> **Codex task** — text edit only.

**Files:**
- Create: `src/app/privacy/page.tsx`

- [ ] **Step 1: Create the file**

Create `src/app/privacy/page.tsx` with:

```tsx
import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — TimeWiseHub' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Privacy Policy</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 14 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Who we are</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex operates TimeWiseHub, a workforce management platform. We are based in New South Wales, Australia. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use TimeWiseHub.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Contact: <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. Data we collect</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We collect the following categories of personal information:</p>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li><strong>Account data:</strong> your name, email address, username, and password (stored as a secure hash — we never store your password in plain text).</li>
              <li><strong>Profile data:</strong> job title, start date, profile photo, work hours preferences, Australian state, and any other information you choose to add to your profile.</li>
              <li><strong>Usage data:</strong> time logs, expense records, tasks, leave requests, invoices, payroll records, and chat messages and attachments you create within the platform.</li>
              <li><strong>Payment data:</strong> subscription billing is handled by Stripe. We do not store raw card numbers or full payment details. We store only your Stripe customer ID and subscription status.</li>
              <li><strong>Technical data:</strong> IP address, browser type, and device information, collected automatically for security and service operation purposes.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. How we use your data</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We use your personal information to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>provide, operate, and maintain the TimeWiseHub service;</li>
              <li>send transactional emails such as account verification, password reset, and platform notifications via Resend;</li>
              <li>process subscription payments and manage your billing via Stripe;</li>
              <li>provide customer support and respond to enquiries;</li>
              <li>detect and prevent fraud, abuse, or security incidents; and</li>
              <li>comply with applicable legal obligations.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>We do not sell your personal information.</strong> We do not use your data for advertising or share it with third parties for their marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. Third-party processors</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We use the following third-party services to operate the platform. Each is bound by a data processing agreement and appropriate security standards.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-600 border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Processor</th>
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Purpose</th>
                    <th className="text-left py-2 font-semibold text-gray-700">Region</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 pr-4 font-medium">Supabase</td>
                    <td className="py-2 pr-4">Database, file storage, authentication</td>
                    <td className="py-2">Australia (ap-southeast-2)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Stripe</td>
                    <td className="py-2 pr-4">Subscription billing and payment processing</td>
                    <td className="py-2">Global</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Resend</td>
                    <td className="py-2 pr-4">Transactional email delivery</td>
                    <td className="py-2">Global</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Vercel</td>
                    <td className="py-2 pr-4">Application hosting and edge delivery</td>
                    <td className="py-2">Global</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Data retention</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Personal data is retained for as long as your account is active.</li>
              <li>On account deletion, your data is removed from our systems within 30 days.</li>
              <li>Billing and financial records are retained for 7 years as required under Australian taxation law.</li>
              <li>We may retain anonymised, aggregated data that cannot identify you indefinitely.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Your rights</h2>
            <p className="text-sm text-gray-600 leading-relaxed">You have the right to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li><strong>Access</strong> the personal data we hold about you;</li>
              <li><strong>Correct</strong> inaccurate or incomplete data;</li>
              <li><strong>Delete</strong> your personal data (subject to legal retention obligations);</li>
              <li><strong>Object</strong> to certain processing of your data; and</li>
              <li><strong>Portability</strong> — receive your data in a structured, machine-readable format.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              To exercise any of these rights, contact us at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>. We will respond within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Security</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>All data is encrypted in transit using TLS and encrypted at rest.</li>
              <li>Access to production systems is restricted to authorised personnel and is logged.</li>
              <li>We follow responsible disclosure practices. To report a security vulnerability, contact <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              No system is completely secure. While we take reasonable steps to protect your data, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Cookies</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We use session cookies only, which are required for authentication and to keep you logged in. We do not use tracking cookies, advertising cookies, or third-party analytics cookies that monitor your behaviour across other websites.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Changes to this policy</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you by email of any material changes before they take effect. The current version is always available at <Link href="/privacy" className="text-cyan-600 hover:underline">timewisehub.com/privacy</Link>.
            </p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">
            Questions about this policy? Contact us at{' '}
            <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/privacy/page.tsx
git commit -m "feat: add Privacy Policy page at /privacy"
```

---

## Task 11: Final Build Verification

> **Conductor task** — requires pnpm.

- [ ] **Step 1: Run full build**

```bash
pnpm run build
```

Expected: clean build with zero TypeScript errors and zero ESLint warnings. If any errors mention `AvatarConfig`, `avatar_config`, `avatarConfig`, or `@dicebear`, trace them to the file reported and remove the reference.

- [ ] **Step 2: Manual smoke check**

1. Open the app in a browser.
2. Navigate to Settings — confirm the section now says "Profile photo" with a single upload button (no tabs, no avatar builder).
3. Navigate to `/terms` — confirm all 15 sections render, governing law says NSW, contact shows `admin@vividex.au`.
4. Navigate to `/privacy` — confirm the page renders with the processor table and all 9 sections.
5. Open the register page — confirm both `/terms` and `/privacy` links resolve correctly.
6. Open Chat — confirm member avatars show either a photo or initials circle (no broken images).

- [ ] **Step 3: Commit (if any final fixes were needed)**

```bash
git add -A
git commit -m "fix: post-build cleanup"
```
