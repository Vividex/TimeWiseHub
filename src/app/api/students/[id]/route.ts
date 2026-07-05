import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

async function getOwnerIdForStudent(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string) {
  const { data } = await supabase
    .from('students')
    .select('id, clients(owner_id)')
    .eq('id', studentId)
    .maybeSingle()
  const client = (data?.clients as unknown as { owner_id: string } | null)
  return { exists: !!data, ownerId: client?.owner_id ?? null }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForStudent(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, notes } = body as { name: string; notes?: string | null }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { error } = await supabase.from('students').update({
    name: name.trim(),
    notes: notes || null,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForStudent(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('students').update({ archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
