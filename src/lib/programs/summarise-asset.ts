import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-service'
import type { ProgramAsset } from '@/types/programs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORMAT_INSTRUCTIONS = `Respond in exactly this format — no preamble, no extra sections:

## Summary
<2-3 sentence summary>

## Tags
tag1, tag2, tag3`

function parseSummaryResponse(text: string): { summary: string; tags: string[] } {
  const summaryMatch = text.match(/## Summary\s*([\s\S]*?)(?=## Tags|$)/i)
  const tagsMatch = text.match(/## Tags\s*([\s\S]*)$/i)
  const summary = summaryMatch ? summaryMatch[1].trim() : text.trim()
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : []
  return { summary, tags }
}

export async function summariseAsset(
  asset: ProgramAsset,
): Promise<{ summary: string; tags: string[] } | null> {
  if (asset.asset_type === 'note') {
    const content = asset.note_content?.trim() ?? ''
    if (content.length < 20) return null

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Summarise this note and suggest a few tags for it.\n\n${FORMAT_INSTRUCTIONS}\n\nNote:\n${content}`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!text) return null
    return parseSummaryResponse(text)
  }

  if (asset.asset_type === 'image' || asset.asset_type === 'pdf') {
    if (!asset.storage_path || !asset.mime_type) return null

    const service = createServiceClient()
    const { data: file, error } = await service.storage
      .from('program-assets')
      .download(asset.storage_path)
    if (error || !file) return null

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
      asset.asset_type === 'image'
        ? {
            type: 'image',
            source: {
              type: 'base64',
              media_type: asset.mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          }
        : {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          { type: 'text', text: `Summarise this file and suggest a few tags for it.\n\n${FORMAT_INSTRUCTIONS}` },
        ],
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!text) return null
    return parseSummaryResponse(text)
  }

  return null
}
