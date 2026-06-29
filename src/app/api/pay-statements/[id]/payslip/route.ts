export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { generateAndStorePayslip } from '@/lib/payroll/generatePayslip'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth: session required
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Fetch the pay statement with org_id check done via RLS on session client
  const { data: stmt, error: stmtErr } = await service
    .from('pay_statements')
    .select('id, pay_run_id, org_id, user_id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount')
    .eq('id', id)
    .single()

  if (stmtErr || !stmt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Auth check: caller must be org member with owner/admin/manager role
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('org_id', stmt.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const allowedRoles = ['owner', 'admin', 'manager']
  if (!membership || !allowedRoles.includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch employee profile
  const { data: profileRow } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', stmt.user_id)
    .maybeSingle()
  const employeeName = (profileRow?.full_name || profileRow?.email) ?? 'Employee'

  // Fetch org name
  const { data: orgRow } = await service
    .from('organisations')
    .select('name')
    .eq('id', stmt.org_id)
    .maybeSingle()
  const orgName = orgRow?.name ?? 'Organisation'

  // Fetch org owner for uploaded_by
  const { data: ownerRow } = await service
    .from('organisation_members')
    .select('user_id')
    .eq('org_id', stmt.org_id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  const uploadedBy = ownerRow?.user_id ?? stmt.user_id

  const filePath = await generateAndStorePayslip({
    supabase: service,
    payRunId: stmt.pay_run_id as string,
    userId: stmt.user_id as string,
    orgId: stmt.org_id as string,
    orgName,
    employeeName,
    periodStart: stmt.period_start as string,
    periodEnd: stmt.period_end as string,
    approvedSeconds: Number(stmt.approved_seconds),
    hourlyRate: Number(stmt.hourly_rate),
    gross: Number(stmt.gross),
    superRate: Number(stmt.super_rate),
    superAmount: Number(stmt.super_amount),
    uploadedBy: uploadedBy as string,
  })

  if (!filePath) {
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }

  const { data: signedData, error: signErr } = await service.storage
    .from('payslips')
    .createSignedUrl(filePath, 600)

  if (signErr || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Could not create download link' }, { status: 500 })
  }

  return NextResponse.redirect(signedData.signedUrl)
}
