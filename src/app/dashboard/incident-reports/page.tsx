import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import IncidentReportsView, { type OrgMemberOption } from '@/components/incident-reports/IncidentReportsView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { IncidentReport } from '@/types/incident-reports'

export default async function IncidentReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membership }, subscription] = await Promise.all([
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const orgId = membership?.org_id ?? null
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const canSeeIncidentReports = Boolean(orgId && isTeamPlan(subscription))

  if (!canSeeIncidentReports || !orgId) redirect('/dashboard')

  const [{ data: reports }, { data: members }] = await Promise.all([
    supabase
      .from('incident_reports')
      .select('*')
      .eq('org_id', orgId)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId),
  ])

  const reportList = (reports ?? []) as IncidentReport[]
  const memberOptions: OrgMemberOption[] = ((members ?? []) as unknown as {
    user_id: string
    profiles: { full_name: string | null; email: string | null } | null
  }[]).map(member => ({
    user_id: member.user_id,
    name: member.profiles?.full_name || member.profiles?.email || 'Unnamed member',
  }))

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 min-h-full">
      <div className="mx-auto max-w-5xl">
        <IncidentReportsView reports={reportList} orgId={orgId} members={memberOptions} canManage={isManager} />
      </div>
    </div>
  )
}
