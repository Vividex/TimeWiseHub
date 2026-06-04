import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ReportsClient from '@/components/reports/ReportsClient'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <ReportsClient
          userId={user.id}
          orgId={membership?.org_id ?? null}
          isManager={isManager}
        />
      </div>
    </div>
  )
}
