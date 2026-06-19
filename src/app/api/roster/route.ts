import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { org_id, user_id, date, start_time, end_time, notes } = await req.json()

  const { count: overlap } = await supabase
    .from('roster_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .eq('user_id', user_id)
    .eq('date', date)
    .is('deleted_at', null)
    .lt('start_time', end_time)
    .gt('end_time', start_time)
  if ((overlap ?? 0) > 0) {
    return NextResponse.json({ error: 'This employee already has a shift that overlaps that time slot.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('roster_shifts')
    .insert({ org_id, user_id, date, start_time, end_time, notes: notes ?? null, published: false })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('roster_shifts').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const { error } = await supabase
    .from('roster_shifts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
