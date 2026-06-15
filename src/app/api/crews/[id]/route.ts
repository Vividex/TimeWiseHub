import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  if (!['owner', 'admin'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json() as { name?: string; managerId?: string }
  const update: Record<string, string> = {}
  if (body.name) update.name = body.name.trim()
  if (body.managerId) update.manager_id = body.managerId

  const { error } = await supabase.from('crews').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  if (!['owner', 'admin'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { error } = await supabase.from('crews').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
