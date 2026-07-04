import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import ClientMessagesThread from '@/components/clients/ClientMessagesThread'
import type { ClientMessage } from '@/components/clients/ClientMessagesThread'

export default async function ClientMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase
    .from('clients').select('id, name, email, owner_id').eq('id', id).maybeSingle()
  if (!client) notFound()

  const subscription = await getSubscription(client.owner_id)
  if (!isPaidPlan(subscription)) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-6 text-center">
        <div className="text-4xl mb-4">💬</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Client messaging is a Pro feature</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Send and receive email with clients right from their record, branded as your business,
          with no client login required. Upgrade to Pro to unlock it.
        </p>
        <Link href="/dashboard/billing" className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-600 transition-colors">
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  const { data: rows } = await supabase
    .from('client_messages')
    .select('id, direction, body, created_at, sender_user_id, profiles(full_name, email)')
    .eq('client_id', id)
    .order('created_at', { ascending: true })

  const messages: ClientMessage[] = (rows ?? []).map(r => {
    const senderProfile = r.profiles as unknown as { full_name: string | null; email: string } | null
    return {
      id: r.id,
      direction: r.direction as 'outbound' | 'inbound',
      body: r.body,
      created_at: r.created_at,
      sender_name: senderProfile?.full_name || senderProfile?.email || null,
    }
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Messages</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">{client.name}</p>
      </div>
      <ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} />
    </div>
  )
}
