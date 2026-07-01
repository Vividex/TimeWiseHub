import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { summariseAsset } from '@/lib/programs/summarise-asset'
import type { ProgramAsset } from '@/types/programs'

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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdminAccess(id, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: asset } = await service
    .from('program_assets').select('*').eq('id', assetId).eq('program_id', id).maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const typed = asset as ProgramAsset
  if (!['note', 'image', 'pdf'].includes(typed.asset_type)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  await service.from('program_assets').update({ ai_status: 'processing' }).eq('id', assetId)

  try {
    const result = await summariseAsset(typed)
    if (!result) {
      await service.from('program_assets').update({ ai_status: 'skipped' }).eq('id', assetId)
      return NextResponse.json({ ok: true, skipped: true })
    }
    await service.from('program_assets').update({
      ai_status: 'done',
      ai_summary: result.summary,
      ai_tags: result.tags,
    }).eq('id', assetId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Asset summarisation failed:', err)
    await service.from('program_assets').update({ ai_status: 'failed' }).eq('id', assetId)
    return NextResponse.json({ error: 'Summarisation failed' }, { status: 500 })
  }
}
