import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'TTS not configured.' }, { status: 500 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let text: string
  try {
    const body = await request.json()
    text = typeof body.text === 'string' ? body.text.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'No text provided.' }, { status: 400 })

  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => 'TTS upstream error')
    return NextResponse.json({ error: err }, { status: 502 })
  }

  const audio = await upstream.arrayBuffer()
  return new Response(audio, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}
