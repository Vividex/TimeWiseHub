import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import PayslipDocument from '@/components/finance/PayslipDocument'
import type { SupabaseClient } from '@supabase/supabase-js'

type GeneratePayslipArgs = {
  supabase: SupabaseClient
  payRunId: string
  userId: string
  orgId: string
  orgName: string
  employeeName: string
  periodStart: string
  periodEnd: string
  approvedSeconds: number
  hourlyRate: number
  gross: number
  superRate: number
  superAmount: number
  uploadedBy: string
}

export async function generateAndStorePayslip(args: GeneratePayslipArgs): Promise<string | null> {
  const {
    supabase, payRunId, userId, orgId, orgName, employeeName,
    periodStart, periodEnd, approvedSeconds, hourlyRate, gross,
    superRate, superAmount, uploadedBy,
  } = args

  const element = React.createElement(PayslipDocument, {
    employeeName, orgName, periodStart, periodEnd,
    approvedSeconds, hourlyRate, gross, superRate, superAmount,
  }) as unknown as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  const filePath = `${userId}/${payRunId}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('payslips')
    .upload(filePath, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('Payslip upload error:', uploadErr)
    return null
  }

  const label = `Week ending ${periodEnd}`
  await supabase.from('payslips').upsert({
    org_id: orgId,
    user_id: userId,
    label,
    pay_date: periodEnd,
    file_path: filePath,
    uploaded_by: uploadedBy,
  }, { onConflict: 'user_id,pay_date' }).throwOnError()

  return filePath
}
