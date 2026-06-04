import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendReviewNotification } from '@/lib/email-notifications'

const KINDS = new Set(['leave', 'expense', 'timesheet'])

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { kind?: string; id?: string } | null
  if (!body?.kind || !body.id || !KINDS.has(body.kind)) {
    return NextResponse.json({ error: 'Invalid notification request' }, { status: 400 })
  }

  try {
    await sendReviewNotification(createServiceClient(), body.kind as 'leave' | 'expense' | 'timesheet', body.id, user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 })
  }
}
