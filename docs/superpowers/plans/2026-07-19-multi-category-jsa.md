# Multi-Category JSA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a JSA cover multiple hazard categories in one document (e.g. ladder work + power
tools), grouped and collapsible on screen and in the generated PDF. SWMS stays single-category.

**Architecture:** `SwmsAuthoredContent`'s JSA branch changes `category: JsaHazard` to
`categories: JsaHazard[]`; each `SwmsRow` gains an optional `category?: JsaHazard` tag so rows
merged from different templates can be grouped for display without restructuring the flat array
they already live in. No database migration — the existing free-text `category` column stores a
comma-joined list of hazard keys for JSA.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `@react-pdf/renderer` (already
installed).

## Global Constraints

- Verification gate is `pnpm run build` (tsc + eslint) — no test runner in this project.
- No database migration.
- No new npm dependencies.
- SWMS is entirely unaffected — single category, unchanged dropdown, unchanged licence-class
  cross-check (`missingHrwl`).
- Unchecking a JSA category deletes its rows (including edits) from the form — this is
  intentional, not a bug, and is flagged directly in the UI.
- Source spec: `docs/superpowers/specs/2026-07-19-multi-category-jsa-design.md`.

This is one cohesive task, not several — `types/swms.ts`'s field rename cascades to every other
file in TypeScript strict mode simultaneously, so there's no way to split this into independently
buildable/reviewable pieces without an intermediate broken build. Steps are still broken out
per-file below for traceability.

---

### Task 1: Multi-category JSA

**Files:**
- Modify: `src/types/swms.ts`
- Create: `src/lib/swms-category-label.ts`
- Modify: `src/components/projects/SwmsBuilderForm.tsx`
- Modify: `src/app/api/projects/[projectId]/swms/route.ts`
- Modify: `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`
- Modify: `src/components/projects/SwmsDocumentPdf.tsx`
- Modify: `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`
- Modify: `src/components/projects/ProjectSwmsPanel.tsx`
- Modify: `src/lib/swms-awaiting-signature.ts`

**Interfaces:**
- Consumes: `JSA_TEMPLATES`/`JSA_HAZARD_LABELS` (existing, `lib/jsa-templates.ts`),
  `SWMS_TEMPLATES`/`HRCW_CATEGORY_LABELS` (existing, `lib/swms-templates.ts`) — neither changes.
- Produces: `SwmsRow.category?: JsaHazard`; `SwmsAuthoredContent`'s jsa branch has `categories:
  JsaHazard[]` instead of `category`; `resolveSwmsCategoryLabel(category: string | null, docType:
  'swms' | 'jsa'): string | null` — the new shared label resolver every display site uses.

- [ ] **Step 1: Modify `src/types/swms.ts`**

Find:
```typescript
export type SwmsRow = {
  jobStep: string
  hazard: string
  control: string
}

type SwmsAuthoredContentBase = {
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
}

export type SwmsAuthoredContent =
  | (SwmsAuthoredContentBase & { docType: 'swms'; category: HrcwCategory })
  | (SwmsAuthoredContentBase & {
      docType: 'jsa'
      category: JsaHazard
      whoAtRisk: string
      equipment: string
      emergencyProcedures: string
    })

export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  category: HrcwCategory | JsaHazard | null
  docType: 'swms' | 'jsa'
  source: 'uploaded' | 'authored'
  acknowledgments: SwmsAcknowledgment[]
}
```
Replace with:
```typescript
export type SwmsRow = {
  jobStep: string
  hazard: string
  control: string
  category?: JsaHazard
}

type SwmsAuthoredContentBase = {
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
}

export type SwmsAuthoredContent =
  | (SwmsAuthoredContentBase & { docType: 'swms'; category: HrcwCategory })
  | (SwmsAuthoredContentBase & {
      docType: 'jsa'
      categories: JsaHazard[]
      whoAtRisk: string
      equipment: string
      emergencyProcedures: string
    })

export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  category: string | null
  docType: 'swms' | 'jsa'
  source: 'uploaded' | 'authored'
  acknowledgments: SwmsAcknowledgment[]
}
```

(`SwmsDocument.category` widens from a single-key union to a plain `string | null` — it now
stores a comma-joined list of hazard keys for multi-category JSAs, resolved for display by the
new helper in Step 2, not looked up as a single enum key anymore.)

- [ ] **Step 2: Create `src/lib/swms-category-label.ts`**

```typescript
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { HrcwCategory, JsaHazard } from '@/types/swms'

