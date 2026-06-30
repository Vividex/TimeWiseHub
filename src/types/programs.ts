export type ProgramAssetType =
  | 'pdf' | 'docx' | 'xlsx' | 'image' | 'video' | 'audio' | 'note' | 'link'

export type AiProcessingStatus =
  | 'pending' | 'processing' | 'done' | 'failed' | 'skipped'

export type Program = {
  id: string
  org_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  cover_colour: string
  icon: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type ProgramCategory = {
  id: string
  program_id: string
  parent_id: string | null
  name: string
  description: string | null
  colour: string | null
  icon: string | null
  sort_order: number
  created_at: string
}

export type ProgramAsset = {
  id: string
  program_id: string
  category_id: string | null
  owner_id: string | null
  name: string
  description: string | null
  asset_type: ProgramAssetType
  storage_path: string | null
  file_size_bytes: number | null
  mime_type: string | null
  external_url: string | null
  note_content: string | null
  ai_status: AiProcessingStatus
  ai_summary: string | null
  ai_tags: string[]
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  signed_url?: string | null
}

export type CategoryNode = ProgramCategory & { children: CategoryNode[] }
