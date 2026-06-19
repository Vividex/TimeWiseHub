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
    .from('organisation_members').select('user_id, role, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)

  type ProfileRow = { full_name: string | null; email: string } | null
  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, manager: 2, employee: 3 }

  const memberListRaw = (members ?? []).map(m => ({
    user_id: m.user_id,
    role: m.role as string,
    display_name:
      (m.profiles as unknown as ProfileRow)?.full_name
      || (m.profiles as unknown as ProfileRow)?.email
      || m.user_id,
  }))

  // Ensure the current user (e.g. org owner) always appears in the roster
  if (!memberListRaw.some(m => m.user_id === user.id)) {
    const { data: ownProfile } = await supabase
      .from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    memberListRaw.push({
      user_id: user.id,
      role: membership?.role ?? 'owner',
      display_name:
        (ownProfile as ProfileRow | null)?.full_name
        ?? (ownProfile as ProfileRow | null)?.email
        ?? user.email
        ?? user.id,
    })
  }

  memberListRaw.sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99
    const rb = ROLE_ORDER[b.role] ?? 99
    if (ra !== rb) return ra - rb
    return a.display_name.localeCompare(b.display_name)
  })

  const memberList = memberListRaw.map(({ user_id, display_name }) => ({ user_id, display_name }))

  const todayStr = new Date().toISOString().slice(0, 10)
  const memberIds = memberListRaw.map(m => m.user_id)
  const { data: activeLeave } = memberIds.length > 0
    ? await supabase
        .from('leave_requests')
        .select('user_id, leave_type, status')
        .in('user_id', memberIds)
        .in('status', ['approved', 'pending'])
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
    : { data: [] }

  const leaveMap: Record<string, string> = {}
  ;(activeLeave ?? []).forEach((l: { user_id: string; leave_type: string; status: string }) => {
    leaveMap[l.user_id] = l.leave_type
  })

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
          leaveToday={leaveMap}
        />
      </div>
    </div>
  )
}
