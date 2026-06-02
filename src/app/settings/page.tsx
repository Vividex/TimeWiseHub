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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Account settings</h1>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">Back to dashboard</a>
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
