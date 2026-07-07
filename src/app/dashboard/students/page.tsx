import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const clientsQuery = orgId
    ? supabase.from('clients').select('id').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`).eq('archived', false)
    : supabase.from('clients').select('id').eq('owner_id', user.id).eq('archived', false)
  const { data: clientRows } = await clientsQuery
  const clientIds = (clientRows ?? []).map(c => c.id)

  const { data: studentsRaw } = clientIds.length > 0
    ? await supabase
        .from('students')
        .select('id, name, client_id, clients(name)')
        .in('client_id', clientIds)
        .eq('archived', false)
        .order('name')
    : { data: [] }

  const students = (studentsRaw ?? []).map(s => ({
    id: s.id as string,
    name: s.name as string,
    clientName: (s.clients as unknown as { name: string } | null)?.name ?? 'Unknown',
  }))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Students</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {students.length} enrolled
          </p>
        </div>

        <TileGrid empty="No students enrolled yet.">
          {students.map(s => (
            <Tile
              key={s.id}
              title={s.name}
              meta={s.clientName}
              href={`/dashboard/students/${s.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
