import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SignOutButton from '@/components/SignOutButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500">Signed in as <strong>{user.email}</strong></p>
      </div>
    </div>
  )
}
