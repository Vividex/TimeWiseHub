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
import { getWorkspaceProfile } from '@/lib/workspace-profiles/registry'

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

  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get('active_org_id')?.value ?? null

  // These three don't depend on each other's results -- fetched in parallel instead of one
  // sequential round trip after another. On a higher-latency mobile connection, this layout's
  // old one-at-a-time queries (this batch, plus the org/profile lookup below, plus a further
  // redundant org_id re-fetch inside the old getWorkspaceProfileForUser call) compounded into
  // real, noticeable delay on every fresh app open.
  const [{ data: membership }, { data: tutorialRow }, cookieOrgCheck] = await Promise.all([
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_onboarding_dismissed').select('dismissed_at, started_at, current_step_index, context').eq('user_id', user.id).maybeSingle(),
    cookieOrgId
      ? supabase.from('organisation_members').select('id', { count: 'exact', head: true }).eq('org_id', cookieOrgId).eq('user_id', user.id)
      : Promise.resolve({ count: null as number | null }),
  ])

  // Resolve active org from cookie (only if the user is still actually a member of it), with
  // fallback to membership.
  const orgId = (cookieOrgId && cookieOrgCheck.count) ? cookieOrgId : (membership?.org_id ?? null)

  const initialState = {
    dismissed: tutorialRow ? tutorialRow.dismissed_at !== null : false,
    startedAt: tutorialRow?.started_at ?? null,
    stepIndex: tutorialRow?.current_step_index ?? 0,
    context: (tutorialRow?.context as Record<string, string>) ?? {},
  }

  const role = (membership?.role ?? 'employee') as 'owner' | 'admin' | 'manager' | 'employee'

  // Folds the workspace-profile lookup into the same org/profile row this layout already has
  // to fetch for the deactivated/setup-completed checks, instead of a separate call that used
  // to re-fetch org_id from organisation_members all over again internally.
  let workspaceProfileKey = 'generic'
  if (orgId) {
    const { data: org } = await supabase
      .from('organisations').select('deactivated_at, setup_completed, workspace_profile').eq('id', orgId).maybeSingle()
    if (org?.deactivated_at) redirect('/account-deactivated')
    if (['owner', 'admin'].includes(role) && org && !org.setup_completed) redirect('/setup')
    workspaceProfileKey = org?.workspace_profile ?? 'generic'
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('deactivated_at, setup_completed, workspace_profile').eq('id', user.id).maybeSingle()
    if (profile?.deactivated_at) redirect('/account-deactivated')
    if (profile && !profile.setup_completed) redirect('/setup')
    workspaceProfileKey = profile?.workspace_profile ?? 'generic'
  }
  const workspaceProfile = getWorkspaceProfile(workspaceProfileKey)
  const { terminology, navOverrides } = workspaceProfile

  return (
    <TutorialProvider initialState={initialState} profileKey={workspaceProfile.key} terminology={terminology}>
      <ChatRealtimeProvider userId={user.id} orgId={orgId ?? ''}>
        <DashboardShell email={user.email ?? ''} clientLabel={terminology.client} programLabel={terminology.program} projectLabel={terminology.project} navOverrides={navOverrides}>
          {children}
          <FloatingWidgets userEmail={user.email ?? ''} projectLabel={terminology.project} />
        </DashboardShell>
      </ChatRealtimeProvider>
      <WelcomeModal />
      <TutorialTracker />
      <TutorialComplete />
      <PushAutoPrompt />
    </TutorialProvider>
  )
}
