// src/app/dashboard/assistant/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AssistantPageClient from '@/components/assistant/AssistantPageClient'

export default async function AssistantPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sessions } = await supabase
    .from('assistant_sessions')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30)

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden dark:bg-slate-950">
      <AssistantPageClient
        userId={user.id}
        userEmail={user.email ?? ''}
        initialSessions={(sessions ?? []) as { id: string; title: string | null; updated_at: string }[]}
      />
    </div>
  )
}
