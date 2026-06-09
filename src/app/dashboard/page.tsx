import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import InviteMember from '@/components/InviteMember'
import NudgeBanner from '@/components/NudgeBanner'
import PushPermission from '@/components/PushPermission'
import WelcomeBanner from '@/components/WelcomeBanner'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Load org membership
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, organisations(id, name)')
    .eq('user_id', user.id)
    .single()

  const org = membership?.organisations as unknown as { id: string; name: string } | null
  const role = membership?.role
  const subscription = await getSubscription(user.id)
  const hasTeamPlan = isTeamPlan(subscription)

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">
            Hi, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
        </div>

        {/* First-run welcome */}
        <WelcomeBanner firstName={profile?.full_name?.split(' ')[0] ?? ''} />

        {/* Smart nudges */}
        <NudgeBanner userId={user.id} />

        {/* Push notifications opt-in */}
        <div className="flex justify-end">
          <PushPermission />
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/dashboard/time" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-600">Time tracking</p>
            <p className="text-xl font-black text-gray-900 dark:text-slate-100">Log &amp; track hours</p>
            <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">Open time workspace</p>
          </Link>
          <Link href="/dashboard/expenses" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-600">Expenses</p>
            <p className="text-xl font-black text-gray-900 dark:text-slate-100">Log &amp; manage costs</p>
            <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">Review spending</p>
          </Link>
          <Link href="/dashboard/projects" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-600">Projects</p>
            <p className="text-xl font-black text-gray-900 dark:text-slate-100">Manage tasks</p>
            <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">Track deadlines</p>
          </Link>
          <Link href="/dashboard/calendar" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-600">Calendar</p>
            <p className="text-xl font-black text-gray-900 dark:text-slate-100">Events &amp; deadlines</p>
            <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">See the schedule</p>
          </Link>
        </div>

        {/* Org info */}
        {org ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">{org.name}</h2>
            <p className="mt-1 text-sm font-semibold capitalize text-gray-500 dark:text-slate-400">Your role: {role}</p>

            {(role === 'owner' || role === 'admin') && hasTeamPlan && (
              <div className="mt-6">
                <InviteMember orgId={org.id} />
              </div>
            )}
            {(role === 'owner' || role === 'admin') && !hasTeamPlan && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                Team member invites require the Team plan.
              </div>
            )}
          </div>
        ) : profile?.account_type === 'org_owner' ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-slate-400">You haven&apos;t set up your organisation yet.</p>
            <a href="/onboarding" className="inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">Set up organisation</a>
          </div>
        ) : null}

      </div>
    </div>
  )
}
