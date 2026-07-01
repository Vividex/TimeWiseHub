import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { topUpSeries } from '@/lib/sessions/series'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: activeSeries, error } = await service
    .from('session_series').select('id').eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let totalGenerated = 0
  for (const series of activeSeries ?? []) {
    totalGenerated += await topUpSeries(service, series.id, 8)
  }

  return NextResponse.json({ ok: true, seriesChecked: (activeSeries ?? []).length, totalGenerated })
}
