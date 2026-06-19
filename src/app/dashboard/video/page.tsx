import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import VideoCalendar from '@/components/video/VideoCalendar'
import VideoPageClient from '@/components/video/VideoPageClient'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const sub = await getSubscription(user.id)
  if (!isTeamPlan(sub)) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-6 text-center">
        <div className="text-4xl mb-4">📹</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Video calls are a Business feature</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Start instant calls or schedule team meetings with calendar invites and email reminders. Upgrade to Business to unlock it.
        </p>
        <Link href="/dashboard/billing" className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-600 transition-colors">
          Upgrade to Business
        </Link>
      </div>
    )
  }

  const orgId = membership.org_id
  const canSchedule = ['owner', 'admin', 'manager'].includes(membership.role)

  const until = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: calls } = await supabase
    .from('scheduled_calls')
    .select('id, title, starts_at, ends_at, daily_room_name')
    .eq('org_id', orgId)
    .or(`starts_at.is.null,starts_at.lte.${until}`)
    .order('starts_at', { ascending: true })

  const { data: rawMembers } = await supabase
    .from('organisation_members')
    .select('user_id, profiles!organisation_members_user_id_fkey(email, full_name, nickname)')
    .eq('org_id', orgId)

  type ProfileRow = { email: string; full_name: string | null; nickname: string | null } | null

  const members: OrgMember[] = (rawMembers ?? [])
    .map(m => {
      const p = m.profiles as unknown as ProfileRow
      return {
        userId: m.user_id,
        email: p?.email ?? '',
        fullName: p?.nickname ?? p?.full_name ?? null,
      }
    })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Video</h1>
          <p className="text-sm text-slate-500 mt-1">Start or schedule team video calls</p>
        </div>
        <VideoPageClient orgId={orgId} members={members} canSchedule={canSchedule} />
      </div>
      <VideoCalendar calls={(calls ?? []) as ScheduledCall[]} canManage={canSchedule} />
    </div>
  )
}
