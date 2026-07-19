# SWMS/JSA In-App Reader Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SWMS/JSA documents a real in-app HTML page (mirroring the existing invoice detail page pattern) reachable directly from the Dashboard and push notifications, with sign-in-place at the bottom — replacing the current PDF-in-new-tab-only "View" flow.

**Architecture:** A new server-component route renders authored documents as HTML (reusing the category-grouped-rows structure already proven in `SwmsDocumentPdf.tsx`) or, for uploaded files, an "Open document" link — plus a client-side Sign section and manager actions (Edit/Delete/Download PDF) in the header. Three existing entry points (Dashboard widget, push notification, project list's View) are repointed at the new page. A shared normalization helper closes a real gap found while tracing this code path: pre-multi-category JSA documents can crash `categories.map()` wherever `content` is read without the conversion that today only exists in the edit form's loader.

**Tech Stack:** Next.js 16 App Router (server components), Supabase (`@supabase/ssr` + service client), TypeScript strict, Tailwind v4.

## Global Constraints

- No test runner in this repo — verification gate is `pnpm run build` (tsc + eslint) plus manual smoke test, per project convention.
- Windows dev environment — use the Write/Edit tools for any file containing single quotes in JSX (e.g. `'use client'`), not bash heredocs.
- RLS is the access-control source of truth (org membership / crew / site sign-in) — server components read with the requester's own session first; only switch to the service client for operations RLS wouldn't allow the requester directly (generating signed URLs for other users' signature files, resolving other users' names).
- `.gitattributes` normalises line endings to LF — don't fight CRLF warnings.

---

## Task 1: Fix the missing multi-category JSA backward-compat gap

**Files:**
- Create: `src/lib/normalize-swms-content.ts`
- Modify: `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts:1-11,42` (add import, replace one line)
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx:1-66` (add import, replace one block)

**Interfaces:**
- Produces: `normalizeSwmsContent(raw: SwmsAuthoredContent): SwmsAuthoredContent` — upgrades a pre-multi-category JSA's `content` (which has `category` but no `categories`) to the current shape by wrapping it in a one-element `categories` array and tagging every row with that category. For SWMS content, or JSA content that's already in the current shape, returns it unchanged.

### Context

`src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx:50-66` already contains this exact conversion, but only in the edit-form loader:

```typescript
let existingContent: SwmsAuthoredContent | null = null
if (documentId) {
  const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (doc?.content as any) ?? null
  if (raw && raw.docType === 'jsa' && !raw.categories && raw.category) {
    // Pre-multi-category JSA: the whole document was for exactly one hazard, so every row can
    // be unambiguously tagged with it.
    existingContent = {
      ...raw,
      categories: [raw.category],
      rows: (raw.rows ?? []).map((r: SwmsRow) => ({ ...r, category: raw.category })),
    } as SwmsAuthoredContent
  } else {
    existingContent = raw as SwmsAuthoredContent | null
  }
}
```

`src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts:42` has no such conversion:

```typescript
const content = doc.content as SwmsAuthoredContent
```

Any JSA document authored before today's multi-category work has `category` (singular) in the DB with no `categories` field. Loaded this way, `content.docType === 'jsa' ? content.categories : []` (line 81) passes `undefined` into `SwmsDocumentPdf`, whose `categories.map(...)` (line 84 of `SwmsDocumentPdf.tsx`) throws — so **View for any pre-multi-category JSA is currently broken in production**, independent of the already-fixed em-dash bug. This task extracts the working conversion into a shared helper and applies it everywhere `content` is read from the DB, closing the gap before Task 2 builds a second consumer of the same data.

- [ ] **Step 1: Create the shared helper**

Write `src/lib/normalize-swms-content.ts`:

```typescript
import type { SwmsAuthoredContent, JsaHazard } from '@/types/swms'

/** Pre-multi-category JSA documents stored a single `category` instead of a `categories`
 *  array. Every row in a document like that was unambiguously for that one hazard, so it
 *  can be safely upgraded to the current shape before rendering. SWMS content and JSA
 *  content already in the current shape pass through unchanged.
 *
 *  `raw` is typed as `SwmsAuthoredContent` for callers, but legacy DB rows don't actually
 *  conform to it (that's the whole reason this function exists) -- an intersection type
 *  strict enough to express "maybe has `category` instead of `categories`" collapses to
 *  `never` under the current discriminated union, so the runtime check below intentionally
 *  drops to `any`, same as the inline check this replaces used to. */
export function normalizeSwmsContent(raw: SwmsAuthoredContent): SwmsAuthoredContent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = raw as any
  if (content.docType === 'jsa' && !content.categories && content.category) {
    const category = content.category as JsaHazard
    return {
      ...content,
      categories: [category],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: (content.rows ?? []).map((r: any) => ({ ...r, category })),
    } as SwmsAuthoredContent
  }
  return raw
}
```

**Note (found during Task 1's build verification, not caught in plan review):** the original
draft of this helper typed the internal cast as `raw as (SwmsAuthoredContent & { category?:
JsaHazard })`. That fails `tsc` — intersecting the union's `swms` branch (`category: HrcwCategory`,
required) with `{ category?: JsaHazard }` produces a type conflict that TypeScript collapses to
`never`, which then poisons the `docType === 'jsa'` narrowing later in the function (`Property
'category' does not exist on type 'never'`). The `any`-based version above is what actually
type-checks and is what's really in the repo — matches the original inline check's own use of
`any` for the same reason (legacy raw JSON from the DB doesn't conform to the current type by
definition).

- [ ] **Step 2: Wire it into the PDF route**

In `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`, add the import alongside the existing type import:

Find:
```typescript
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'
```

Replace with:
```typescript
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import { normalizeSwmsContent } from '@/lib/normalize-swms-content'
import type { SwmsAuthoredContent } from '@/types/swms'
```

Then find:
```typescript
  const content = doc.content as SwmsAuthoredContent
