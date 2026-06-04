import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AccountSettingsForm from '@/components/AccountSettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, timezone, notification_preferences')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Account settings</h1>
          <p className="mt-2 text-sm font-semibold text-gray-500">{user.email}</p>
        </div>

        {/* GDPR data export */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Your data</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500">Download a copy of all your data — time entries, expenses, projects, tasks, and activity log.</p>
          <a href="/api/export" download
            className="mt-4 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-700">
            Download my data
          </a>
        </div>

        <AccountSettingsForm
          email={user.email ?? ''}
          initialFullName={profile?.full_name ?? ''}
          initialTimezone={profile?.timezone ?? 'UTC'}
          initialNotifications={profile?.notification_preferences ?? {
            deadline_alerts: true,
            priority_nudges: true,
            daily_digest: true,
            idle_alerts: true,
          }}
        />
      </div>
    </div>
  )
}

