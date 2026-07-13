import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import IncidentReportDetailClient, { type IncidentPhotoWithUrl, type OrgMemberOption } from '@/components/incident-reports/IncidentReportDetailClient'
import type { IncidentReport, IncidentReportPhoto } from '@/types/incident-reports'

export default async function IncidentReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: report } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!report) notFound()

  const currentReport = report as IncidentReport

  const [{ data: membership }, { data: members }, { data: photos }] = await Promise.all([
    supabase
      .from('organisation_members')
      .select('role')
      .eq('org_id', currentReport.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', currentReport.org_id),
    supabase
      .from('incident_report_photos')
      .select('*')
      .eq('incident_report_id', currentReport.id)
      .order('created_at', { ascending: true }),
  ])

  const photoRows = (photos ?? []) as IncidentReportPhoto[]
  const signedPhotos: IncidentPhotoWithUrl[] = await Promise.all(
    photoRows.map(async photo => {
      const { data } = await supabase.storage
        .from('incident-photos')
        .createSignedUrl(photo.storage_path, 60 * 60)

      return {
        ...photo,
        signedUrl: data?.signedUrl ?? null,
      }
    })
  )

  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  const canManage = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  return (
    <div className="min-h-full px-4 py-8 dark:bg-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <IncidentReportDetailClient
          report={currentReport}
          photos={signedPhotos}
          members={memberOptions}
          canManage={canManage}
          userId={user.id}
        />
      </div>
    </div>
  )
}
