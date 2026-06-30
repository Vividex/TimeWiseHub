import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Fetch client to confirm existence and get owner_id for auth
  const { data: clientRow } = await supabase
    .from('clients').select('id, owner_id').eq('id', id).maybeSingle()
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = clientRow.owner_id === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Field-edit path — triggered when body contains 'name'
  if ('name' in body) {
    const { name, email, phone, address, default_rate, currency } = body as {
      name: string
      email?: string | null
      phone?: string | null
      address?: string | null
      default_rate?: number | null
      currency?: string
    }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const { error } = await supabase.from('clients').update({
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      address: address || null,
      default_rate: default_rate ? Number(default_rate) : null,
      currency: currency || 'AUD',
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Archive toggle path (existing behaviour, admin-only)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await supabase
    .from('clients').update({ archived: body.archived ?? false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await requireAdmin(supabase, user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('id', id).maybeSingle()
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('clients').update({ archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
