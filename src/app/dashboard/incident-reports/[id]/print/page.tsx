import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { TYPE_LABEL, SEVERITY_LABEL } from '@/lib/incident-reports'
import type { IncidentReport } from '@/types/incident-reports'

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function IncidentReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: report } = await supabase.from('incident_reports').select('*').eq('id', id).maybeSingle()
  if (!report) notFound()

  const currentReport = report as IncidentReport

  const memberIds = [currentReport.employee_id, currentReport.filed_by, currentReport.reviewed_by, ...currentReport.witness_ids].filter((v): v is string => !!v)
  const { data: members } = await supabase
    .from('organisation_members')
    .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
    .eq('org_id', currentReport.org_id)
    .in('user_id', memberIds)

  const nameById = new Map(((members ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[])
    .map(m => [m.user_id, m.profiles?.full_name || m.profiles?.email || 'Unnamed member']))

  const name = (id: string | null) => (id ? nameById.get(id) ?? 'Unknown' : '—')

  return (
    <>
      <style>{`
          .incident-print-page, .incident-print-page * { box-sizing: border-box; }
          .invoice-print-shell > .fixed { display: none !important; }
          .incident-print-page { max-width: 780px; margin: 0 auto; padding: 48px; font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; color: #111827; background: #fff; }
          .incident-print-page .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px; }
          .incident-print-page .logo { font-size: 22px; font-weight: 900; color: #0f172a; }
          .incident-print-page .title h1 { font-size: 26px; font-weight: 900; color: #0f172a; margin: 0; text-align: right; }
          .incident-print-page .status { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #f3f4f6; color: #4b5563; }
          .incident-print-page .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 32px; }
          .incident-print-page .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px; }
          .incident-print-page .meta-value { font-weight: 600; color: #111827; }
          .incident-print-page .section { margin-bottom: 24px; }
          .incident-print-page .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 6px; }
          .incident-print-page .section-body { color: #374151; line-height: 1.6; white-space: pre-wrap; }
          .incident-print-page .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `}</style>
      <div className="incident-print-page">
        <div className="header">
          <div className="logo">TimeWiseHub</div>
          <div className="title">
            <h1>Incident Report</h1>
            <div className="status">{currentReport.status}</div>
          </div>
        </div>

        <div className="meta">
          <div>
            <div className="meta-label">Type</div>
            <div className="meta-value">{TYPE_LABEL[currentReport.type]}</div>
          </div>
          <div>
            <div className="meta-label">Severity</div>
            <div className="meta-value">{SEVERITY_LABEL[currentReport.severity]}</div>
          </div>
          <div>
            <div className="meta-label">Date &amp; time</div>
            <div className="meta-value">{fmtDateTime(currentReport.occurred_at)}</div>
          </div>
          <div>
            <div className="meta-label">Location</div>
            <div className="meta-value">{currentReport.location ?? '—'}</div>
          </div>
          <div>
            <div className="meta-label">Employee involved</div>
            <div className="meta-value">{name(currentReport.employee_id)}</div>
          </div>
          <div>
            <div className="meta-label">Filed by</div>
            <div className="meta-value">{name(currentReport.filed_by)}</div>
          </div>
        </div>

        <div className="section">
          <div className="section-label">What happened</div>
          <div className="section-body">{currentReport.description}</div>
        </div>

        {currentReport.witness_ids.length > 0 && (
          <div className="section">
            <div className="section-label">Witnesses</div>
            <div className="section-body">{currentReport.witness_ids.map(id => name(id)).join(', ')}</div>
          </div>
        )}

        {currentReport.type === 'injury' && (
          <div className="section">
            <div className="section-label">Injury details</div>
            <div className="section-body">
              Body part: {currentReport.body_part ?? '—'}{'\n'}
              First aid given: {currentReport.first_aid_given ? 'Yes' : 'No'}{'\n'}
              Medical treatment required: {currentReport.medical_treatment_required ? 'Yes' : 'No'}{'\n'}
              Resulted in time off work: {currentReport.time_off_work ? 'Yes' : 'No'}
            </div>
          </div>
        )}

        {currentReport.root_cause && (
          <div className="section">
            <div className="section-label">Root cause</div>
            <div className="section-body">{currentReport.root_cause}</div>
          </div>
        )}

        {currentReport.corrective_action && (
          <div className="section">
            <div className="section-label">Corrective action</div>
            <div className="section-body">{currentReport.corrective_action}</div>
          </div>
        )}

        {currentReport.status === 'closed' && (
          <div className="section">
            <div className="section-label">Review</div>
            <div className="section-body">
              Reviewed by: {name(currentReport.reviewed_by)}{'\n'}
              Reviewed at: {fmtDateTime(currentReport.reviewed_at)}{'\n'}
              {currentReport.resolution_notes ? `Resolution notes: ${currentReport.resolution_notes}` : ''}
            </div>
          </div>
        )}

        <div className="footer">Generated by TimeWiseHub · timewisehub.vercel.app</div>
      </div>
    </>
  )
}
