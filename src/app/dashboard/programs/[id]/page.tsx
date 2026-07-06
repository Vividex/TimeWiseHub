import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { resolveProgramAssetSignedUrl } from '@/lib/program-storage'
import ProgramExplorer from '@/components/programs/ProgramExplorer'
import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const service = createServiceClient()

  const { data: program } = await service
    .from('programs').select('*').eq('id', id).single()
  if (!program) notFound()

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()

  const isOwner = program.owner_id === user.id
  const isMember = !!membership
  const isAdmin = isMember && ['owner', 'admin', 'manager'].includes(membership!.role as string)
  if (!isOwner && !isMember) notFound()

  const [{ data: categories }, { data: assets }] = await Promise.all([
    service.from('program_categories').select('*')
      .eq('program_id', id).order('sort_order').order('created_at'),
    service.from('program_assets').select('*')
      .eq('program_id', id).order('sort_order').order('created_at'),
  ])

  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => ({ ...asset, signed_url: await resolveProgramAssetSignedUrl(asset) })),
  )

  return (
    <ProgramExplorer
      program={program as Program}
      categories={(categories ?? []) as ProgramCategory[]}
      assets={assetsWithUrls}
      canManage={isOwner || isAdmin}
    />
  )
}
