import type { SupabaseClient } from '@supabase/supabase-js'

export type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'annually'
export type ReviewStatus = 'submitted' | 'approved' | 'rejected'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  submitted: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
}
export const REVIEW_STATUS_COLOUR: Record<ReviewStatus, string> = {
  submitted: 'bg-amber-50 text-amber-600',
  approved: 'bg-green-50 text-green-600',
  rejected: 'bg-red-50 text-red-600',
}

export function addInterval(dateStr: string, interval: RecurrenceInterval): string {
  const date = new Date(`${dateStr}T00:00:00`)
  switch (interval) {
    case 'weekly': date.setDate(date.getDate() + 7); break
    case 'fortnightly': date.setDate(date.getDate() + 14); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'annually': date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().slice(0, 10)
}

/** Days from the viewer's local "today" until `dateStr` — negative means overdue. */
export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export type RecurringExpenseTemplate = {
  id: string
  org_id: string | null
  user_id: string
  amount: number
  currency: string
  category_id: string | null
  description: string | null
  recurrence_interval: RecurrenceInterval
  next_billing_date: string
  is_business: boolean
}

/**
 * Marks one billing cycle of a recurring expense as paid: inserts a new, already-approved
 * transaction row for this cycle (so it shows up correctly in date-range reports — it's a real
 * historical record, not a mutation of the template), then advances the template's own
 * next_billing_date. This is the one shared path for both the manual "Mark paid" buttons and the
 * process-recurring-expenses cron — never overwrite a recurring template's own expense_date in
 * place, that erases the history a date-bucketed report needs.
 *
 * `recordedBy` is whoever performed the action (the acting user for manual clicks; the template's
 * own owner for the cron) — for a business expense marked paid by an admin/owner other than the
 * original creator, RLS requires the new row's user_id to match the actor, so it may differ from
 * `template.user_id`.
 */
export async function markExpenseCyclePaid(
  supabase: SupabaseClient,
  template: RecurringExpenseTemplate,
  recordedBy: string,
): Promise<{ error: string | null }> {
  const { error: insertError } = await supabase.from('expenses').insert({
    org_id: template.org_id,
    user_id: recordedBy,
    amount: template.amount,
    currency: template.currency,
    category_id: template.category_id,
    description: template.description,
    expense_date: template.next_billing_date,
    receipt_path: null,
    status: 'approved',
    is_business: template.is_business,
    is_recurring: false,
    recurrence_interval: null,
    next_billing_date: null,
  })
  if (insertError) return { error: insertError.message }

  const nextDate = addInterval(template.next_billing_date, template.recurrence_interval)
  const { error: updateError } = await supabase
    .from('expenses')
    .update({ next_billing_date: nextDate })
    .eq('id', template.id)

  return { error: updateError?.message ?? null }
}
