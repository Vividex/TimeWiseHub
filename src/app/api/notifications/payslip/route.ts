import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendPayslipUploadedNotification } from '@/lib/email-notifications'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { payslipId?: string } | null
  if (!body?.payslipId) return NextResponse.json({ error: 'Missing payslipId' }, { status: 400 })

  const service = createServiceClient()

  // Verify caller is a manager in the same org
  const { data: payslip, error } = await service
    .from('payslips')
    .select('id, user_id, label, pay_date, org_id')
    .eq('id', body.payslipId)
    .single()

  if (error || !payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

  if (payslip.org_id) {
    const { data: membership } = await service
      .from('organisation_members')
      .select('role')
      .eq('org_id', payslip.org_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin', 'manager'])
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else if (payslip.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await sendPayslipUploadedNotification(service, payslip.user_id, payslip.label, payslip.pay_date)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 })
  }
}
