import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import WelcomeModal from '@/components/tutorial/WelcomeModal'
import TipsScreen from '@/components/tutorial/TipsScreen'
import TutorialOverlay from '@/components/tutorial/TutorialOverlay'
import PushAutoPrompt from '@/components/PushAutoPrompt'
import type { UserRole } from '@/lib/tutorial-steps'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch membership once — needed for org resolution, tutorial role, and created_at
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // Resolve active org from cookie, with fallback to membership
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

  // Tutorial: only show to members who joined in the last 30 days
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const isNewMember = membership?.created_at
    ? new Date(membership.created_at) > thirtyDaysAgo
    : false

  let initialDismissed = true
  if (isNewMember) {
    const { data: dismissed } = await supabase
      .from('user_onboarding_dismissed').select('user_id').eq('user_id', user.id).maybeSingle()
    initialDismissed = !!dismissed
  }

  const role = (membership?.role ?? 'employee') as UserRole

  return (
    <TutorialProvider initialDismissed={initialDismissed} role={role}>
      <ChatRealtimeProvider userId={user.id} orgId={orgId ?? ''}>
        <DashboardShell email={user.email ?? ''}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} />
        </DashboardShell>
      </ChatRealtimeProvider>
      <WelcomeModal />
      <TipsScreen />
      <TutorialOverlay />
      <PushAutoPrompt />
    </TutorialProvider>
  )
}