/** `project_swms_documents.category` is a single HRCW key for SWMS, or a
 *  comma-joined list of JsaHazard keys for JSA (a JSA can cover several
 *  hazard categories). Resolves either shape to a human-readable label. */
export function resolveSwmsCategoryLabel(category: string | null, docType: 'swms' | 'jsa'): string | null {
  if (!category) return null
  if (docType === 'swms') return HRCW_CATEGORY_LABELS[category as HrcwCategory] ?? category
  return category
    .split(',')
    .map(key => JSA_HAZARD_LABELS[key as JsaHazard] ?? key)
    .join(' + ')
}
```

- [ ] **Step 3: Replace `src/components/projects/SwmsBuilderForm.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { SWMS_TEMPLATES, HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_TEMPLATES, JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { HrcwCategory, JsaHazard, SwmsRow, SwmsAuthoredContent } from '@/types/swms'
import type { CrewMemberOption } from '@/types/project-crew'

function RowEditor({ row, onUpdate, onRemove }: {
  row: SwmsRow
  onUpdate: (field: keyof SwmsRow, value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-slate-800 p-3 space-y-2">
      <input value={row.jobStep} onChange={e => onUpdate('jobStep', e.target.value)} placeholder="Job step" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
      <input value={row.hazard} onChange={e => onUpdate('hazard', e.target.value)} placeholder="Hazard" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
      <input value={row.control} onChange={e => onUpdate('control', e.target.value)} placeholder="Control measure" className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
      <button onClick={onRemove} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove row</button>
    </div>
  )
}

export default function SwmsBuilderForm({
  clientId, projectId, projectName, docType, crew, crewCertLicenceClasses, currentUserDisplayName, documentId, existingContent, projectLabel,
}: {
  clientId: string
  projectId: string
  projectName: string
  docType: 'swms' | 'jsa'
  crew: CrewMemberOption[]
  crewCertLicenceClasses: { userId: string; licenceClass: string }[]
  currentUserDisplayName: string
  documentId: string | null
  existingContent: SwmsAuthoredContent | null
  projectLabel: { singular: string; plural: string }
}) {
  const router = useRouter()
  const [category, setCategory] = useState<HrcwCategory | ''>(
    existingContent?.docType === 'swms' ? existingContent.category : ''
  )
  const [jsaCategories, setJsaCategories] = useState<JsaHazard[]>(
    existingContent?.docType === 'jsa' ? existingContent.categories : []
  )
  const [expandedCategories, setExpandedCategories] = useState<Set<JsaHazard>>(new Set())
  const [supervisor, setSupervisor] = useState(existingContent?.supervisor ?? '')
  const [date, setDate] = useState(existingContent?.date ?? new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<SwmsRow[]>(existingContent?.rows ?? [])
  const [ppe, setPpe] = useState<string[]>(existingContent?.ppe ?? [])
  const [consultedUserIds, setConsultedUserIds] = useState<string[]>(existingContent?.consultedUserIds ?? [])
  const [whoAtRisk, setWhoAtRisk] = useState(existingContent?.docType === 'jsa' ? existingContent.whoAtRisk : '')
  const [equipment, setEquipment] = useState(existingContent?.docType === 'jsa' ? existingContent.equipment : '')
  const [emergencyProcedures, setEmergencyProcedures] = useState(existingContent?.docType === 'jsa' ? existingContent.emergencyProcedures : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isJsa = docType === 'jsa'

  const swmsTemplate = useMemo(() => (!isJsa ? SWMS_TEMPLATES.find(t => t.category === category) ?? null : null), [isJsa, category])
  const hasTemplate = isJsa ? jsaCategories.length > 0 : !!swmsTemplate

  function handleCategoryChange(next: string) {
    setCategory(next as HrcwCategory)
    const t = SWMS_TEMPLATES.find(x => x.category === next)
    setRows(t ? [...t.rows] : [])
    setPpe(t ? [...t.ppe] : [])
  }

  function toggleJsaCategory(hazard: JsaHazard) {
    if (jsaCategories.includes(hazard)) {
      setJsaCategories(prev => prev.filter(c => c !== hazard))
      setRows(prev => prev.filter(r => r.category !== hazard))
      return
    }
    setJsaCategories(prev => [...prev, hazard])
    const t = JSA_TEMPLATES.find(x => x.hazard === hazard)
    if (t) {
      setRows(prev => [...prev, ...t.rows.map(r => ({ ...r, category: hazard }))])
      setPpe(prev => [...prev, ...t.ppe.filter(item => !prev.includes(item))])
    }
    setExpandedCategories(prev => new Set(prev).add(hazard))
  }

  function toggleExpanded(hazard: JsaHazard) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(hazard)) next.delete(hazard); else next.add(hazard)
      return next
    })
  }

  function updateRow(index: number, field: keyof SwmsRow, value: string) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function addRow() {
    setRows(prev => [...prev, { jobStep: '', hazard: '', control: '' }])
  }

  const heldClasses = new Set(crewCertLicenceClasses.map(c => c.licenceClass))
  const missingHrwl = !isJsa && swmsTemplate ? swmsTemplate.hrwlClasses.filter(cls => !heldClasses.has(cls)) : []

  async function handleSubmit() {
    const hasCategory = isJsa ? jsaCategories.length > 0 : !!category
    if (!hasCategory || rows.length === 0) return
    setSaving(true)
    setError(null)
    const consultedNames = crew.filter(c => consultedUserIds.includes(c.userId)).map(c => c.displayName)
    const payload = isJsa
      ? { docType, categories: jsaCategories, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId, whoAtRisk, equipment, emergencyProcedures }
      : { docType, category, supervisor, preparedBy: currentUserDisplayName, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId }
    const res = await fetch(`/api/projects/${projectId}/swms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to save')
      return
    }
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}`)
  }

  const jsaCategoryOptions = JSA_TEMPLATES.map(t => ({ value: t.hazard, label: JSA_HAZARD_LABELS[t.hazard] }))
  const swmsCategoryOptions = SWMS_TEMPLATES.map(t => ({ value: t.category, label: HRCW_CATEGORY_LABELS[t.category] }))
  const additionalRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.category)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/clients/${clientId}/projects/${projectId}`} className="text-sm font-semibold text-cyan-600 hover:underline">← Back to project</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100">{isJsa ? 'Build a JSA' : 'Build a SWMS'}</h1>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            Pick a category to pre-fill a starting template — edit every row before saving. This is a
            starting point, not a legal sign-off; review the content carefully before relying on it.
          </p>

          {isJsa ? (
            <div className="mt-5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hazard categories</label>
              <div className="space-y-1">
                {jsaCategoryOptions.map(o => (
                  <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <input type="checkbox" checked={jsaCategories.includes(o.value)} onChange={() => toggleJsaCategory(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
              {jsaCategories.length > 0 && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Removing a category deletes its rows below.</p>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">High Risk Construction Work category</label>
              <select
                value={category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">Select a category…</option>
                {swmsCategoryOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {hasTemplate && (
            <>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Supervisor</label>
                  <input value={supervisor} onChange={e => setSupervisor(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Prepared by</label>
                  <input value={currentUserDisplayName} disabled className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>

              {!isJsa && swmsTemplate?.licenceNote && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs font-medium text-gray-600 dark:text-slate-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{swmsTemplate.licenceNote}</span>
                </div>
              )}

              {!isJsa && missingHrwl.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>This category typically requires: {missingHrwl.join(', ')}. No crew member on this {projectLabel.singular.toLowerCase()} has a matching certification on file.</span>
                </div>
              )}

              {isJsa && (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Who is at risk</label>
                    <input value={whoAtRisk} onChange={e => setWhoAtRisk(e.target.value)} placeholder="e.g. Worker, other trades on site" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Plant / equipment used</label>
                    <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="e.g. Angle grinder, extension ladder" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Emergency procedures / site contact</label>
                    <input value={emergencyProcedures} onChange={e => setEmergencyProcedures(e.target.value)} placeholder="e.g. First aid kit on ute, site contact 04xx xxx xxx" className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">Job steps, hazards &amp; controls</h2>

              {isJsa ? (
                <>
                  {jsaCategories.map(hazard => {
                    const group = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.category === hazard)
                    const expanded = expandedCategories.has(hazard)
                    return (
                      <div key={hazard} className="mt-3 rounded-xl border border-gray-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(hazard)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold text-gray-900 dark:text-slate-100"
                        >
                          <span>{expanded ? '▾' : '▸'} {JSA_HAZARD_LABELS[hazard]} ({group.length} step{group.length === 1 ? '' : 's'})</span>
                        </button>
                        {expanded && (
                          <div className="space-y-3 border-t border-gray-100 p-3 dark:border-slate-800">
                            {group.map(({ r, i }) => (
                              <RowEditor key={i} row={r} onUpdate={(field, value) => updateRow(i, field, value)} onRemove={() => removeRow(i)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div className="mt-4">
                    <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Additional steps</p>
                    <div className="mt-2 space-y-3">
                      {additionalRows.map(({ r, i }) => (
                        <RowEditor key={i} row={r} onUpdate={(field, value) => updateRow(i, field, value)} onRemove={() => removeRow(i)} />
                      ))}
                      <button onClick={addRow} className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">+ Add row</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2 space-y-3">
                  {rows.map((row, i) => (
                    <RowEditor key={i} row={row} onUpdate={(field, value) => updateRow(i, field, value)} onRemove={() => removeRow(i)} />
                  ))}
                  <button onClick={addRow} className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">+ Add row</button>
                </div>
              )}

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">PPE required</h2>
              <div className="mt-2 space-y-2">
                {ppe.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={item} onChange={e => setPpe(prev => prev.map((p, idx) => (idx === i ? e.target.value : p)))} className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
                    <button onClick={() => setPpe(prev => prev.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <button onClick={() => setPpe(prev => [...prev, ''])} className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">+ Add PPE item</button>
              </div>

              <h2 className="mt-6 text-lg font-bold text-gray-900 dark:text-slate-100">Consultation</h2>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-slate-400">Who was consulted in developing this {isJsa ? 'JSA' : 'SWMS'}?</p>
              <div className="mt-2 space-y-1">
                {crew.map(member => (
                  <label key={member.userId} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={consultedUserIds.includes(member.userId)}
                      onChange={e => setConsultedUserIds(prev => e.target.checked ? [...prev, member.userId] : prev.filter(id => id !== member.userId))}
                    />
                    {member.displayName}
                  </label>
                ))}
                {crew.length === 0 && <p className="text-xs font-medium text-gray-400">No crew assigned to this {projectLabel.singular.toLowerCase()} yet.</p>}
              </div>

              {error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={saving || rows.length === 0}
                className="mt-6 w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Generating…' : isJsa ? 'Generate JSA' : 'Generate SWMS'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `src/app/api/projects/[projectId]/swms/route.ts`**

```typescript
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import SwmsDocumentPdf from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent, HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { notifySwmsAwaitingSignature } from '@/lib/swms-notifications'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

