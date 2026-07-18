'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { SEVERITY_COLOUR, SEVERITY_LABEL, STATUS_COLOUR, STATUS_LABEL, TYPE_LABEL } from '@/lib/incident-reports'
import type { IncidentReport, IncidentReportPhoto, IncidentSeverity, IncidentType } from '@/types/incident-reports'
import ClientSitePicker, { type ClientOption } from './ClientSitePicker'

export type OrgMemberOption = { user_id: string; name: string }
export type IncidentPhotoWithUrl = IncidentReportPhoto & { signedUrl: string | null }

const TYPES: IncidentType[] = ['injury', 'near_miss', 'hazard']
const SEVERITIES: IncidentSeverity[] = ['minor', 'moderate', 'serious', 'critical']

function displayDateTime(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toDateTimeLocal(iso: string) {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function safeStorageName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export default function IncidentReportDetailClient({
  report,
  photos,
  members,
  clients,
  clientName,
  siteAddress,
  canManage,
  userId,
}: {
  report: IncidentReport
  photos: IncidentPhotoWithUrl[]
  members: OrgMemberOption[]
  clients: ClientOption[]
  clientName: string | null
  siteAddress: string | null
  canManage: boolean
  userId: string
}) {
  const router = useRouter()
  const canEdit = canManage && report.status === 'open'

  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [type, setType] = useState<IncidentType>(report.type)
  const [severity, setSeverity] = useState<IncidentSeverity>(report.severity)
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(report.occurred_at))
  const [location, setLocation] = useState(report.location ?? '')
  const [description, setDescription] = useState(report.description)
  const [employeeId, setEmployeeId] = useState(report.employee_id ?? '')
  const [clientId, setClientId] = useState(report.client_id ?? '')
  const [siteId, setSiteId] = useState(report.site_id ?? '')
  const [witnessIds, setWitnessIds] = useState<string[]>(report.witness_ids)
  const [bodyPart, setBodyPart] = useState(report.body_part ?? '')
  const [firstAidGiven, setFirstAidGiven] = useState(Boolean(report.first_aid_given))
  const [medicalTreatmentRequired, setMedicalTreatmentRequired] = useState(Boolean(report.medical_treatment_required))
  const [timeOffWork, setTimeOffWork] = useState(Boolean(report.time_off_work))
  const [rootCause, setRootCause] = useState(report.root_cause ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(report.corrective_action ?? '')
  const [resolutionNotes, setResolutionNotes] = useState(report.resolution_notes ?? '')

  const memberNameById = useMemo(() => new Map(members.map(member => [member.user_id, member.name])), [members])
  const memberName = (id: string | null) => (id ? memberNameById.get(id) ?? 'Unknown member' : '-')

  function toggleWitness(memberId: string) {
    setWitnessIds(prev => prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId])
  }

  async function saveReport(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return

    setSaving(true)
    setError(null)

    const { error: updateError } = await createClient()
      .from('incident_reports')
      .update({
        type,
        severity,
        occurred_at: new Date(occurredAt).toISOString(),
        location: location.trim() || null,
        client_id: clientId || null,
        site_id: siteId || null,
        description: description.trim(),
        employee_id: employeeId || null,
        witness_ids: witnessIds,
        body_part: type === 'injury' ? bodyPart.trim() || null : null,
        first_aid_given: type === 'injury' ? firstAidGiven : null,
        medical_treatment_required: type === 'injury' ? medicalTreatmentRequired : null,
        time_off_work: type === 'injury' ? timeOffWork : null,
        root_cause: rootCause.trim() || null,
        corrective_action: correctiveAction.trim() || null,
      })
      .eq('id', report.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    router.refresh()
  }

  async function closeReport(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return

    setClosing(true)
    setCloseError(null)

    const { error: updateError } = await createClient()
      .from('incident_reports')
      .update({
        status: 'closed',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        resolution_notes: resolutionNotes.trim() || null,
      })
      .eq('id', report.id)

    setClosing(false)
    if (updateError) {
      setCloseError(updateError.message)
      return
    }

    router.refresh()
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !canEdit) return

    setUploading(true)
    setUploadError(null)

    const supabase = createClient()
    const path = `${report.id}/${Date.now()}-${safeStorageName(file.name)}`
    const { error: uploadProblem } = await supabase.storage
      .from('incident-photos')
      .upload(path, file)

    if (uploadProblem) {
      setUploading(false)
      setUploadError(uploadProblem.message)
      return
    }

    const { error: insertProblem } = await supabase
      .from('incident_report_photos')
      .insert({
        incident_report_id: report.id,
        storage_path: path,
        uploaded_by: userId,
      })

    setUploading(false)
    if (insertProblem) {
      setUploadError(insertProblem.message)
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/dashboard/incident-reports" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
            <ArrowLeft size={16} />
            Incident reports
          </Link>
          <h1 className="mt-3 text-3xl font-black text-gray-900 dark:text-slate-100">{TYPE_LABEL[report.type]} report</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[report.status]}`}>{STATUS_LABEL[report.status]}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY_COLOUR[report.severity]}`}>{SEVERITY_LABEL[report.severity]}</span>
            <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">{displayDateTime(report.occurred_at)}</span>
          </div>
        </div>
        <Link
          href={`/dashboard/incident-reports/${report.id}/print`}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600"
        >
          <Printer size={16} />
          Print
        </Link>
      </div>

      {canEdit ? (
        <form onSubmit={saveReport} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Type</span>
              <select value={type} onChange={e => setType(e.target.value as IncidentType)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {TYPES.map(option => <option key={option} value={option}>{TYPE_LABEL[option]}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Severity</span>
              <select value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {SEVERITIES.map(option => <option key={option} value={option}>{SEVERITY_LABEL[option]}</option>)}
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
            <ClientSitePicker
              clients={clients}
              clientId={clientId}
              siteId={siteId}
              onClientChange={setClientId}
              onSiteChange={setSiteId}
              onSiteAddressChange={address => { if (!location.trim()) setLocation(address) }}
            />
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
              </div>
            </fieldset>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Description</span>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>

            {type === 'injury' && (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Body part injured</span>
                  <input value={bodyPart} onChange={e => setBodyPart(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                </label>
                <div className="grid gap-2 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={firstAidGiven} onChange={e => setFirstAidGiven(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                    First aid given
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={medicalTreatmentRequired} onChange={e => setMedicalTreatmentRequired(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                    Medical treatment required
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={timeOffWork} onChange={e => setTimeOffWork(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                    Resulted in time off work
                  </label>
                </div>
              </>
            )}

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Root cause</span>
              <textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Corrective action</span>
              <textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      ) : (
        <ReadOnlyReport report={report} memberName={memberName} clientName={clientName} siteAddress={siteAddress} />
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">Photos</h2>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Attached evidence and site images.</p>
          </div>
          {canEdit && (
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600">
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload photo'}
              <input type="file" accept="image/*" disabled={uploading} onChange={uploadPhoto} className="sr-only" />
            </label>
          )}
        </div>
        {uploadError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{uploadError}</p>}
        {photos.length === 0 ? (
          <p className="mt-5 rounded-xl bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-500 dark:bg-slate-800 dark:text-slate-400">No photos attached.</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map(photo => (
              <div key={photo.id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.signedUrl} alt="Incident report attachment" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center px-3 text-center text-sm font-semibold text-gray-500 dark:text-slate-400">Photo unavailable</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <form onSubmit={closeReport} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">Close report</h2>
          <p className="mt-1 text-sm font-medium text-gray-600 dark:text-slate-300">Closing locks this report from further edits.</p>
          <label className="mt-4 block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Resolution notes</span>
            <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold dark:border-amber-500/30 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          {closeError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{closeError}</p>}
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={closing} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">{closing ? 'Closing...' : 'Close report'}</button>
          </div>
        </form>
      )}

      {report.status === 'closed' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">Review</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Reviewed by</dt>
              <dd className="mt-1 font-semibold text-gray-900 dark:text-slate-100">{memberName(report.reviewed_by)}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
              <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Reviewed at</dt>
              <dd className="mt-1 font-semibold text-gray-900 dark:text-slate-100">{displayDateTime(report.reviewed_at)}</dd>
            </div>
            {report.resolution_notes && (
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Resolution notes</dt>
                <dd className="mt-1 whitespace-pre-wrap font-semibold text-gray-900 dark:text-slate-100">{report.resolution_notes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

function ReadOnlyReport({
  report,
  memberName,
  clientName,
  siteAddress,
}: {
  report: IncidentReport
  memberName: (id: string | null) => string
  clientName: string | null
  siteAddress: string | null
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <ReadOnlyItem label="Type" value={TYPE_LABEL[report.type]} />
        <ReadOnlyItem label="Severity" value={SEVERITY_LABEL[report.severity]} />
        <ReadOnlyItem label="Date and time" value={displayDateTime(report.occurred_at)} />
        <ReadOnlyItem label="Location" value={report.location ?? '-'} />
        <ReadOnlyItem label="Client / site" value={clientName ? (siteAddress ? `${clientName} — ${siteAddress}` : clientName) : '-'} />
        <ReadOnlyItem label="Employee involved" value={memberName(report.employee_id)} />
        <ReadOnlyItem label="Witnesses" value={report.witness_ids.length ? report.witness_ids.map(memberName).join(', ') : '-'} />
        <ReadOnlyItem label="Description" value={report.description} wide />
        {report.type === 'injury' && (
          <>
            <ReadOnlyItem label="Body part injured" value={report.body_part ?? '-'} />
            <ReadOnlyItem label="First aid given" value={report.first_aid_given ? 'Yes' : 'No'} />
            <ReadOnlyItem label="Medical treatment required" value={report.medical_treatment_required ? 'Yes' : 'No'} />
            <ReadOnlyItem label="Resulted in time off work" value={report.time_off_work ? 'Yes' : 'No'} />
          </>
        )}
        <ReadOnlyItem label="Root cause" value={report.root_cause ?? '-'} wide />
        <ReadOnlyItem label="Corrective action" value={report.corrective_action ?? '-'} wide />
      </dl>
    </div>
  )
}

function ReadOnlyItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-gray-50 p-3 dark:bg-slate-800 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap font-semibold text-gray-900 dark:text-slate-100">{value}</dd>
    </div>
  )
}
