import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function resolveProgram(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('*').eq('id', programId).single()
  if (!program) return null

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()

  const isOwner = program.owner_id === userId
  const isMember = !!membership
  const isAdmin = isMember && ['owner', 'admin', 'manager'].includes(membership!.role as string)

  return { program, isOwner, isMember, isAdmin }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(resolved.program)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name?.trim() || resolved.program.name
  if ('description' in body) patch.description = body.description?.trim() || null
  if ('cover_colour' in body) patch.cover_colour = body.cover_colour
  if ('icon' in body) patch.icon = body.icon
  if ('is_archived' in body) patch.is_archived = body.is_archived

  const service = createServiceClient()
  const { data, error } = await service.from('programs')
    .update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveProgram(id, user.id)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resolved.isOwner && !resolved.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { error } = await service.from('programs')
    .update({ is_archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
