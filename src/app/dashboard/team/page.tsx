import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import TeamGrid, { type TeamMember } from '@/components/team/TeamGrid'
import type { ExpiringCert } from '@/components/team/CertExpiryPanel'
import InviteMember from '@/components/InviteMember'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()

  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const canManageTeam = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)

  if (!orgId) return (
    <div className="px-4 py-8 sm:px-8">
      <p className="text-sm text-gray-500">You need to be part of an organisation to view the team.</p>
    </div>
  )

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysOut = new Date(); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  const thirtyDaysOutISO = thirtyDaysOut.toISOString().split('T')[0]

  const [{ data: membersData }, { data: profilesData }, { data: certsData }, { data: progressData }, { data: checklistData }] = await Promise.all([
    supabase.from('organisation_members').select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId),
    supabase.from('employee_profiles').select('user_id, job_title').eq('org_id', orgId),
    supabase.from('certifications').select('user_id, name, expiry_date').eq('org_id', orgId),
    supabase.from('onboarding_progress').select('user_id, item_label, completed_at').eq('org_id', orgId),
    supabase.from('onboarding_checklists').select('items').eq('org_id', orgId).maybeSingle(),
  ])

  const requiredItems = ((checklistData?.items ?? []) as { label: string; required: boolean }[]).filter(i => i.required).map(i => i.label)

  type ProfileRow = { full_name: string | null; email: string } | null

  const members: TeamMember[] = (membersData ?? []).map(m => {
    const profile = (profilesData ?? []).find(p => p.user_id === m.user_id)
    const memberCerts = (certsData ?? []).filter(c => c.user_id === m.user_id)
    const memberProgress = (progressData ?? []).filter(p => p.user_id === m.user_id)
    const p = m.profiles as unknown as ProfileRow
    return {
      user_id: m.user_id,
      role: m.role as string,
      display_name: p?.full_name || p?.email || m.user_id,
      job_title: profile?.job_title ?? null,
      has_expired_cert: memberCerts.some(c => c.expiry_date && c.expiry_date < today),
      has_expiring_cert: memberCerts.some(c => c.expiry_date && c.expiry_date >= today && c.expiry_date <= thirtyDaysOutISO),
      has_incomplete_onboarding: requiredItems.some(label => !memberProgress.find(p => p.item_label === label && p.completed_at)),
    }
  })

  const expiring: ExpiringCert[] = (certsData ?? [])
    .filter(c => c.expiry_date && c.expiry_date >= today && c.expiry_date <= thirtyDaysOutISO)
    .map(c => {
      const m = (membersData ?? []).find(x => x.user_id === c.user_id)
      const p = m?.profiles as unknown as ProfileRow
      return {
        user_name: p?.full_name || p?.email || c.user_id,
        cert_name: c.name,
        expiry_date: c.expiry_date!,
        days_until: Math.ceil((new Date(c.expiry_date!).getTime() - Date.now()) / 86400000),
      }
    }).sort((a, b) => a.days_until - b.days_until)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Team</h1>
        {canManageTeam && (
          <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <InviteMember orgId={orgId} canInvite={true} />
          </div>
        )}
        <TeamGrid orgId={orgId} canManageTeam={canManageTeam} canChangeRole={membership?.role === 'owner'} viewerUserId={user.id} members={members} expiring={expiring} />
      </div>
    </div>
  )
}
