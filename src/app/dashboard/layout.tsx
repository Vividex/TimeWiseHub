import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import FloatingWidgets from '@/components/FloatingWidgets'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import WelcomeModal from '@/components/tutorial/WelcomeModal'
import TutorialTracker from '@/components/tutorial/TutorialTracker'
import TutorialComplete from '@/components/tutorial/TutorialComplete'
import PushAutoPrompt from '@/components/PushAutoPrompt'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Guest chat accounts (created for clients joining a video call) authenticate the same
  // way staff do, but must never reach the internal dashboard — only the call itself.
  if (user.app_metadata?.is_client_guest) redirect('/call-ended')

  // Fetch membership once — needed for org resolution and role
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
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

  const { data: tutorialRow } = await supabase
    .from('user_onboarding_dismissed')
    .select('dismissed_at, started_at, current_step_index, context')
    .eq('user_id', user.id)
    .maybeSingle()

  const initialState = {
    dismissed: tutorialRow ? tutorialRow.dismissed_at !== null : false,
    startedAt: tutorialRow?.started_at ?? null,
    stepIndex: tutorialRow?.current_step_index ?? 0,
    context: (tutorialRow?.context as Record<string, string>) ?? {},
  }

  const role = (membership?.role ?? 'employee') as 'owner' | 'admin' | 'manager' | 'employee'
  const workspaceProfile = await getWorkspaceProfileForUser(supabase, user.id)
  const { terminology, navOverrides } = workspaceProfile

  if (orgId) {
    const { data: org } = await supabase
      .from('organisations').select('deactivated_at, setup_completed').eq('id', orgId).maybeSingle()
    if (org?.deactivated_at) redirect('/account-deactivated')
    if (['owner', 'admin'].includes(role) && org && !org.setup_completed) redirect('/setup')
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('deactivated_at, setup_completed').eq('id', user.id).maybeSingle()
    if (profile?.deactivated_at) redirect('/account-deactivated')
    if (profile && !profile.setup_completed) redirect('/setup')
  }

  return (
    <TutorialProvider initialState={initialState} profileKey={workspaceProfile.key} terminology={terminology}>
      <ChatRealtimeProvider userId={user.id} orgId={orgId ?? ''}>
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} projectLabel={terminology.project} navOverrides={navOverrides}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} />
        </DashboardShell>
      </ChatRealtimeProvider>
      <WelcomeModal />
      <TutorialTracker />
      <TutorialComplete />
      <PushAutoPrompt />
    </TutorialProvider>
  )
}