// Flat shape for the raw, untrusted request body -- deliberately not
// SwmsAuthoredContent's discriminated union. Destructuring docType into a
// local variable would decouple it from `body`, so checking the local
// variable can't narrow body's type back down to one union member; a flat
// shape with the JSA-only fields optional avoids that entirely.
type SwmsRoutePayload = {
  docType: 'swms' | 'jsa'
  category?: HrcwCategory
  categories?: JsaHazard[]
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
  consultedNames: string[]
  projectName: string
  documentId?: string
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as SwmsRoutePayload
  const { docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId, whoAtRisk, equipment, emergencyProcedures } = body

  const hasCategory = docType === 'jsa' ? !!categories && categories.length > 0 : !!category
  if (!hasCategory || !rows || rows.length === 0) {
    return NextResponse.json({ error: 'A category and at least one job step are required' }, { status: 400 })
  }

  const content: SwmsAuthoredContent = docType === 'jsa'
    ? { docType: 'jsa', categories: categories ?? [], supervisor, preparedBy, date, rows, ppe, consultedUserIds, whoAtRisk: whoAtRisk ?? '', equipment: equipment ?? '', emergencyProcedures: emergencyProcedures ?? '' }
    : { docType: 'swms', category: category as HrcwCategory, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  const categoryColumnValue = docType === 'jsa' ? (categories ?? []).join(',') : (category as string)

  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  let editableExistingPath: string | null = null
  if (documentId) {
    const [{ data: existing }, { count: ackCount }] = await Promise.all([
      supabase.from('project_swms_documents').select('id, storage_path, source').eq('id', documentId).eq('project_id', projectId).single(),
      supabase.from('project_swms_acknowledgments').select('id', { count: 'exact', head: true }).eq('swms_document_id', documentId),
    ])
    if (existing && existing.source === 'authored' && (ackCount ?? 0) === 0) {
      editableExistingPath = existing.storage_path
    }
  }

  const element = React.createElement(SwmsDocumentPdf, {
    projectName, projectLabel: terminology.project.singular, docType,
    category: docType === 'swms' ? (category as HrcwCategory) : null,
    categories: docType === 'jsa' ? (categories ?? []) : [],
    supervisor, preparedBy, date, rows, ppe, consultedNames,
    whoAtRisk: docType === 'jsa' ? whoAtRisk : undefined,
    equipment: docType === 'jsa' ? equipment : undefined,
    emergencyProcedures: docType === 'jsa' ? emergencyProcedures : undefined,
    signatures: [],
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = editableExistingPath ?? `${projectId}/${Date.now()}-${docType}-${categoryColumnValue}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf', upsert: !!editableExistingPath })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const label = docType === 'jsa' ? 'JSA' : 'SWMS'

  if (editableExistingPath) {
    const { data, error } = await supabase
      .from('project_swms_documents')
      .update({ name: `${label} — ${categoryColumnValue}`, category: categoryColumnValue, doc_type: docType, content })
      .eq('id', documentId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `${label} — ${categoryColumnValue}`,
      storage_path: path,
      uploaded_by: user.id,
      category: categoryColumnValue,
      doc_type: docType,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await notifySwmsAwaitingSignature(data.id, projectId, docType, user.id)

  return NextResponse.json(data)
}
```

(Naming note: this keeps the existing precedent of `${label} — ${rawCategoryKey}` — the current
single-category code already names documents by raw key, e.g. "SWMS — falls_2m", not a resolved
human label. Multi-category JSAs follow the same precedent: "JSA — ladder_step,hand_power_tools".)

- [ ] **Step 5: Modify `src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts`**

Find:
```typescript
  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    projectLabel: terminology.project.singular,
    docType: content.docType,
    category: content.category,
    supervisor: content.supervisor,
    preparedBy: content.preparedBy,
    date: content.date,
    rows: content.rows,
    ppe: content.ppe,
    consultedNames,
    whoAtRisk: content.docType === 'jsa' ? content.whoAtRisk : undefined,
    equipment: content.docType === 'jsa' ? content.equipment : undefined,
    emergencyProcedures: content.docType === 'jsa' ? content.emergencyProcedures : undefined,
    signatures,
  }) as unknown as React.ReactElement<DocumentProps>
```
Replace with:
```typescript
  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    projectLabel: terminology.project.singular,
    docType: content.docType,
    category: content.docType === 'swms' ? content.category : null,
    categories: content.docType === 'jsa' ? content.categories : [],
    supervisor: content.supervisor,
    preparedBy: content.preparedBy,
    date: content.date,
    rows: content.rows,
    ppe: content.ppe,
    consultedNames,
    whoAtRisk: content.docType === 'jsa' ? content.whoAtRisk : undefined,
    equipment: content.docType === 'jsa' ? content.equipment : undefined,
    emergencyProcedures: content.docType === 'jsa' ? content.emergencyProcedures : undefined,
    signatures,
  }) as unknown as React.ReactElement<DocumentProps>
```

- [ ] **Step 6: Replace `src/components/projects/SwmsDocumentPdf.tsx`**

```tsx
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import type { HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'

export type SwmsPdfSignature = {
  name: string
  acknowledgedAt: string
  signatureDataUri: string | null
}

type Props = {
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
  signatures: SwmsPdfSignature[]
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a' },
  header: { backgroundColor: '#0f172a', padding: 20, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  subtitle: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 16, flexWrap: 'wrap' },
  metaBlock: { minWidth: 140 },
  label: { fontSize: 7, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 10, color: '#0f172a' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginTop: 16, marginBottom: 6 },
  groupTitle: { fontSize: 9, fontWeight: 'bold', color: '#334155', marginTop: 10, marginBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 4 },
  colStep: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colHazard: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colControl: { flex: 3, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 5 },
  cellStep: { flex: 2, fontSize: 8 },
  cellHazard: { flex: 2, fontSize: 8 },
  cellControl: { flex: 3, fontSize: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, fontSize: 8 },
  consultedList: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 8 },
  signatureImage: { width: 90, height: 32, objectFit: 'contain' },
  signaturePlaceholder: { width: 90, height: 32, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  signatureName: { fontSize: 9, fontWeight: 'bold', color: '#0f172a', minWidth: 120 },
  signatureTimestamp: { fontSize: 8, color: '#64748b' },
})

function RowsTable({ rows }: { rows: SwmsRow[] }) {
  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={styles.colStep}>Job Step</Text>
        <Text style={styles.colHazard}>Hazard</Text>
        <Text style={styles.colControl}>Control Measure</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.cellStep}>{row.jobStep}</Text>
          <Text style={styles.cellHazard}>{row.hazard}</Text>
          <Text style={styles.cellControl}>{row.control}</Text>
        </View>
      ))}
    </>
  )
}

export default function SwmsDocumentPdf({
  projectName, projectLabel, docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedNames,
  whoAtRisk, equipment, emergencyProcedures, signatures,
}: Props) {
  const title = docType === 'jsa' ? 'Job Safety Analysis' : 'Safe Work Method Statement'
  const categoryLabel = docType === 'jsa'
    ? categories.map(c => JSA_HAZARD_LABELS[c]).join(' + ')
    : (category ? HRCW_CATEGORY_LABELS[category] : '')
  const additionalRows = rows.filter(r => !r.category)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{categoryLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>{projectLabel}</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Supervisor</Text>
            <Text style={styles.value}>{supervisor}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Prepared By</Text>
            <Text style={styles.value}>{preparedBy}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
        </View>

        {docType === 'jsa' && (whoAtRisk || equipment || emergencyProcedures) && (
          <View style={styles.metaRow}>
            {whoAtRisk && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Who Is At Risk</Text>
                <Text style={styles.value}>{whoAtRisk}</Text>
              </View>
            )}
            {equipment && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Plant / Equipment</Text>
                <Text style={styles.value}>{equipment}</Text>
              </View>
            )}
            {emergencyProcedures && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Emergency Procedures</Text>
                <Text style={styles.value}>{emergencyProcedures}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Job Steps, Hazards &amp; Controls</Text>
        {docType === 'jsa' && categories.length > 0 ? (
          <>
            {categories.map(cat => {
              const group = rows.filter(r => r.category === cat)
              if (group.length === 0) return null
              return (
                <View key={cat}>
                  <Text style={styles.groupTitle}>{JSA_HAZARD_LABELS[cat]}</Text>
                  <RowsTable rows={group} />
                </View>
              )
            })}
            {additionalRows.length > 0 && (
              <View>
                <Text style={styles.groupTitle}>Additional Steps</Text>
                <RowsTable rows={additionalRows} />
              </View>
            )}
          </>
        ) : (
          <RowsTable rows={rows} />
        )}

        <Text style={styles.sectionTitle}>PPE Required</Text>
        <View style={styles.chipRow}>
          {ppe.map((item, i) => (
            <Text key={i} style={styles.chip}>{item}</Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Consultation</Text>
        <Text style={styles.consultedList}>
          {consultedNames.length > 0 ? `Consulted in developing this ${docType === 'jsa' ? 'JSA' : 'SWMS'}: ${consultedNames.join(', ')}` : 'No crew members recorded as consulted.'}
        </Text>

        <Text style={styles.sectionTitle}>Acknowledgments</Text>
        {signatures.length === 0 && (
          <Text style={styles.consultedList}>No crew members have acknowledged this document yet.</Text>
        )}
        {signatures.map((sig, i) => (
          <View key={i} style={styles.signatureRow}>
            <Text style={styles.signatureName}>{sig.name}</Text>
            {sig.signatureDataUri ? (
              <Image src={sig.signatureDataUri} style={styles.signatureImage} />
            ) : (
              <View style={styles.signaturePlaceholder} />
            )}
            <Text style={styles.signatureTimestamp}>{sig.acknowledgedAt}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 7: Modify `src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx`**

Find:
```typescript
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsAuthoredContent } from '@/types/swms'
```
Replace with:
```typescript
import type { CrewMemberOption } from '@/types/project-crew'
import type { SwmsAuthoredContent, SwmsRow } from '@/types/swms'
```

Find:
```typescript
  let existingContent: SwmsAuthoredContent | null = null
  if (documentId) {
    const { data: doc } = await supabase.from('project_swms_documents').select('content').eq('id', documentId).eq('project_id', projectId).single()
    existingContent = (doc?.content as SwmsAuthoredContent | null) ?? null
  }
```
Replace with:
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

- [ ] **Step 8: Modify `src/components/projects/ProjectSwmsPanel.tsx`**

Find:
```typescript
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { SwmsDocument } from '@/types/swms'
```
Replace with:
```typescript
import { resolveSwmsCategoryLabel } from '@/lib/swms-category-label'
import type { SwmsDocument } from '@/types/swms'
```

Find:
```tsx
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.docType === 'jsa' ? JSA_HAZARD_LABELS[doc.category as keyof typeof JSA_HAZARD_LABELS] : HRCW_CATEGORY_LABELS[doc.category as keyof typeof HRCW_CATEGORY_LABELS]}
                      </p>
                    )}
