export type InvoicePaymentDetails = {
  account_name?: string
  bsb?: string
  account_number?: string
  pay_id?: string
  instructions?: string
}

type PaymentSource = {
  invoice_payment_details?: InvoicePaymentDetails | null
} | null

export function normaliseInvoicePaymentDetails(value: unknown): InvoicePaymentDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  return {
    account_name: typeof source.account_name === 'string' ? source.account_name : '',
    bsb: typeof source.bsb === 'string' ? source.bsb : '',
    account_number: typeof source.account_number === 'string' ? source.account_number : '',
    pay_id: typeof source.pay_id === 'string' ? source.pay_id : '',
    instructions: typeof source.instructions === 'string' ? source.instructions : '',
  }
}

export function invoicePaymentDetails({
  profile,
  organisation,
}: {
  profile: PaymentSource
  organisation: PaymentSource
}) {
  const orgDetails = normaliseInvoicePaymentDetails(organisation?.invoice_payment_details)
  if (hasInvoicePaymentDetails(orgDetails)) return orgDetails
  return normaliseInvoicePaymentDetails(profile?.invoice_payment_details)
}

export function hasInvoicePaymentDetails(details: InvoicePaymentDetails) {
  return Boolean(
    details.account_name?.trim() ||
    details.bsb?.trim() ||
    details.account_number?.trim() ||
    details.pay_id?.trim() ||
    details.instructions?.trim()
  )
}

export function invoicePaymentLines(details: InvoicePaymentDetails) {
  return [
    details.account_name?.trim() ? `Account name: ${details.account_name.trim()}` : '',
    details.bsb?.trim() ? `BSB: ${details.bsb.trim()}` : '',
    details.account_number?.trim() ? `Account number: ${details.account_number.trim()}` : '',
    details.pay_id?.trim() ? `PayID: ${details.pay_id.trim()}` : '',
    details.instructions?.trim() ? details.instructions.trim() : '',
  ].filter(Boolean)
}
