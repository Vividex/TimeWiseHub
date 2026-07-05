import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import SetupWizard from '@/components/setup/SetupWizard'

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const cookieStore = await cookies()
  let orgId = cookieStore.get('active_org_id')?.value ?? null

  if (orgId) {
    const { count } = await supabase
      .from('organisation_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', user.id)
    if (!count) orgId = null
  }

  if (!orgId) {
    orgId = membership?.org_id ?? null
  }

  const role = membership?.role ?? 'employee'

  if (orgId) {
    if (!['owner', 'admin'].includes(role)) redirect('/dashboard')
    const { data: org } = await supabase
      .from('organisations').select('setup_completed').eq('id', orgId).maybeSingle()
    if (org?.setup_completed) redirect('/dashboard')
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('setup_completed').eq('id', user.id).maybeSingle()
    if (profile?.setup_completed) redirect('/dashboard')
  }

  return <SetupWizard orgId={orgId} userId={user.id} />
}
