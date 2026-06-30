import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return false
  if (program.owner_id === userId) return true
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  return !!m && ['owner', 'admin', 'manager'].includes(m.role as string)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; catId: string }> },
) {
  const { id, catId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name?.trim()
  if ('description' in body) patch.description = body.description?.trim() || null
  if ('colour' in body) patch.colour = body.colour || null
  if ('icon' in body) patch.icon = body.icon || null
  if ('sort_order' in body) patch.sort_order = body.sort_order

  const service = createServiceClient()
  const { data, error } = await service.from('program_categories')
    .update(patch).eq('id', catId).eq('program_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; catId: string }> },
) {
  const { id, catId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  // Cascade in DB handles child categories. Assets get ON DELETE SET NULL — they move to uncategorised.
  const { error } = await service.from('program_categories')
    .delete().eq('id', catId).eq('program_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
