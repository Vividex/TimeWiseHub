import { createServiceClient } from '@/lib/supabase-service'
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import type { ProgramAsset } from '@/types/programs'

export function programStoragePath(opts: {
  orgId: string | null
  ownerId: string
  programId: string
  assetId: string
  filename: string
}): string {
  const prefix = opts.orgId ? opts.orgId : `solo/${opts.ownerId}`
  return `${prefix}/${opts.programId}/${opts.assetId}/${opts.filename}`
}

export async function createProgramAssetSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.storage
    .from('program-assets')
    .createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl ?? null
}

export async function resolveProgramAssetSignedUrl(asset: ProgramAsset): Promise<string | null> {
  if (asset.linked_topic_asset_id) {
    const service = createServiceClient()
    const { data: topicAsset } = await service
      .from('topic_assets').select('storage_path').eq('id', asset.linked_topic_asset_id).maybeSingle()
    if (!topicAsset?.storage_path) return null
    return createTopicAssetSignedUrl(topicAsset.storage_path)
  }
  if (asset.storage_path) {
    return createProgramAssetSignedUrl(asset.storage_path)
  }
  return null
}

export async function deleteProgramAssetFile(storagePath: string): Promise<void> {
  const service = createServiceClient()
  await service.storage.from('program-assets').remove([storagePath])
}
