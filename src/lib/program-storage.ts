import { createServiceClient } from '@/lib/supabase-service'

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

export async function deleteProgramAssetFile(storagePath: string): Promise<void> {
  const service = createServiceClient()
  await service.storage.from('program-assets').remove([storagePath])
}
