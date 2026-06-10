import { effectivePlan, type Subscription } from '@/lib/subscription'

type ProfileLetterhead = {
  full_name: string | null
  email: string | null
  invoice_letterhead?: string | null
}

type OrganisationLetterhead = {
  name: string | null
  invoice_letterhead?: string | null
} | null

export function invoiceLetterhead({
  profile,
  organisation,
  subscription,
}: {
  profile: ProfileLetterhead | null
  organisation: OrganisationLetterhead
  subscription: Subscription
}) {
  const plan = effectivePlan(subscription)

  if (plan === 'team' && organisation) {
    return organisation.invoice_letterhead?.trim() || organisation.name || 'TimeWiseHub'
  }

  if (plan === 'pro') {
    return profile?.invoice_letterhead?.trim() || profile?.full_name || profile?.email || 'TimeWiseHub'
  }

  return 'TimeWiseHub'
}
