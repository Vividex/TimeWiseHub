import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import InviteMember from '@/components/InviteMember'
import NudgeBanner from '@/components/NudgeBanner'

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

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* Smart nudges */}
        <NudgeBanner userId={user.id} />

        {/* Quick links */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/dashboard/time" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Time tracking</p>
            <p className="text-xl font-black text-gray-900">Log &amp; track hours</p>
            <p className="mt-3 text-sm font-semibold text-gray-500">Open time workspace</p>
          </Link>
          <Link href="/dashboard/expenses" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Expenses</p>
            <p className="text-xl font-black text-gray-900">Log &amp; manage costs</p>
            <p className="mt-3 text-sm font-semibold text-gray-500">Review spending</p>
          </Link>
          <Link href="/dashboard/projects" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Projects</p>
            <p className="text-xl font-black text-gray-900">Manage tasks</p>
            <p className="mt-3 text-sm font-semibold text-gray-500">Track deadlines</p>
          </Link>
          <Link href="/dashboard/calendar" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Calendar</p>
            <p className="text-xl font-black text-gray-900">Events &amp; deadlines</p>
            <p className="mt-3 text-sm font-semibold text-gray-500">See the schedule</p>
          </Link>
        </div>

        {/* Org info */}
        {org ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">{org.name}</h2>
            <p className="mt-1 text-sm font-semibold capitalize text-gray-500">Your role: {role}</p>

            {(role === 'owner' || role === 'admin') && (
              <div className="mt-6">
                <InviteMember orgId={org.id} />
              </div>
            )}
          </div>
        ) : profile?.account_type === 'org_owner' ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <p className="mb-4 text-sm font-semibold text-gray-500">You haven&apos;t set up your organisation yet.</p>
            <a href="/onboarding" className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">Set up organisation</a>
          </div>
        ) : null}

      </div>
    </div>
  )
}