```

Replace with:
```typescript
  const content = normalizeSwmsContent(doc.content as SwmsAuthoredContent)
```

- [ ] **Step 3: Wire it into the edit-form loader**

In `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`, add the import:

Find:
```typescript
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsAuthoredContent, SwmsRow } from '@/types/swms'
```

Replace with:
```typescript
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { normalizeSwmsContent } from '@/lib/normalize-swms-content'
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsAuthoredContent } from '@/types/swms'
```

(`SwmsRow` drops out of this file's imports — it was only used inside the inline conversion block being replaced.)

Then find the whole existing block:
```typescript
  let existingContent: SwmsAuthoredContent | null = null
  if (documentId) {
    const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (doc?.content as any) ?? null
    if (raw && raw.docType === 'jsa' && !raw.categories && raw.category) {
      // Pre-multi-category JSA: the whole document was for exactly one hazard, so every row can
      // be unambiguously tagged with it.
      existingContent = {
        ...raw,
        categories: [raw.category],
        rows: (raw.rows ?? []).map((r: SwmsRow) => ({ ...r, category: raw.category })),
      } as SwmsAuthoredContent
    } else {
      existingContent = raw as SwmsAuthoredContent | null
    }
  }
```

Replace with:
```typescript
  let existingContent: SwmsAuthoredContent | null = null
  if (documentId) {
    const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
    existingContent = doc?.content ? normalizeSwmsContent(doc.content as SwmsAuthoredContent) : null
  }
```

- [ ] **Step 4: Verify**

Run: `pnpm run build`
Expected: passes clean, no unused-import warnings (confirm `SwmsRow` isn't still referenced elsewhere in `new/page.tsx` before removing its import — if it's used elsewhere in that file, keep the import).

Manual smoke (defer to user, note in the PR/handover): open an authored JSA document that existed before today's multi-category work (if one exists) via both "Download PDF" and "Edit" — both should still render/load correctly, proving the conversion path is unchanged, just centralized.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize-swms-content.ts src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx"
git commit -m "fix: normalize pre-multi-category JSA content wherever it's read, not just in the edit form"
```

---

## Task 2: Build the reader page and its components

