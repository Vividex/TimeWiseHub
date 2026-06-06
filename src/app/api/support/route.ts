import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/email-notifications'

const ADMIN_EMAIL = 'admin@vividex.au'

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

  // Notify admin — fire and forget, don't fail the request if email errors
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `Bug Report — TimeWiseHub`,
    text: `A bug report was submitted.\n\nUser: ${user.email}\n\nDescription:\n${description}`,
    html: `<p><strong>User:</strong> ${user.email}</p><p><strong>Description:</strong></p><p>${description.replace(/\n/g, '<br>')}</p>`,
  }).catch(err => console.error('Support email failed:', err))

  return NextResponse.json({ ok: true })
}
