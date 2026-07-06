export function isOverdue(invoice: { status: string; due_date: string | null }): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') return false
  if (!invoice.due_date) return false
  return invoice.due_date < new Date().toISOString().slice(0, 10)
}
