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
