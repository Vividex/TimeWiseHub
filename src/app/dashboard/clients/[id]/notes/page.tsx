// src/app/dashboard/clients/[id]/notes/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import AddProgressNote from '@/components/clients/AddProgressNote'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function ClientNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: notes } = await supabase
    .from('progress_notes')
    .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const notesData = notes ?? []

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Progress notes</h1>

        <AddProgressNote clientId={id} orgId={orgId} />

        <div className="space-y-3">
          {notesData.map(n => {
            const author = (n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown'
            return (
              <div key={n.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-gray-500">{author}</span>
                  <span className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-slate-300">{n.body}</p>
              </div>
            )
          })}
          {notesData.length === 0 && <p className="text-sm font-semibold text-gray-400">No notes yet.</p>}
        </div>
      </div>
    </div>
  )
}
