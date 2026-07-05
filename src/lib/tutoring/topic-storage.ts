import { createServiceClient } from '@/lib/supabase-service'

export function topicStoragePath(opts: {
  orgId: string | null
  userId: string
  topicId: string
  assetId: string
  filename: string
}): string {
  const prefix = opts.orgId ? opts.orgId : `solo/${opts.userId}`
  return `${prefix}/${opts.topicId}/${opts.assetId}/${opts.filename}`
}

export async function createTopicAssetSignedUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.storage
    .from('topic-assets')
    .createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl ?? null
}

export async function deleteTopicAssetFile(storagePath: string): Promise<void> {
  const service = createServiceClient()
  await service.storage.from('topic-assets').remove([storagePath])
}
