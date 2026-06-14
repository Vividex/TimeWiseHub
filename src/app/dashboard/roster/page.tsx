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
  const canManageRoster = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)

  if (!orgId) return (
    <div className="px-4 py-8 sm:px-8">
      <p className="text-sm text-gray-500">You need to be part of an organisation to use Roster.</p>
    </div>
  )

  const { data: members } = await supabase
    .from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)

  type ProfileRow = { full_name: string | null; email: string } | null

  const memberList = (members ?? []).map(m => ({
    user_id: m.user_id,
    display_name:
      (m.profiles as unknown as ProfileRow)?.full_name
      ?? (m.profiles as unknown as ProfileRow)?.email
      ?? m.user_id,
  }))

  // Ensure the current user (e.g. org owner) always appears in the roster
  if (!memberList.some(m => m.user_id === user.id)) {
    const { data: ownProfile } = await supabase
      .from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    memberList.unshift({
      user_id: user.id,
      display_name:
        (ownProfile as ProfileRow | null)?.full_name
        ?? (ownProfile as ProfileRow | null)?.email
        ?? user.email
        ?? user.id,
    })
  }

  const today = new Date()
  const from = new Date(today); from.setDate(today.getDate() - 14)
  const to = new Date(today); to.setDate(today.getDate() + 28)
  const fromISO = from.toISOString().split('T')[0]
  const toISO = to.toISOString().split('T')[0]

  const [{ data: shifts }, { data: leaveData }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('roster_shifts').select('id, org_id, user_id, date, start_time, end_time, notes, published')
      .eq('org_id', orgId).is('deleted_at', null)
      .gte('date', fromISO).lte('date', toISO),
    supabase
      .from('leave_requests').select('id, user_id, leave_type, start_date, end_date, half_day')
      .eq('org_id', orgId).eq('status', 'approved')
      .lte('start_date', toISO)
      .gte('end_date', fromISO),
    supabase
      .from('organisations').select('pay_week_start_day')
      .eq('id', orgId).maybeSingle(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Roster</h1>
        <RosterGrid
          orgId={orgId}
          members={memberList}
          initialShifts={shifts ?? []}
          leaveBlocks={leaveData ?? []}
          canManageRoster={canManageRoster}
          weekStartDay={orgSettings?.pay_week_start_day ?? 1}
        />
      </div>
    </div>
  )
}