```
Replace with:
```tsx
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">
                        {resolveSwmsCategoryLabel(doc.category, doc.docType)}
                      </p>
                    )}
```

- [ ] **Step 9: Modify `src/lib/swms-awaiting-signature.ts`**

Find:
```typescript
import { createClient } from '@/lib/supabase-server'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import { getTodaySydneyDateString } from '@/lib/today'
import type { UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'
```
Replace with:
```typescript
import { createClient } from '@/lib/supabase-server'
import { resolveSwmsCategoryLabel } from '@/lib/swms-category-label'
import { getTodaySydneyDateString } from '@/lib/today'
import type { UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'
```

Find:
```typescript
  return activeDocs
    .filter(d => !ackedIds.has(d.id))
    .map(d => {
      const categoryLabel = d.doc_type === 'jsa'
        ? JSA_HAZARD_LABELS[d.category as keyof typeof JSA_HAZARD_LABELS]
        : HRCW_CATEGORY_LABELS[d.category as keyof typeof HRCW_CATEGORY_LABELS]
      return {
```
Replace with:
```typescript
  return activeDocs
    .filter(d => !ackedIds.has(d.id))
    .map(d => {
      const categoryLabel = resolveSwmsCategoryLabel(d.category, d.doc_type) ?? ''
      return {
```

- [ ] **Step 10: Run the build**

```bash
pnpm run build
```
Expected: passes clean.

- [ ] **Step 11: Commit**

```bash
git add src/types/swms.ts src/lib/swms-category-label.ts src/components/projects/SwmsBuilderForm.tsx "src/app/api/projects/[projectId]/swms/route.ts" "src/app/api/projects/[projectId]/swms/[documentId]/pdf/route.ts" src/components/projects/SwmsDocumentPdf.tsx "src/app/dashboard/clients/[id]/projects/[projectId]/swms/new/page.tsx" src/components/projects/ProjectSwmsPanel.tsx src/lib/swms-awaiting-signature.ts
git commit -m "feat: multi-category JSA — combine several hazard categories into one document"
```

- [ ] **Step 12: Manual smoke (deferred to the user)**

As a manager on a construction/trades-profile org: build a new JSA, check two categories (e.g.
Ladder/step + Hand & power tool use), confirm both templates' rows and PPE appear, grouped under
separate collapsible headers, with no duplicate PPE chips. Uncheck one category and confirm only
its rows disappear (PPE stays). Click "+ Add row" and confirm the new blank row lands in
"Additional steps," unaffected by further category toggling. Generate the PDF and confirm it
shows the same grouping. Open an existing (pre-this-change) single-category JSA for editing and
confirm it loads with its one category pre-checked and all its rows already grouped under it.

---

## Acceptance checklist
- [ ] SWMS documents are completely unaffected — same dropdown, same single-category behavior.
- [ ] Checking multiple JSA categories merges rows (grouped, collapsible) and PPE (flat,
  deduplicated) without destroying earlier selections.
- [ ] Unchecking a category removes its rows; PPE and manually-added rows are unaffected.
- [ ] The generated PDF groups rows by category the same way the screen does.
- [ ] Editing a pre-existing single-category JSA loads correctly with rows retroactively tagged.
- [ ] Full `pnpm run build` passes clean.
- [ ] Manual smoke per Step 12 — user follow-up, not the conductor's to complete.
