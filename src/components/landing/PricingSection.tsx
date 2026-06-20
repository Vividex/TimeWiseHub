import Link from 'next/link'
import { PLANS } from '@/lib/stripe'

const FREE_FEATURES = [
  'Up to 3 projects',
  '30-day history',
  'Team chat',
  'Tasks and timesheets',
  'Create invoices',
]

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited projects',
  'Full history',
  'Finance and P&L reporting',
  'AI assistant',
  'Email invoices to clients',
]

const BUSINESS_FEATURES = [
  'Everything in Pro',
  'Video calls and scheduling',
  'Roster-driven timesheets',
  'Payroll processing',
  'HR profiles and certifications',
  'Priority support',
]

type CardProps = {
  label: string
  price: string
  note: string
  features: string[]
  highlight?: boolean
}

function PricingCard({ label, price, note, features, highlight = false }: CardProps) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl border p-6 shadow-2xl transition duration-300 hover:-translate-y-1 ${
        highlight
          ? 'border-cyan-300/60 bg-cyan-300 text-slate-950 shadow-cyan-950/40'
          : 'border-white/10 bg-white/[0.035] text-white shadow-slate-950/30'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan-700">
          Most popular
        </span>
      )}
      <h3 className={`text-xl font-black ${highlight ? 'text-slate-950' : 'text-white'}`}>{label}</h3>
      <div className="mt-5 flex items-end gap-1">
        <span className={`text-4xl font-black ${highlight ? 'text-slate-950' : 'text-white'}`}>
          {price}
        </span>
        {price !== 'Free' && (
          <span className={`mb-1 text-sm ${highlight ? 'text-slate-700' : 'text-slate-400'}`}>
            /mo
          </span>
        )}
      </div>
      <p className={`mt-2 text-sm ${highlight ? 'text-slate-700' : 'text-slate-400'}`}>{note}</p>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-black ${
                highlight ? 'bg-slate-950 text-cyan-200' : 'bg-cyan-300/10 text-cyan-200'
              }`}
            >
              ✓
            </span>
            <span className={highlight ? 'text-slate-800' : 'text-slate-300'}>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/register"
        className={`mt-8 rounded-xl px-5 py-3 text-center text-sm font-bold transition ${
          highlight
            ? 'bg-slate-950 text-white hover:bg-slate-800'
            : 'border border-white/15 bg-white/5 text-white hover:border-cyan-300/40 hover:bg-cyan-300/10'
        }`}
      >
        Get started free
      </Link>
    </article>
  )
}

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-slate-950 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Pricing</p>
          <h2 className="mt-4 text-4xl font-black text-white md:text-5xl">
            Start lean. Scale when the team grows.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">
            Keep the platform simple at the start, then unlock deeper reporting, AI,
            rostering and team operations as your business needs them.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <PricingCard
            label={PLANS.free.label}
            price="Free"
            note="For testing the core workflow"
            features={FREE_FEATURES}
          />
          <PricingCard
            label={PLANS.pro.label}
            price={`$${PLANS.pro.priceAud}`}
            note="For solo professionals"
            features={PRO_FEATURES}
            highlight
          />
          <PricingCard
            label={PLANS.team.label}
            price={`$${PLANS.team.priceAud}`}
            note={`Per ${PLANS.team.unitSize} employees/mo`}
            features={BUSINESS_FEATURES}
          />
        </div>

        <div className="mt-16 overflow-hidden rounded-2xl border border-cyan-200/20 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.18),transparent_40%),rgba(255,255,255,0.035)] p-8 text-center shadow-2xl shadow-cyan-950/25 md:p-10">
          <h3 className="text-3xl font-black text-white">Bring every workflow into one hub.</h3>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Create your workspace, invite your team and start managing daily operations
            without stitching together separate tools.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex justify-center rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="inline-flex justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/10"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
