import { createClient } from '@/lib/supabase-server'
import ActivityFeed from '@/components/activity/ActivityFeed'
import IdleReport from '@/components/activity/IdleReport'

export async function ActivityPanel() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const thirtyFiveDaysAgo = new Date()
  thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 34)
  thirtyFiveDaysAgo.setHours(0, 0, 0, 0)

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  const [{ data: logs }, { data: timeEntries }] = await Promise.all([
    supabase
      .from('activity_log')
      .select('id, event_type, entity_type, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('time_entries')
      .select('started_at')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .gte('started_at', thirtyFiveDaysAgo.toISOString()),
  ])

  const activeDates = new Set((timeEntries ?? []).map(e => e.started_at.slice(0, 10)))

  let totalWorkdays = 0
  let activeDays = 0
  for (let i = 34; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    totalWorkdays++
    if (activeDates.has(d.toISOString().slice(0, 10))) activeDays++
  }

  let orgLogs: typeof logs = []
  if (isManager && membership?.org_id) {
    const { data: members } = await supabase
      .from('organisation_members')
      .select('user_id')
      .eq('org_id', membership.org_id)
      .neq('user_id', user.id)

    const memberIds = (members ?? []).map(m => m.user_id)

    if (memberIds.length > 0) {
      const { data } = await supabase
        .from('activity_log')
        .select('id, event_type, entity_type, metadata, created_at, user_id, profiles(email, full_name)')
        .in('user_id', memberIds)
        .order('created_at', { ascending: false })
        .limit(50)
      orgLogs = data ?? []
    }
  }

  return (
    <div className="space-y-6">
      <IdleReport
        activeDates={activeDates}
        totalWorkdays={totalWorkdays}
        activeDays={activeDays}
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-sm font-bold uppercase tracking-wide text-gray-500">My activity</h3>
        <ActivityFeed entries={logs ?? []} />
      </div>

      {isManager && orgLogs.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-wide text-gray-500">Team activity</h3>
          <ActivityFeed entries={orgLogs} />
        </div>
      )}
    </div>
  )
}
