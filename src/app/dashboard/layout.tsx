import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve active org from cookie, with fallback to first membership
  const cookieStore = await cookies()
  let orgId = cookieStore.get('active_org_id')?.value ?? null

  if (orgId) {
    // Validate the cookie is still correct (user may have been removed from that org)
    const { count } = await supabase
      .from('organisation_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', user.id)
    if (!count) orgId = null
  }

  if (!orgId) {
    const { data: membership } = await supabase
      .from('organisation_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    orgId = membership?.org_id ?? null
  }

  return (
    <ChatRealtimeProvider userId={user.id} orgId={orgId ?? ''}>
      <DashboardShell email={user.email ?? ''}>
        {children}
        <FloatingWidgets userEmail={user.email ?? ''} />
      </DashboardShell>
    </ChatRealtimeProvider>
  )
}
