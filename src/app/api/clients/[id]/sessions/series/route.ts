import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { topUpSeries } from '@/lib/sessions/series'
import { sendSeriesScheduledEmail } from '@/lib/session-email'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, scheduledAt, durationMinutes, recurrenceInterval } = await req.json()
  if (!title?.trim() || !scheduledAt || !recurrenceInterval) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: client } = await service.from('clients').select('id, org_id').eq('id', id).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', client.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: series, error } = await service.from('session_series').insert({
    client_id: id,
    org_id: client.org_id,
    created_by: user.id,
    title: title.trim(),
    duration_minutes: durationMinutes || 60,
    recurrence_interval: recurrenceInterval,
    next_scheduled_at: new Date(scheduledAt).toISOString(),
  }).select().single()

  if (error || !series) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create series' }, { status: 500 })
  }

  await topUpSeries(service, series.id, 8)

  await sendSeriesScheduledEmail(series.id)

  const { data: firstSession } = await service
    .from('sessions').select('id')
    .eq('series_id', series.id)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ seriesId: series.id, firstSessionId: firstSession?.id ?? null })
}
