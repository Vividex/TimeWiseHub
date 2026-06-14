import Link from 'next/link'
import { PLANS } from '@/lib/stripe'

const FREE_FEATURES = [
  'Up to 3 projects',
  '30-day history',
  'Team chat (channels & DMs)',
  'Tasks & timesheets',
  'Basic invoicing',
]

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited projects',
  'Full history',
  'Finance & P&L reporting',
  'AI assistant',
  'Payslip vault',
]

const BUSINESS_FEATURES = [
  'Everything in Pro',
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
          ? 'bg-zinc-950 text-white'
          : 'bg-white text-zinc-900 ring-1 ring-zinc-200'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full bg-cyan-500 text-white tracking-wide">
          Most popular
        </span>
      )}
      <h3 className={`text-sm font-bold tracking-widest uppercase ${highlight ? 'text-zinc-400' : 'text-zinc-400'}`}>
        {label}
      </h3>
      <div className="mt-4 flex items-end gap-1">
        <span className={`font-['Poppins'] text-5xl font-black ${highlight ? 'text-white' : 'text-zinc-950'}`}>
          {price}
        </span>
        {price !== 'Free' && (
          <span className={`text-sm mb-2 ml-1 ${highlight ? 'text-zinc-500' : 'text-zinc-400'}`}>/mo</span>
        )}
      </div>
      <p className={`text-sm mt-1 mb-6 ${highlight ? 'text-zinc-500' : 'text-zinc-400'}`}>{note}</p>
      <div className={`h-px w-full mb-6 ${highlight ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
      <ul className="space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 text-cyan-500 shrink-0">✓</span>
            <span className={highlight ? 'text-zinc-300' : 'text-zinc-600'}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/register"
        className={`mt-8 block text-center py-3.5 rounded-xl font-bold text-sm transition-colors tracking-wide ${
          highlight
            ? 'bg-cyan-500 text-white hover:bg-cyan-400'
            : 'bg-zinc-950 text-white hover:bg-zinc-800'
        }`}
      >
        Get started free
      </Link>
    </div>
  )
}

export default function PricingSection() {
  return (
    <section className="landing bg-[#FAFAF8] py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="block h-px w-10 bg-cyan-500 shrink-0" />
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-cyan-600">Pricing</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-zinc-950 mb-4">
          Simple,<br className="hidden sm:block" /> transparent pricing.
        </h2>
        <p className="text-zinc-500 mb-16">
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
            note="For growing teams"
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
