import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LeaveRequestForm from '@/components/leave/LeaveRequestForm'
import LeaveRequestList from '@/components/leave/LeaveRequestList'
import LeaveBalance from '@/components/leave/LeaveBalance'
import ManagerLeaveView from '@/components/leave/ManagerLeaveView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

function workingDays(start: string, end: string, halfDay: boolean): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  let days = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days++
    cur.setDate(cur.getDate() + 1)
  }
  return halfDay ? 0.5 : days
}

export default async function LeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const hasManager = !!orgId && isTeamPlan(subscription)

  const [{ data: requests }, { data: balances }, managerResult] = await Promise.all([
    supabase.from('leave_requests')
      .select('id, leave_type, start_date, end_date, half_day, notes, status, review_note, created_at')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(50),

    supabase.from('leave_balances')
      .select('leave_type, entitled_days')
      .eq('user_id', user.id)
      .eq('year', year),

    isManager && orgId
      ? supabase.from('leave_requests')
          .select('id, leave_type, start_date, end_date, half_day, notes, status, user_id, profiles(email, full_name)')
          .eq('org_id', orgId)
          .eq('status', 'submitted')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  // Compute taken days per leave type from approved requests this year
  const takenMap: Record<string, number> = {}
  ;(requests ?? [])
    .filter(r => r.status === 'approved' && r.start_date >= yearStart)
    .forEach(r => {
      const days = workingDays(r.start_date, r.end_date, r.half_day)
      takenMap[r.leave_type] = (takenMap[r.leave_type] ?? 0) + days
    })

  const balanceData = (balances ?? []).map(b => ({
    leave_type: b.leave_type,
    entitled_days: Number(b.entitled_days),
    taken_days: takenMap[b.leave_type] ?? 0,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingRequests = (managerResult.data ?? []) as any[]

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Balances */}
        {balanceData.length > 0 && <LeaveBalance balances={balanceData} />}

        {balanceData.length === 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm text-sm text-gray-500 font-semibold">
            No leave balances configured yet. Add your annual entitlements in{' '}
            <a href="/settings" className="text-cyan-600 hover:underline">Settings</a> or ask your manager to set them up.
          </div>
        )}

        {/* Request form */}
        <LeaveRequestForm orgId={orgId} hasManager={hasManager} />

        {/* My leave history */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">My leave</h3>
          <LeaveRequestList requests={requests ?? []} />
        </div>

        {/* Manager approval queue */}
        {isManager && <ManagerLeaveView pending={pendingRequests} />}

      </div>
    </div>
  )
}
