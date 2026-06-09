import { createServiceClient } from '@/lib/supabase-service'
import { getAustralianPublicHolidays, type AustralianState } from '@/lib/australian-public-holidays'
import { isWithinWorkingHours, resolveQuietHours } from '@/lib/chat/availability'
import type { Availability } from '@/lib/chat/types'

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'manager'])

function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export async function getUserAvailability(userId: string, now = new Date()): Promise<Availability> {
  const supabase = createServiceClient()

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('timezone, au_state, notification_preferences').eq('id', userId).single(),
    supabase.from('organisation_members').select('role').eq('user_id', userId).maybeSingle(),
  ])

  const timezone = profile?.timezone ?? 'Australia/Sydney'
  const quietHours = resolveQuietHours(profile?.notification_preferences?.quiet_hours)
  const today = localDate(now, timezone)

  // Owners, admins, and managers are expected to be contactable outside standard hours.
  const isManagement = MANAGEMENT_ROLES.has(membership?.role ?? '')

  if (!isManagement && !isWithinWorkingHours(now, timezone, quietHours)) {
    return { available: false, reason: 'after_hours' }
  }

  const { data: leave } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .maybeSingle()

  if (leave) {
    return { available: false, reason: 'on_leave' }
  }

  const state = profile?.au_state as AustralianState | null | undefined
  if (state) {
    const year = Number(today.slice(0, 4))
    const isHoliday = getAustralianPublicHolidays(year, state).some(holiday => holiday.date === today)
    if (isHoliday) {
      return { available: false, reason: 'holiday' }
    }
  }

  return { available: true, reason: null }
}
