import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { advanceDate, topUpSeries } from '@/lib/sessions/series'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recurrenceInterval } = await req.json()
  if (!recurrenceInterval) return NextResponse.json({ error: 'recurrenceInterval is required' }, { status: 400 })

  const service = createServiceClient()
  const { data: session } = await service.from('sessions').select('*').eq('id', id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.series_id) {
    const { data: existingSeries } = await service
      .from('session_series').select('is_active').eq('id', session.series_id).maybeSingle()
    if (existingSeries?.is_active) {
      return NextResponse.json({ error: 'Session already belongs to an active series' }, { status: 409 })
    }
  }

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', session.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: series, error } = await service.from('session_series').insert({
    client_id: session.client_id,
    org_id: session.org_id,
    created_by: user.id,
    title: session.title,
    duration_minutes: session.duration_minutes,
    recurrence_interval: recurrenceInterval,
    next_scheduled_at: advanceDate(session.scheduled_at, recurrenceInterval),
  }).select().single()

  if (error || !series) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create series' }, { status: 500 })
  }

  await service.from('sessions').update({ series_id: series.id }).eq('id', id)
  await topUpSeries(service, series.id, 8)

  return NextResponse.json(series)
}
