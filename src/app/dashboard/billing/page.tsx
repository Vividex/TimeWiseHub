import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isActive } from '@/lib/subscription'
import { PLANS } from '@/lib/stripe'
import { UpgradeButton, ManageButton } from '@/components/billing/BillingClient'

function PlanBadge({ plan }: { plan: string }) {
  const colours: Record<string, string> = {
    free:   'bg-gray-100 text-gray-600',
    pro:    'bg-blue-100 text-blue-700',
    team:   'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`rounded-xl px-3 py-1 text-xs font-black uppercase tracking-wide ${colours[plan] ?? colours.free}`}>
      {plan}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sub = await getSubscription(user.id)
  const { success } = await searchParams
  const active = isActive(sub)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Success banner */}
        {success && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
            Subscription activated — welcome to {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}!
          </div>
        )}

        {/* Past due warning */}
        {sub.status === 'past_due' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            Your last payment failed. Please update your payment method to avoid losing access.
            <ManageButton />
          </div>
        )}

        {/* Current plan */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Current plan</p>
              <div className="mt-2 flex items-center gap-3">
                <p className="text-3xl font-black text-gray-900">{PLANS[sub.plan].label}</p>
                <PlanBadge plan={sub.plan} />
              </div>
              {sub.status === 'trialing' && sub.trial_end && (
                <p className="mt-1 text-sm font-semibold text-blue-600">Trial ends {fmtDate(sub.trial_end)}</p>
              )}
              {active && sub.current_period_end && (
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {sub.cancel_at_period_end
                    ? `Cancels on ${fmtDate(sub.current_period_end)}`
                    : `Renews ${fmtDate(sub.current_period_end)}`}
                </p>
              )}
              {sub.plan === 'team' && (
                <p className="mt-1 text-sm font-semibold text-gray-500">{sub.seats} seat{sub.seats !== 1 ? 's' : ''} · ${(PLANS.team.priceAud * sub.seats).toFixed(2)} AUD/month</p>
              )}
            </div>
            {active && sub.stripe_customer_id && (
              <div className="shrink-0">
                <ManageButton />
              </div>
            )}
          </div>
        </div>

        {/* Upgrade cards — shown when on free or wanting to switch */}
        {(!active || sub.plan === 'free') && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Pro */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg font-black text-gray-900">Pro</p>
                <PlanBadge plan="pro" />
              </div>
              <p className="mb-1 text-3xl font-black text-gray-900">$9.99<span className="text-sm font-semibold text-gray-400">/mo</span></p>
              <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-gray-400">AUD · Individual</p>
              <ul className="mb-6 space-y-2 text-sm font-semibold text-gray-600">
                <li>✓ Unlimited projects</li>
                <li>✓ Full time history</li>
                <li>✓ All features</li>
                <li>✓ Export reports</li>
              </ul>
              <UpgradeButton plan="pro" label="Upgrade to Pro" />
            </div>

            {/* Team */}
            <div className="rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg font-black text-gray-900">Team</p>
                <PlanBadge plan="team" />
              </div>
              <p className="mb-1 text-3xl font-black text-gray-900">$7.99<span className="text-sm font-semibold text-gray-400">/seat/mo</span></p>
              <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-gray-400">AUD · Organisation</p>
              <ul className="mb-6 space-y-2 text-sm font-semibold text-gray-600">
                <li>✓ Everything in Pro</li>
                <li>✓ Unlimited seats</li>
                <li>✓ Manager dashboard</li>
                <li>✓ Expense approvals</li>
                <li>✓ Org shared calendar</li>
              </ul>
              <UpgradeButton plan="team" seats={1} label="Upgrade to Team" />
            </div>

          </div>
        )}

        {/* Free tier limits notice */}
        {sub.plan === 'free' && (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Free tier limits</p>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-gray-600">
              <li>· Up to {PLANS.free.projects} active projects</li>
              <li>· {PLANS.free.historyDays} days time history</li>
              <li>· Individual use only</li>
            </ul>
          </div>
        )}

      </div>
    </div>
  )
}
