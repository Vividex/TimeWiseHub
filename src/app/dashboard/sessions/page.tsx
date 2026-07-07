import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import { getWeekBounds } from '@/lib/week'
import AddSessionButton from '@/components/sessions/AddSessionButton'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}

const SESSION_COLUMNS = 'id, title, scheduled_at, duration_minutes, status, client_id, series_id, clients(name)'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

type SessionTileData = {
  id: string
  title: string
  clientId: string
  meta: string
  recurring: boolean
}

function mapSession(s: {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  status: string
  client_id: string
  series_id: string | null
  clients: unknown
}): SessionTileData {
  const clientName = (s.clients as unknown as { name: string } | null)?.name ?? 'Unknown client'
  const statusLabel = STATUS_LABEL[s.status] ?? s.status
  return {
    id: s.id,
    title: s.title,
    clientId: s.client_id,
    meta: `${clientName} · ${fmtDateTime(s.scheduled_at)} · ${s.duration_minutes} min · ${statusLabel}`,
    recurring: !!s.series_id,
  }
}

export default async function SessionsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { weekStart, weekEnd } = getWeekBounds()

  const clientsQuery = orgId
    ? supabase.from('clients').select('id, name').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`).eq('archived', false).order('name')
    : supabase.from('clients').select('id, name').eq('owner_id', user.id).eq('archived', false).order('name')

  const [{ data: thisWeekRaw }, { data: scheduledRaw }, { data: clientsRaw }] = await Promise.all([
    orgId
      ? supabase
          .from('sessions')
          .select(SESSION_COLUMNS)
          .eq('org_id', orgId)
          .gte('scheduled_at', weekStart.toISOString())
          .lt('scheduled_at', weekEnd.toISOString())
          .order('scheduled_at')
      : Promise.resolve({ data: [], error: null }),
    orgId
      ? supabase
          .from('sessions')
          .select(SESSION_COLUMNS)
          .eq('org_id', orgId)
          .eq('status', 'scheduled')
          .gte('scheduled_at', weekEnd.toISOString())
          .order('scheduled_at')
      : Promise.resolve({ data: [], error: null }),
    clientsQuery,
  ])

  const thisWeek = (thisWeekRaw ?? []).map(mapSession)
  const scheduled = (scheduledRaw ?? []).map(mapSession)
  const clients = clientsRaw ?? []

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sessions</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {thisWeek.length} this week
            </p>
          </div>
          <AddSessionButton clients={clients} />
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">This week</h2>
          <TileGrid empty="No sessions scheduled this week.">
            {thisWeek.map(s => (
              <Tile
                key={s.id}
                title={s.title}
                meta={s.meta}
                badge={s.recurring ? { label: 'Recurring', tone: 'cyan' } : undefined}
                href={`/dashboard/clients/${s.clientId}/sessions/${s.id}`}
              />
            ))}
          </TileGrid>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Scheduled</h2>
          <TileGrid empty="No further sessions scheduled.">
            {scheduled.map(s => (
              <Tile
                key={s.id}
                title={s.title}
                meta={s.meta}
                badge={s.recurring ? { label: 'Recurring', tone: 'cyan' } : undefined}
                href={`/dashboard/clients/${s.clientId}/sessions/${s.id}`}
              />
            ))}
          </TileGrid>
        </div>
      </div>
    </div>
  )
}
