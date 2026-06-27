import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: call } = await service
    .from('scheduled_calls')
    .select('org_id, transcript')
    .eq('id', callId)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const c = call as unknown as { org_id: string; transcript: string | null }

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', c.org_id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!c.transcript || c.transcript.length < 100) {
    await service
      .from('scheduled_calls')
      .update({ summary: 'Transcript too brief to summarise.' })
      .eq('id', callId)
    return NextResponse.json({ ok: true })
  }

  const prompt = `You are summarising a workplace video call transcript. Produce a structured summary in this exact format — no extra sections, no preamble:

## Summary
<one paragraph overview>

## Key Decisions
- <decision>

## Action Items
- [Person] — <task>

## Next Steps
- <next step>

If information for a section is absent from the transcript, omit that section entirely.

Transcript:
${c.transcript}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const summaryText = message.content[0].type === 'text' ? message.content[0].text : 'Unable to generate summary.'

  await service
    .from('scheduled_calls')
    .update({ summary: summaryText })
    .eq('id', callId)

  return NextResponse.json({ ok: true })
}
