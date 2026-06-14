import Link from 'next/link'
import { PLANS } from '@/lib/stripe'

const FREE_FEATURES = [
  'Up to 3 projects',
  '30-day history',
  'Team chat (channels & DMs)',
  'Tasks & timesheets',
  'Create & manage invoices',
]

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited projects',
  'Full history',
  'Finance & P&L reporting',
  'AI assistant',
  'Email invoices to clients',
  'Export reports',
]

const BUSINESS_FEATURES = [
  'Everything in Pro',
  'Video calls & scheduling',
  'Roster-driven timesheets',
  'Payroll processing',
  'HR profiles & certifications',
  'Onboarding checklists',
  'Push notifications',
  'Priority support',
]

type CardProps = {
  label: string
  price: string
  note: string
  features: string[]
  highlight: boolean
}

function PricingCard({ label, price, note, features, highlight }: CardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 ${
        highlight
          ? 'bg-cyan-500 text-white ring-2 ring-cyan-400'
          : 'bg-white text-slate-900 ring-1 ring-slate-200'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-cyan-400 text-white">
          Most popular
        </span>
      )}
      <h3 className={`text-xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>{label}</h3>
      <div className="mt-4 flex items-end gap-1">
        <span className={`text-4xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>{price}</span>
        {price !== 'Free' && (
          <span className={`text-sm mb-1 ${highlight ? 'text-cyan-100' : 'text-slate-500'}`}>
            /mo
          </span>
        )}
      </div>
      <p className={`text-sm mt-1 ${highlight ? 'text-cyan-100' : 'text-slate-500'}`}>{note}</p>
      <ul className="mt-6 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 ${highlight ? 'text-cyan-100' : 'text-cyan-500'}`}>✓</span>
            <span className={highlight ? 'text-white' : 'text-slate-600'}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/register"
        className={`mt-8 block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
          highlight
            ? 'bg-white text-cyan-600 hover:bg-cyan-50'
            : 'bg-cyan-500 text-white hover:bg-cyan-600'
        }`}
      >
        Get started free
      </Link>
    </div>
  )
}

export default function PricingSection() {
  return (
    <section className="bg-slate-50 py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-4">
          Simple, transparent pricing
        </h2>
        <p className="text-slate-500 text-center mb-16">
          Start free. Upgrade when your team grows.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <PricingCard
            label={PLANS.free.label}
            price="Free"
            note="Perfect for getting started"
            features={FREE_FEATURES}
            highlight={false}
          />
          <PricingCard
            label={PLANS.pro.label}
            price={`$${PLANS.pro.priceAud}`}
            note="For solo professionals — 1 user"
            features={PRO_FEATURES}
            highlight={true}
          />
          <PricingCard
            label={PLANS.team.label}
            price={`$${PLANS.team.priceAud}`}
            note={`Per ${PLANS.team.unitSize} employees/mo`}
            features={BUSINESS_FEATURES}
            highlight={false}
          />
        </div>
      </div>
    </section>
  )
}
