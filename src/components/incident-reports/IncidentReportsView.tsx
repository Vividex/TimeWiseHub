'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'
import { TYPE_LABEL, SEVERITY_LABEL, SEVERITY_COLOUR, STATUS_LABEL, STATUS_COLOUR } from '@/lib/incident-reports'
import type { IncidentReport, IncidentType, IncidentSeverity } from '@/types/incident-reports'
import ClientSitePicker, { type ClientOption } from './ClientSitePicker'

export type OrgMemberOption = { user_id: string; name: string }

const TYPES: IncidentType[] = ['injury', 'near_miss', 'hazard']
const SEVERITIES: IncidentSeverity[] = ['minor', 'moderate', 'serious', 'critical']

function displayDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function IncidentReportsView({
  reports,
  orgId,
  members,
  clients,
  canManage,
}: {
  reports: IncidentReport[]
  orgId: string
  members: OrgMemberOption[]
  clients: ClientOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const { query, setQuery, filtered } = useTextFilter(reports, r => r.description)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<IncidentType>('injury')
  const [severity, setSeverity] = useState<IncidentSeverity>('minor')
  const [occurredAt, setOccurredAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [witnessIds, setWitnessIds] = useState<string[]>([])
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')

  function resetForm() {
    setType('injury'); setSeverity('minor'); setOccurredAt(''); setLocation('')
    setDescription(''); setEmployeeId(''); setWitnessIds([]); setClientId(''); setSiteId(''); setError(null)
  }

  function toggleWitness(userId: string) {
    setWitnessIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await createClient().auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }

    const supabase = createClient()
    const { error: insertError } = await supabase.from('incident_reports').insert({
      org_id: orgId,
      type,
      severity,
      occurred_at: new Date(occurredAt).toISOString(),
      location: location.trim() || null,
      client_id: clientId || null,
      site_id: siteId || null,
      description: description.trim(),
      employee_id: employeeId || null,
      witness_ids: witnessIds,
      filed_by: user.id,
    })

    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    resetForm()
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-slate-100">Incident Reports</h1>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">Record injuries, near misses, and hazards for permanent review.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { setOpen(v => !v); setError(null) }}
            className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-cyan-600"
          >
            + New report
          </button>
        )}
      </div>

      {open && canManage && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Type</span>
              <select value={type} onChange={e => setType(e.target.value as IncidentType)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Severity</span>
              <select value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date and time</span>
              <input type="datetime-local" required value={occurredAt} onChange={e => setOccurredAt(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <ClientSitePicker clients={clients} clientId={clientId} siteId={siteId} onClientChange={setClientId} onSiteChange={setSiteId} />
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Employee involved</span>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                <option value="">No specific employee</option>
                {members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
              </select>
            </label>
            <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Witnesses</legend>
              <div className="max-h-36 space-y-2 overflow-auto pr-1">
                {members.map(member => (
                  <label key={member.user_id} className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={witnessIds.includes(member.user_id)} onChange={() => toggleWitness(member.user_id)} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                    <span className="truncate">{member.name}</span>
                  </label>
                ))}
                {members.length === 0 && <p className="text-sm text-gray-500 dark:text-slate-400">No team members found.</p>}
              </div>
            </fieldset>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Description</span>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => { resetForm(); setOpen(false) }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : 'File report'}</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-gray-100 p-4 dark:border-slate-800">
          <SearchInput value={query} onChange={setQuery} placeholder="Search incident descriptions..." />
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <ShieldAlert className="mb-4 h-10 w-10 text-gray-300 dark:text-slate-600" />
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100">No incident reports found</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Filed reports will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filtered.map(report => (
              <Link key={report.id} href={`/dashboard/incident-reports/${report.id}`} className="block p-4 transition-colors hover:bg-cyan-50/60 dark:hover:bg-cyan-500/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700 dark:bg-slate-800 dark:text-slate-200">{TYPE_LABEL[report.type]}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY_COLOUR[report.severity]}`}>{SEVERITY_LABEL[report.severity]}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[report.status]}`}>{STATUS_LABEL[report.status]}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-slate-100">{report.description}</p>
                    {report.location && <p className="mt-1 text-xs font-medium text-gray-500 dark:text-slate-400">{report.location}</p>}
                  </div>
                  <p className="shrink-0 text-sm font-bold text-gray-500 dark:text-slate-400">{displayDateTime(report.occurred_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
