import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendDailyDigest, sendTimesheetDueReminder } from '@/lib/email-notifications'

type NotificationPreferences = {
  deadline_alerts?: boolean
  daily_digest?: boolean
}

type Profile = {
  id: string
  email: string
  full_name: string | null
  notification_preferences: NotificationPreferences | null
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getMonday(date: Date) {
  const monday = new Date(date)
  monday.setUTCHours(0, 0, 0, 0)
  const day = monday.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setUTCDate(monday.getUTCDate() + diff)
  return monday
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'

  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') ?? 'both'
  const force = url.searchParams.get('force') === '1'
  const now = new Date()
  const today = toDateString(now)
  const tomorrowDate = new Date(now)
  tomorrowDate.setUTCDate(now.getUTCDate() + 1)
  const tomorrow = toDateString(tomorrowDate)
  const weekStart = toDateString(getMonday(now))

  const service = createServiceClient()
  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, email, full_name, notification_preferences')
    .not('email', 'is', null)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to load notification recipients' }, { status: 500 })
  }

  const shouldSendDigest = kind === 'both' || kind === 'digest'
  const shouldSendTimesheetReminder = kind === 'both' || kind === 'timesheets'
  const isFriday = now.getUTCDay() === 5
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const profile of (profiles ?? []) as Profile[]) {
    try {
      if (shouldSendDigest) {
        const result = await sendDailyDigest(service, profile, today, tomorrow)
        if ('skipped' in result) skipped += 1
        else sent += 1
      }

      if (shouldSendTimesheetReminder && (force || isFriday)) {
        const result = await sendTimesheetDueReminder(service, profile, weekStart)
        if ('skipped' in result) skipped += 1
        else sent += 1
      }
    } catch (error) {
      failed += 1
      console.error(error)
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, date: today, weekStart })
}
