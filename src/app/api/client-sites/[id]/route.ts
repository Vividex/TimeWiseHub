import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

async function getOwnerIdForSite(supabase: Awaited<ReturnType<typeof createClient>>, siteId: string) {
  const { data } = await supabase
    .from('client_sites')
    .select('id, clients(owner_id)')
    .eq('id', siteId)
    .maybeSingle()
  const client = (data?.clients as unknown as { owner_id: string } | null)
  return { exists: !!data, ownerId: client?.owner_id ?? null }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForSite(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  // Field-edit path — triggered when body contains 'label'
  if ('label' in body) {
    const { label, address, contact_name, contact_phone, access_notes } = body as {
      label: string
      address: string
      contact_name?: string | null
      contact_phone?: string | null
      access_notes?: string | null
    }
    if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    if (!address?.trim()) return NextResponse.json({ error: 'Address is required' }, { status: 400 })

    const { error } = await supabase.from('client_sites').update({
      label: label.trim(),
      address: address.trim(),
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,
      access_notes: access_notes || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Archive toggle path (e.g. restoring an archived site)
  const { error } = await supabase
    .from('client_sites').update({ is_archived: body.is_archived ?? false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForSite(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('client_sites').update({ is_archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
