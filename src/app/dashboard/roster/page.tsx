import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import RosterGrid from '@/components/roster/RosterGrid'

export default async function RosterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()

  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const isManager = ['owner','admin','manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)

  if (!orgId) return (
    <div className="px-4 py-8 sm:px-8">
      <p className="text-sm text-gray-500">You need to be part of an organisation to use Roster.</p>
    </div>
  )

  const { data: members } = await supabase
    .from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)

  const memberList = (members ?? []).map(m => ({
    user_id: m.user_id,
    display_name:
      (m.profiles as unknown as { full_name: string | null; email: string } | null)?.full_name
      ?? (m.profiles as unknown as { full_name: string | null; email: string } | null)?.email
      ?? m.user_id,
  }))

  const today = new Date()
  const from = new Date(today); from.setDate(today.getDate() - 14)
  const to = new Date(today); to.setDate(today.getDate() + 28)

  const { data: shifts } = await supabase
    .from('roster_shifts').select('id, org_id, user_id, date, start_time, end_time, notes, published')
    .eq('org_id', orgId).is('deleted_at', null)
    .gte('date', from.toISOString().split('T')[0]).lte('date', to.toISOString().split('T')[0])

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Roster</h1>
        <RosterGrid orgId={orgId} members={memberList} initialShifts={shifts ?? []} isManager={isManager} />
      </div>
    </div>
  )
}
