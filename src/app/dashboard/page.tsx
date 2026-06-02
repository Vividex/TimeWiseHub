import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SignOutButton from '@/components/SignOutButton'
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Signed in as <strong>{user.email}</strong></p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-sm text-gray-500 hover:text-gray-900">Settings</a>
            <SignOutButton />
          </div>
        </div>

        {/* Smart nudges */}
        <NudgeBanner userId={user.id} />

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4">
          <a href="/dashboard/time" className="bg-white rounded-2xl shadow p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Time tracking</p>
            <p className="text-sm text-gray-900 font-medium">Log &amp; track hours →</p>
          </a>
          <a href="/dashboard/expenses" className="bg-white rounded-2xl shadow p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expenses</p>
            <p className="text-sm text-gray-900 font-medium">Log &amp; manage costs →</p>
          </a>
          <a href="/dashboard/projects" className="bg-white rounded-2xl shadow p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Projects</p>
            <p className="text-sm text-gray-900 font-medium">Manage tasks &amp; deadlines →</p>
          </a>
          <a href="/dashboard/calendar" className="bg-white rounded-2xl shadow p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Calendar</p>
            <p className="text-sm text-gray-900 font-medium">Events &amp; deadlines →</p>
          </a>
        </div>

        {/* Org info */}
        {org ? (
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{org.name}</h2>
            <p className="text-sm text-gray-500 capitalize">Your role: {role}</p>

            {(role === 'owner' || role === 'admin') && (
              <div className="mt-6">
                <InviteMember orgId={org.id} />
              </div>
            )}
          </div>
        ) : profile?.account_type === 'org_owner' ? (
          <div className="bg-white rounded-2xl shadow p-6 text-center">
            <p className="text-sm text-gray-500 mb-3">You haven't set up your organisation yet.</p>
            <a href="/onboarding" className="text-blue-600 text-sm underline">Set up organisation</a>
          </div>
        ) : null}

      </div>
    </div>
  )
}
