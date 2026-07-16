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
        <Link href="/dashboard/billing" className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-6 py-3 text-sm font-bold">
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
