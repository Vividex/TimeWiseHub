import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import DashboardShell from '@/components/DashboardShell'
import AssistantWidget from '@/components/AssistantWidget'
import ChatRealtimeProvider from '@/components/chat/ChatRealtimeProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <ChatRealtimeProvider userId={user.id}>
      <DashboardShell email={user.email ?? ''}>
        {children}
        <AssistantWidget userEmail={user.email ?? ''} open={false} onClose={() => {}} />
      </DashboardShell>
    </ChatRealtimeProvider>
  )
}
