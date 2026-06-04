import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendScheduledReportEmail } from '@/lib/email-notifications'

type Profile = {
  id: string
  email: string
  full_name: string | null
  notification_preferences: {
    scheduled_reports?: boolean
  } | null
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Allow unauthenticated only in local dev (Vercel sets VERCEL=1 on all deployments)
    return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  }
  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  const now = new Date()
  const isMonday = now.getUTCDay() === 1

  if (!force && !isMonday) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0, reason: 'Scheduled reports send on Mondays' })
  }

  const toDate = new Date(now)
  toDate.setUTCDate(now.getUTCDate() - 1)
  const fromDate = new Date(toDate)
  fromDate.setUTCDate(toDate.getUTCDate() - 6)

  const service = createServiceClient()
  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, email, full_name, notification_preferences')
    .not('email', 'is', null)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to load scheduled report recipients' }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const profile of (profiles ?? []) as Profile[]) {
    try {
      const result = await sendScheduledReportEmail(service, profile, toDateString(fromDate), toDateString(toDate))
      if ('skipped' in result) skipped += 1
      else sent += 1
    } catch (error) {
      failed += 1
      console.error(error)
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    failed,
    fromDate: toDateString(fromDate),
    toDate: toDateString(toDate),
  })
}
