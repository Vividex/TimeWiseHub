import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VideoCalendar from '@/components/video/VideoCalendar'
import VideoPageClient from '@/components/video/VideoPageClient'

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
    .select('user_id, profiles(email, full_name)')
    .eq('org_id', orgId)

  const members: OrgMember[] = (rawMembers ?? [])
    .filter(m => m.user_id !== user.id)
    .map(m => ({
      userId: m.user_id,
      email: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.email ?? '',
      fullName: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.full_name ?? null,
    }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Video</h1>
          <p className="text-sm text-slate-500 mt-1">Start or schedule team video calls</p>
        </div>
        <VideoPageClient orgId={orgId} members={members} canSchedule={canSchedule} />
      </div>
      <VideoCalendar calls={(calls ?? []) as ScheduledCall[]} />
    </div>
  )
}
