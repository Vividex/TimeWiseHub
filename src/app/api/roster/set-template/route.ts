import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, shifts } = await req.json()
  if (!orgId || !Array.isArray(shifts)) {
    return NextResponse.json({ error: 'orgId and shifts required' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!['owner', 'admin'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabase.from('roster_shift_templates').delete().eq('org_id', orgId)

  if (shifts.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const rows = (shifts as { userId: string; dayOfWeek: number; startTime: string; endTime: string; notes: string | null }[]).map(s => ({
    org_id: orgId,
    user_id: s.userId,
    day_of_week: s.dayOfWeek,
    start_time: s.startTime,
    end_time: s.endTime,
    notes: s.notes ?? null,
  }))

  const { error } = await supabase.from('roster_shift_templates').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, count: rows.length })
}
