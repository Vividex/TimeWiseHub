import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import { sendEmail } from '@/lib/email-notifications'
import { REASON_LABEL, formatTenure } from '@/lib/account-deactivation'
import type { DeactivationReason } from '@/types/account-deactivation'

const REASONS: DeactivationReason[] = ['too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason, feedback } = await req.json() as { reason?: string; feedback?: string }
  if (!reason || !REASONS.includes(reason as DeactivationReason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const subscription = await getSubscription(user.id)
  if (isPaidPlan(subscription)) {
    return NextResponse.json({ error: 'Cancel your subscription in Billing before deactivating.' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  const service = createServiceClient()
  const now = new Date().toISOString()

  if (membership?.org_id) {
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can deactivate the account.' }, { status: 403 })
    }

    const { data: org } = await service
      .from('organisations').select('name, created_at, deactivated_at').eq('id', membership.org_id).maybeSingle()
    if (!org) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 })
    if (org.deactivated_at) return NextResponse.json({ error: 'Already deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('organisations').update({ deactivated_at: now }).eq('id', membership.org_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { error: insertError } = await service.from('account_deactivations').insert({
      org_id: membership.org_id,
      user_id: null,
      deactivated_by: user.id,
      reason,
      feedback: feedback?.trim() || null,
      deactivated_at: now,
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    await sendDeactivationEmail({
      accountName: org.name,
      reason: reason as DeactivationReason,
      feedback,
      tenure: formatTenure(org.created_at),
    })
  } else {
    const { data: profile } = await service
      .from('profiles').select('full_name, email, created_at, deactivated_at').eq('id', user.id).maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    if (profile.deactivated_at) return NextResponse.json({ error: 'Already deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('profiles').update({ deactivated_at: now }).eq('id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { error: insertError } = await service.from('account_deactivations').insert({
      org_id: null,
      user_id: user.id,
      deactivated_by: user.id,
      reason,
      feedback: feedback?.trim() || null,
      deactivated_at: now,
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    await sendDeactivationEmail({
      accountName: profile.full_name || profile.email || user.email || 'Unknown user',
      reason: reason as DeactivationReason,
      feedback,
      tenure: formatTenure(profile.created_at),
    })
  }

  return NextResponse.json({ success: true })
}

async function sendDeactivationEmail({ accountName, reason, feedback, tenure }: {
  accountName: string
  reason: DeactivationReason
  feedback?: string
  tenure: string
}) {
  const to = process.env.OPERATOR_NOTIFICATION_EMAIL
  if (!to) {
    console.warn('OPERATOR_NOTIFICATION_EMAIL is not set — skipping deactivation notification email.')
    return
  }

  const lines = [
    `Account: ${accountName}`,
    `Reason: ${REASON_LABEL[reason]}`,
    `Customer for: ${tenure}`,
    feedback?.trim() ? `Feedback: ${feedback.trim()}` : null,
  ].filter((line): line is string => !!line)

  try {
    await sendEmail({
      to,
      subject: `Account deactivated — ${accountName}`,
      text: lines.join('\n'),
      html: `<p>${lines.join('<br>')}</p>`,
    })
  } catch (err) {
    console.error('Failed to send deactivation notification email:', err)
  }
}