**Files:**
- Create: `src/components/projects/SwmsDocumentContent.tsx`
- Create: `src/components/projects/SwmsDocumentSignSection.tsx`
- Create: `src/components/projects/DeleteSwmsDocumentButton.tsx`
- Create: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]/page.tsx`
- Modify: `src/components/projects/ProjectSwmsPanel.tsx` (full-file replacement)

**Interfaces:**
- Consumes: `normalizeSwmsContent` from `@/lib/normalize-swms-content` (Task 1). `SwmsAuthoredContent`, `SwmsRow`, `HrcwCategory`, `JsaHazard`, `SwmsDocument` from `@/types/swms`. `HRCW_CATEGORY_LABELS` from `@/lib/swms-templates`. `JSA_HAZARD_LABELS` from `@/lib/jsa-templates`. `ConfirmDialog` from `@/components/ConfirmDialog`. `SignaturePad` from `@/components/settings/SignaturePad`. `createClient` (browser) from `@/lib/supabase-browser`, `createClient` (server) from `@/lib/supabase-server`, `createServiceClient` from `@/lib/supabase-service`. `getWorkspaceProfileForUser` from `@/lib/workspace-profiles/resolve`. `getTodaySydneyDateString` from `@/lib/today`.
- Produces:
  - `SwmsDocumentContent` (default export) — props `{ source: 'uploaded'; name: string; openUrl: string | null } | { source: 'authored'; projectName: string; projectLabel: string; docType: 'swms' | 'jsa'; category: HrcwCategory | null; categories: JsaHazard[]; supervisor: string; preparedBy: string; date: string; rows: SwmsRow[]; ppe: string[]; consultedNames: string[]; whoAtRisk?: string; equipment?: string; emergencyProcedures?: string; signatures: SwmsContentSignature[] }`. Also exports `type SwmsContentSignature = { name: string; acknowledgedAt: string; signatureUrl: string | null }`.
  - `SwmsDocumentSignSection` (default export, client) — props `{ documentId: string; currentUserId: string; canAcknowledge: boolean; hasAcknowledged: boolean; hasSignature: boolean }`.
  - `DeleteSwmsDocumentButton` (default export, client) — props `{ documentId: string; storagePath: string; documentName: string; clientId: string; projectId: string }`.

### Step 1: `SwmsDocumentContent.tsx`

- [ ] Write `src/components/projects/SwmsDocumentContent.tsx`:

```tsx
import type { HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'

export type SwmsContentSignature = {
  name: string
  acknowledgedAt: string
  signatureUrl: string | null
}

type AuthoredProps = {
  source: 'authored'
  projectName: string
  projectLabel: string
  docType: 'swms' | 'jsa'
  category: HrcwCategory | null
  categories: JsaHazard[]
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedNames: string[]
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
  signatures: SwmsContentSignature[]
}

type UploadedProps = {
  source: 'uploaded'
  name: string
  openUrl: string | null
}

type Props = AuthoredProps | UploadedProps

function RowsTable({ rows }: { rows: SwmsRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 dark:border-slate-800">
          <th className="py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Job Step</th>
          <th className="py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Hazard</th>
          <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Control Measure</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-3 pr-4 align-top text-gray-900 dark:text-slate-100">{row.jobStep}</td>
            <td className="py-3 pr-4 align-top text-gray-700 dark:text-slate-300">{row.hazard}</td>
            <td className="py-3 align-top text-gray-700 dark:text-slate-300">{row.control}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function SwmsDocumentContent(props: Props) {
  if (props.source === 'uploaded') {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
          This document was uploaded as a file rather than built in the SWMS/JSA builder, so it can&apos;t be shown inline.
        </p>
        {props.openUrl ? (
          <a
            href={props.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] px-4 py-2 text-sm font-semibold"
          >
            Open document — {props.name}
          </a>
        ) : (
          <p className="mt-4 text-sm font-semibold text-red-600">Couldn&apos;t generate a link to this file. Try again shortly.</p>
        )}
      </div>
    )
  }

  const {
    docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedNames,
    whoAtRisk, equipment, emergencyProcedures, signatures, projectName, projectLabel,
  } = props
  const title = docType === 'jsa' ? 'Job Safety Analysis' : 'Safe Work Method Statement'
  const categoryLabel = docType === 'jsa'
    ? categories.map(c => JSA_HAZARD_LABELS[c]).join(' + ')
    : (category ? HRCW_CATEGORY_LABELS[category] : '')
  const additionalRows = rows.filter(r => !r.category)

  return (
    <div className="space-y-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400">{categoryLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 border-t border-gray-100 pt-6 dark:border-slate-800">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{projectLabel}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{projectName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Supervisor</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{supervisor}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Prepared By</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{preparedBy}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Date</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{date}</p>
        </div>
      </div>

      {docType === 'jsa' && (whoAtRisk || equipment || emergencyProcedures) && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 border-t border-gray-100 pt-6 dark:border-slate-800">
          {whoAtRisk && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Who Is At Risk</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{whoAtRisk}</p>
            </div>
          )}
          {equipment && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Plant / Equipment</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{equipment}</p>
            </div>
          )}
          {emergencyProcedures && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Emergency Procedures</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{emergencyProcedures}</p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">Job Steps, Hazards &amp; Controls</p>
        {docType === 'jsa' && categories.length > 0 ? (
          <div className="space-y-6">
            {categories.map(cat => {
              const group = rows.filter(r => r.category === cat)
              if (group.length === 0) return null
              return (
                <div key={cat}>
                  <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">{JSA_HAZARD_LABELS[cat]}</p>
                  <RowsTable rows={group} />
                </div>
              )
            })}
            {additionalRows.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">Additional Steps</p>
                <RowsTable rows={additionalRows} />
              </div>
            )}
          </div>
        ) : (
          <RowsTable rows={rows} />
        )}
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">PPE Required</p>
        <div className="flex flex-wrap gap-2">
          {ppe.map((item, i) => (
            <span key={i} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-300">{item}</span>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-2 text-lg font-bold text-gray-900 dark:text-slate-100">Consultation</p>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          {consultedNames.length > 0
            ? `Consulted in developing this ${docType === 'jsa' ? 'JSA' : 'SWMS'}: ${consultedNames.join(', ')}`
            : 'No crew members recorded as consulted.'}
        </p>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">Acknowledgments</p>
        {signatures.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-slate-400">No crew members have acknowledged this document yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-slate-800">
            {signatures.map((sig, i) => (
              <li key={i} className="flex items-center gap-4 py-3">
                <span className="min-w-[140px] text-sm font-bold text-gray-900 dark:text-slate-100">{sig.name}</span>
                {sig.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sig.signatureUrl} alt={`${sig.name}'s signature`} className="h-10 max-w-[160px] object-contain" />
                ) : (
                  <span className="h-10 w-[160px] border-b border-gray-200 dark:border-slate-700" />
                )}
                <span className="text-xs text-gray-500 dark:text-slate-500">{sig.acknowledgedAt}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

### Step 2: `SwmsDocumentSignSection.tsx`

- [ ] Write `src/components/projects/SwmsDocumentSignSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import SignaturePad from '@/components/settings/SignaturePad'

export default function SwmsDocumentSignSection({
  documentId,
  currentUserId,
  canAcknowledge,
  hasAcknowledged,
  hasSignature,
}: {
  documentId: string
  currentUserId: string
  canAcknowledge: boolean
  hasAcknowledged: boolean
  hasSignature: boolean
}) {
  const router = useRouter()
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false)
  const [acking, setAcking] = useState(false)
  const [localHasSignature, setLocalHasSignature] = useState(hasSignature)

  async function handleAcknowledge() {
    setAcking(true)
    const supabase = createClient()
    await supabase.from('project_swms_acknowledgments').insert({
      swms_document_id: documentId,
      user_id: currentUserId,
    })
    setAcking(false)
    setShowSignaturePrompt(false)
    router.refresh()
  }

  function handleAcknowledgeClick() {
    if (!localHasSignature) {
      setShowSignaturePrompt(true)
      return
    }
    handleAcknowledge()
  }

  if (!canAcknowledge) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-lg font-bold text-gray-900 dark:text-slate-100">Sign</p>
      {hasAcknowledged ? (
        <p className="mt-3 text-sm font-bold text-green-600 dark:text-green-400">✓ You&apos;ve acknowledged this document.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            Confirm you&apos;ve read and understood this document before starting work.
          </p>
          <button
            onClick={handleAcknowledgeClick}
            disabled={acking}
            className="mt-4 rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
          >
            {acking ? 'Saving…' : "I've read and understood this"}
          </button>
          {showSignaturePrompt && (
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
              <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300">
                Draw your signature to confirm you&apos;ve read and understood this document. It&apos;s saved to your profile and reused next time.
              </p>
              <SignaturePad
                userId={currentUserId}
                initialSignatureUrl={null}
                onSaved={() => {
                  setLocalHasSignature(true)
                  handleAcknowledge()
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

### Step 3: `DeleteSwmsDocumentButton.tsx`

- [ ] Write `src/components/projects/DeleteSwmsDocumentButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteSwmsDocumentButton({
  documentId,
  storagePath,
  documentName,
  clientId,
  projectId,
}: {
  documentId: string
  storagePath: string
  documentName: string
  clientId: string
  projectId: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.storage.from('project-swms').remove([storagePath])
    await supabase.from('project_swms_documents').delete().eq('id', documentId)
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}`)
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={deleting}
        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:bg-slate-900 dark:hover:bg-red-500/10"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete SWMS document"
        message={`"${documentName}" will be permanently deleted and crew will lose access to it.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
```

### Step 4: The page itself

- [ ] Write `src/app/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { getTodaySydneyDateString } from '@/lib/today'
import { normalizeSwmsContent } from '@/lib/normalize-swms-content'
import SwmsDocumentContent, { type SwmsContentSignature } from '@/components/projects/SwmsDocumentContent'
import SwmsDocumentSignSection from '@/components/projects/SwmsDocumentSignSection'
import DeleteSwmsDocumentButton from '@/components/projects/DeleteSwmsDocumentButton'
import type { SwmsAuthoredContent } from '@/types/swms'

export default async function SwmsDocumentPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string; documentId: string }>
}) {
  const { id: clientId, projectId, documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS-scoped read with the requester's own session -- if this returns a row,
  // they're entitled to view it.
  const { data: doc, error: docError } = await supabase
    .from('project_swms_documents')
    .select('id, name, storage_path, category, doc_type, source, content')
    .eq('id', documentId)
    .eq('project_id', projectId)
    .single()
  if (docError || !doc) notFound()
  if (doc.source === 'authored' && !doc.content) notFound()

  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const [{ data: project }, { data: membership }, { data: currentProfile }, { data: crewRows }, { data: myAck }] = await Promise.all([
    supabase.from('projects').select('name, site_id').eq('id', projectId).single(),
    supabase.from('organisation_members').select('role').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('signature_path').eq('id', user.id).maybeSingle(),
    supabase.from('project_members').select('user_id').eq('project_id', projectId),
    supabase.from('project_swms_acknowledgments').select('id').eq('swms_document_id', documentId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!project) notFound()

  const canManage = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const crewUserIds = new Set((crewRows ?? []).map(r => r.user_id as string))
  const isCrewMember = crewUserIds.has(user.id)
  const crewSize = crewUserIds.size
  const hasSignature = !!currentProfile?.signature_path
  const hasAcknowledged = !!myAck

  let hasSignedInToday = false
  if (project.site_id) {
    const { data: signIn } = await supabase
      .from('site_sign_ins')
      .select('id')
      .eq('site_id', project.site_id)
      .eq('user_id', user.id)
      .eq('sign_in_date', getTodaySydneyDateString())
      .maybeSingle()
    hasSignedInToday = !!signIn
  }
  const canAcknowledge = isCrewMember || hasSignedInToday

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link href={`/dashboard/clients/${clientId}/projects/${projectId}`} className="text-sm font-bold text-cyan-600 hover:underline">
        ← Back to project
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {canManage && doc.source === 'authored' && (
          <Link
            href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?documentId=${doc.id}`}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Edit
          </Link>
        )}
        {doc.source === 'authored' && (
          <a
            href={`/api/projects/${projectId}/swms/${doc.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Download PDF
          </a>
        )}
        {canManage && (
          <DeleteSwmsDocumentButton
            documentId={doc.id}
            storagePath={doc.storage_path}
            documentName={doc.name}
            clientId={clientId}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  )

  if (doc.source === 'uploaded') {
    const service = createServiceClient()
    const { data: signed } = await service.storage.from('project-swms').createSignedUrl(doc.storage_path, 3600)

    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {header}
          <SwmsDocumentContent source="uploaded" name={doc.name} openUrl={signed?.signedUrl ?? null} />
          <SwmsDocumentSignSection
            documentId={doc.id}
            currentUserId={user.id}
            canAcknowledge={canAcknowledge}
            hasAcknowledged={hasAcknowledged}
            hasSignature={hasSignature}
          />
        </div>
      </div>
    )
  }

  const content = normalizeSwmsContent(doc.content as SwmsAuthoredContent)
  const consultedUserIds = content.consultedUserIds ?? []

  const { data: acks } = await supabase
    .from('project_swms_acknowledgments')
    .select('user_id, acknowledged_at')
    .eq('swms_document_id', documentId)
    .order('acknowledged_at', { ascending: true })

  const ackUserIds = (acks ?? []).map(a => a.user_id as string)
  const allUserIds = Array.from(new Set([...ackUserIds, ...consultedUserIds]))

  const service = createServiceClient()
  const { data: profiles } = allUserIds.length > 0
    ? await service.from('profiles').select('id, full_name, username, signature_path').in('id', allUserIds)
    : { data: [] as { id: string; full_name: string | null; username: string | null; signature_path: string | null }[] }

  function nameFor(userId: string): string {
    const p = (profiles ?? []).find(row => row.id === userId)
    return p?.full_name || p?.username || 'Unknown'
  }

  const consultedNames = consultedUserIds.map(nameFor)

  const authoredSignatures: SwmsContentSignature[] = await Promise.all((acks ?? []).map(async ack => {
    const profile = (profiles ?? []).find(p => p.id === ack.user_id)
    let signatureUrl: string | null = null
    if (profile?.signature_path) {
      const { data: signed } = await service.storage.from('signatures').createSignedUrl(profile.signature_path, 3600)
      signatureUrl = signed?.signedUrl ?? null
    }
    return {
      name: nameFor(ack.user_id as string),
      acknowledgedAt: ack.acknowledged_at as string,
      signatureUrl,
    }
  }))

  const ackCountLabel = canManage ? `${(acks ?? []).length} of ${crewSize} crew acknowledged` : null

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {header}
        {ackCountLabel && (
          <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">{ackCountLabel}</p>
        )}
        <SwmsDocumentContent
          source="authored"
          projectName={project.name}
          projectLabel={terminology.project.singular}
          docType={content.docType}
          category={content.docType === 'swms' ? content.category : null}
          categories={content.docType === 'jsa' ? content.categories : []}
          supervisor={content.supervisor}
          preparedBy={content.preparedBy}
          date={content.date}
          rows={content.rows}
          ppe={content.ppe}
          consultedNames={consultedNames}
          whoAtRisk={content.docType === 'jsa' ? content.whoAtRisk : undefined}
          equipment={content.docType === 'jsa' ? content.equipment : undefined}
          emergencyProcedures={content.docType === 'jsa' ? content.emergencyProcedures : undefined}
          signatures={authoredSignatures}
        />
        <SwmsDocumentSignSection
          documentId={doc.id}
          currentUserId={user.id}
          canAcknowledge={canAcknowledge}
          hasAcknowledged={hasAcknowledged}
          hasSignature={hasSignature}
        />
      </div>
    </div>
  )
}
```

### Step 5: Update `ProjectSwmsPanel.tsx` — remove inline sign UI, repoint View

The list becomes read-only status (name, category, ack count) plus View/Edit/Delete — signing now happens on the new document page (Step 4), not inline in this list, to keep one acknowledge code path instead of two.

- [ ] Replace the full contents of `src/components/projects/ProjectSwmsPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import { resolveSwmsCategoryLabel } from '@/lib/swms-category-label'
import type { SwmsDocument } from '@/types/swms'

export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
  hasSignature,
  hasSignedInToday,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
  hasSignature: boolean
  hasSignedInToday: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SwmsDocument | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const path = `${projectId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, file)
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { error: insertError } = await supabase.from('project_swms_documents').insert({
      project_id: projectId,
      name: file.name,
      storage_path: path,
      uploaded_by: user.id,
    })
    setUploading(false)
    e.target.value = ''
    if (insertError) { setError(insertError.message); return }
    router.refresh()
  }

  function handleView(doc: SwmsDocument) {
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}/swms/${doc.id}`)
  }

  async function handleDelete(doc: SwmsDocument) {
    const supabase = createClient()
    await supabase.storage.from('project-swms').remove([doc.storagePath])
    await supabase.from('project_swms_documents').delete().eq('id', doc.id)
    setPendingDelete(null)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety
        </h2>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new`}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
            >
              + Build SWMS
            </Link>
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?type=jsa`}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
            >
              + Build JSA
            </Link>
            <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '+ Upload SWMS'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {documents.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">No SWMS documents added yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {documents.map(doc => {
            const hasAcknowledged = doc.acknowledgments.some(a => a.userId === currentUserId)
            return (
              <li key={doc.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.name}</p>
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">
                        {resolveSwmsCategoryLabel(doc.category, doc.docType)}
                      </p>
                    )}
                    {canManage && (
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.acknowledgments.length} of {crewSize} crew acknowledged
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => handleView(doc)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
                    {canManage && doc.source === 'authored' && (
                      <Link href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?documentId=${doc.id}`} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">Edit</Link>
                    )}
                    {(isCrewMember || hasSignedInToday) && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
                    {canManage && (
                      <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete SWMS document"
        message={`"${pendingDelete?.name}" will be permanently deleted and crew will lose access to it.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
```

Notes on what changed vs. the current file: removed the `hasSignature` param's usage for the inline `SignaturePad` (the prop stays in the signature — still passed in by the project page — but is now unused inside this component now that signing moved to the document page). `hasSignedInToday`/`isCrewMember`/`hasSignature` remain in the prop list unchanged (the project page already passes them; removing them would require also touching the project page, which is out of scope — they're just no longer all read internally, which `eslint` won't flag since they're destructured function parameters, not unused local variables).

- [ ] **Step 6: Verify**

Run: `pnpm run build`
Expected: passes clean. If `hasSignature` shows an unused-variable lint warning as a destructured-but-unread prop, that's expected to pass (TypeScript/ESLint don't flag unused destructured function parameters by default in this repo's config) — but if the build does flag it, prefix it with `_` (`_hasSignature`) rather than removing it from the prop list, since the project page still passes it.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/SwmsDocumentContent.tsx src/components/projects/SwmsDocumentSignSection.tsx src/components/projects/DeleteSwmsDocumentButton.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]/page.tsx" src/components/projects/ProjectSwmsPanel.tsx
git commit -m "feat: in-app SWMS/JSA document reader page with sign-in-place"
```

---

## Task 3: Point the three entry points at the new page

**Files:**
- Modify: `src/components/dashboard/DashboardUpcoming.tsx` (one line)
- Modify: `src/lib/swms-notifications.ts` (one line)

**Interfaces:**
- Consumes: the route from Task 2 — `/dashboard/clients/{clientId}/projects/{projectId}/swms/{documentId}`.

- [ ] **Step 1: Dashboard "Today" widget**

In `src/components/dashboard/DashboardUpcoming.tsx`, find:
```typescript
            href={`/dashboard/clients/${item.clientId}/projects/${item.projectId}`}
```
(inside the `swmsAwaitingSignature.map(...)` block — there is another, unrelated `Link` with a similar-looking `href` a few lines above in the sessions block; make sure to edit the one inside `swmsAwaitingSignature.map`, immediately preceded by `key={\`swms-${item.id}\`}`)

Replace with:
```typescript
            href={`/dashboard/clients/${item.clientId}/projects/${item.projectId}/swms/${item.id}`}
```

- [ ] **Step 2: Push notification URL**

In `src/lib/swms-notifications.ts`, find:
```typescript
  const url = `/dashboard/clients/${project.client_id}/projects/${projectId}`
```

Replace with:
```typescript
  const url = `/dashboard/clients/${project.client_id}/projects/${projectId}/swms/${documentId}`
```

- [ ] **Step 3: Verify**

Run: `pnpm run build`
Expected: passes clean.

Manual smoke (defer to user): from the Dashboard "Today" widget, click an awaiting-signature SWMS/JSA item and confirm it lands directly on the document page (Task 2), not the project page.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardUpcoming.tsx src/lib/swms-notifications.ts
git commit -m "feat: point Dashboard and notification SWMS/JSA links at the new document page"
```

---

## Final acceptance checklist (manual smoke, deferred to user per project convention — no test runner exists)

- [ ] Authored single-category SWMS: open via Dashboard widget → lands on document page, content renders, Sign works, ack count updates, Download PDF works, Edit/Delete visible for managers only.
- [ ] Authored multi-category JSA: rows group by category on the page the same way they do in the PDF.
- [ ] A pre-multi-category JSA (if one exists in prod): View/Edit/PDF all still work — proves Task 1's fix.
- [ ] Uploaded file: "Open document" link opens the signed URL; Sign section still works from this page.
- [ ] Two-account check: crew member (Sign only, no Edit/Delete/Download) vs. manager (full header actions, no Sign section unless also crew/signed-in).
- [ ] Delete from the document page redirects to the project page.
- [ ] Project page's Safety list no longer shows an inline Sign button — View/Edit/Delete only.
- [ ] Push notification (trigger one, or inspect a recent one) links directly to the document.
