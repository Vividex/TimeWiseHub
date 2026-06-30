import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function assertAccess(programId: string, userId: string, requireAdmin = false) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return null

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()

  const isOwner = program.owner_id === userId
  const isAdmin = !!membership && ['owner', 'admin', 'manager'].includes(membership.role as string)
  const isMember = !!membership

  if (requireAdmin && !isOwner && !isAdmin) return null
  if (!requireAdmin && !isOwner && !isMember) return null
  return { program, isOwner, isAdmin }
}

async function getCategoryDepth(catId: string): Promise<number> {
  const service = createServiceClient()
  let depth = 0
  let currentId: string | null = catId
  while (currentId && depth < 4) {
    const { data }: { data: { parent_id: string | null } | null } = await service
      .from('program_categories').select('parent_id').eq('id', currentId).single()
    if (!data) break
    currentId = data.parent_id
    depth++
  }
  return depth
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('program_categories').select('*')
    .eq('program_id', id).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertAccess(id, user.id, true)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, parent_id, description, colour, icon } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  if (parent_id) {
    const parentDepth = await getCategoryDepth(parent_id)
    if (parentDepth >= 3) {
      return NextResponse.json(
        { error: 'Maximum category depth (3 levels) reached' },
        { status: 422 },
      )
    }
  }

  const service = createServiceClient()
  const { data, error } = await service.from('program_categories').insert({
    program_id: id,
    parent_id: parent_id ?? null,
    name: name.trim(),
    description: description?.trim() || null,
    colour: colour || null,
    icon: icon || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
