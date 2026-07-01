import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: series } = await service.from('session_series').select('*').eq('id', seriesId).maybeSingle()
  if (!series) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', series.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await service.from('session_series').update({ is_active: false }).eq('id', seriesId)
  await service.from('sessions').delete().eq('series_id', seriesId).eq('status', 'scheduled')

  return NextResponse.json({ ok: true })
}
