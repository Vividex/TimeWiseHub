import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { description: string; conversation: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) return NextResponse.json({ error: 'Description is required.' }, { status: 400 })

  const { error } = await supabase.from('support_requests').insert({
    user_id: user.id,
    user_email: user.email,
    description,
    conversation_context: body.conversation ?? null,
    status: 'open',
  })

  if (error) return NextResponse.json({ error: 'Failed to save report.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
