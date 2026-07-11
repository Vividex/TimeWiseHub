import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VehiclesView, { type OrgMemberOption } from '@/components/vehicles/VehiclesView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import type { Vehicle } from '@/types/vehicles'

export default async function VehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membership }, subscription] = await Promise.all([
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    getSubscription(user.id),
  ])

  const orgId = membership?.org_id ?? null
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const canSeeVehicles = Boolean(orgId && isTeamPlan(subscription))

  if (!canSeeVehicles || !orgId) redirect('/dashboard')

  const [{ data: vehicles }, { data: members }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_archived', false)
      .order('registration_number'),
    supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId),
  ])

  const vehicleList = (vehicles ?? []) as Vehicle[]
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
        <VehiclesView vehicles={vehicleList} orgId={orgId} members={memberOptions} canManage={isManager} />
      </div>
    </div>
  )
}
