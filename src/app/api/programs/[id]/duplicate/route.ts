import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { buildCategoryTree } from '@/lib/programs/build-tree'
import type { CategoryNode, ProgramCategory } from '@/types/programs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, is_template } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const service = createServiceClient()
  const { data: source } = await service.from('programs').select('*').eq('id', id).maybeSingle()
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', source.org_id ?? '').maybeSingle()
  const isOwner = source.owner_id === user.id
  const isMember = !!membership
  if (!isOwner && !isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: newProgram, error: programError } = await service.from('programs').insert({
    owner_id: user.id,
    org_id: source.org_id,
    name: name.trim(),
    description: source.description,
    cover_colour: source.cover_colour,
    icon: source.icon,
    is_template: !!is_template,
    is_archived: false,
  }).select().single()

  if (programError || !newProgram) {
    return NextResponse.json({ error: programError?.message ?? 'Failed to create program' }, { status: 500 })
  }

  const [{ data: sourceCategories }, { data: sourceAssets }] = await Promise.all([
    service.from('program_categories').select('*')
      .eq('program_id', id).order('sort_order').order('created_at'),
    service.from('program_assets').select('*')
      .eq('program_id', id).in('asset_type', ['note', 'link']),
  ])

  const tree = buildCategoryTree((sourceCategories ?? []) as ProgramCategory[])
  const idMap = new Map<string, string>()

  async function insertLevel(nodes: CategoryNode[], newParentId: string | null) {
    for (const node of nodes) {
      const { data: inserted } = await service.from('program_categories').insert({
        program_id: newProgram.id,
        parent_id: newParentId,
        name: node.name,
        description: node.description,
        colour: node.colour,
        icon: node.icon,
        sort_order: node.sort_order,
      }).select('id').single()

      if (inserted) {
        idMap.set(node.id, inserted.id)
        await insertLevel(node.children, inserted.id)
      }
    }
  }

  await insertLevel(tree, null)

  const assetsToCopy = (sourceAssets ?? []).map(a => ({
    program_id: newProgram.id,
    category_id: a.category_id ? idMap.get(a.category_id) ?? null : null,
    owner_id: user.id,
    name: a.name,
    description: a.description,
    asset_type: a.asset_type,
    note_content: a.note_content,
    external_url: a.external_url,
    sort_order: a.sort_order,
    ai_status: 'skipped',
  }))

  if (assetsToCopy.length > 0) {
    await service.from('program_assets').insert(assetsToCopy)
  }

  return NextResponse.json(newProgram)
}
