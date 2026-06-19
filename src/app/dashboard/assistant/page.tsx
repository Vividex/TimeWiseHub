// src/app/dashboard/assistant/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import AssistantPageClient from '@/components/assistant/AssistantPageClient'
import { getSubscription, isPaidPlan } from '@/lib/subscription'

export default async function AssistantPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sub = await getSubscription(user.id)
  if (!isPaidPlan(sub)) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-6 text-center">
        <div className="text-4xl mb-4">✦</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">AI Assistant is a Pro feature</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Ask questions about your business data in plain English. Upgrade to Pro to unlock it.
        </p>
        <Link href="/dashboard/billing" className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-600 transition-colors">
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  const { data: sessions } = await supabase
    .from('assistant_sessions')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30)

  return (
    <div className="flex overflow-hidden dark:bg-slate-950" style={{ height: 'calc(100dvh - env(safe-area-inset-top, 0px) - 4.75rem)' }}>
      <AssistantPageClient
        userId={user.id}
        userEmail={user.email ?? ''}
        initialSessions={(sessions ?? []) as { id: string; title: string | null; updated_at: string }[]}
      />
    </div>
  )
}
