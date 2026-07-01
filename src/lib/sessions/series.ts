import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionSeriesInterval = 'weekly' | 'fortnightly' | 'monthly'

export type SessionSeriesInfo = {
  id: string
  recurrence_interval: SessionSeriesInterval
  is_active: boolean
}

type SessionSeriesRow = {
  id: string
  client_id: string
  org_id: string | null
  created_by: string
  title: string
  duration_minutes: number
  recurrence_interval: SessionSeriesInterval
  next_scheduled_at: string
  is_active: boolean
}

export function advanceDate(from: string, interval: SessionSeriesInterval): string {
  const d = new Date(from)
  switch (interval) {
    case 'weekly':      d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
  }
  return d.toISOString()
}

export async function generateNextOccurrence(
  service: SupabaseClient,
  series: SessionSeriesRow,
): Promise<{ id: string } | null> {
  const { data: session, error } = await service
    .from('sessions')
    .insert({
      client_id: series.client_id,
      org_id: series.org_id,
      created_by: series.created_by,
      title: series.title,
      scheduled_at: series.next_scheduled_at,
      duration_minutes: series.duration_minutes,
      status: 'scheduled',
      series_id: series.id,
    })
    .select('id')
    .single()

  if (error || !session) return null

  const { data: templates } = await service
    .from('client_session_templates')
    .select('title, position')
    .eq('client_id', series.client_id)
    .order('position')

  if (templates && templates.length > 0) {
    await service.from('session_todos').insert(
      templates.map(t => ({
        session_id: session.id,
        title: t.title,
        completed: false,
        position: t.position,
      })),
    )
  }

  const nextDate = advanceDate(series.next_scheduled_at, series.recurrence_interval)
  await service.from('session_series').update({ next_scheduled_at: nextDate }).eq('id', series.id)
  series.next_scheduled_at = nextDate

  return session
}

export async function topUpSeries(
  service: SupabaseClient,
  seriesId: string,
  target = 8,
): Promise<number> {
  const { data: seriesRow } = await service
    .from('session_series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (!seriesRow) return 0

  const series = seriesRow as SessionSeriesRow
  const nowIso = new Date().toISOString()
  const { count } = await service
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', seriesId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)

  let generated = 0
  let remaining = target - (count ?? 0)

  while (remaining > 0) {
    const result = await generateNextOccurrence(service, series)
    if (!result) break
    generated++
    remaining--
  }

  return generated
}
