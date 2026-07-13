import Image, { type StaticImageData } from 'next/image'
import dashboard from '../../../promo/pc dashboard.png'
import insights from '../../../promo/pc insights.png'
import invoices from '../../../promo/pc invoices.png'
import rostering from '../../../promo/pc rostering.png'
import client from '../../../promo/pc client.png'
import vehicles from '../../../promo/pc vehicles.png'
import assistant from '../../../promo/pc ai.png'
import chat from '../../../promo/pc team chat.png'
import hrProfiles from '../../../promo/pc hr profiles.png'
import projects from '../../../promo/pc clients projects and tasks.png'

type ShowcaseItem = {
  label: string
  image: StaticImageData
  alt: string
}

export const SHOWCASE_IMAGES: ShowcaseItem[] = [
  { label: 'Dashboard', image: dashboard, alt: 'TimeWiseHub dashboard screen' },
  { label: 'Insights', image: insights, alt: 'TimeWiseHub insights and reporting screen' },
  { label: 'Invoices', image: invoices, alt: 'TimeWiseHub invoices screen' },
  { label: 'Roster', image: rostering, alt: 'TimeWiseHub rostering screen' },
  { label: 'Clients', image: client, alt: 'TimeWiseHub client management screen' },
  { label: 'Vehicles', image: vehicles, alt: 'TimeWiseHub vehicle tracking screen' },
  { label: 'Assistant', image: assistant, alt: 'TimeWiseHub AI assistant screen' },
  { label: 'Chat', image: chat, alt: 'TimeWiseHub team chat screen' },
  { label: 'Team', image: hrProfiles, alt: 'TimeWiseHub HR profiles screen' },
  { label: 'Projects', image: projects, alt: 'TimeWiseHub clients projects and tasks screen' },
]

const FEATURES = [
  {
    title: 'Time tracking',
    body: 'Capture billable and internal time with clean approvals and week-by-week visibility.',
    href: '#showcase',
  },
  {
    title: 'Projects and tasks',
    body: 'Plan client work, assign tasks, track progress and keep documents close to the work.',
    href: '#showcase',
  },
  {
    title: 'Invoices and quotes',
    body: 'Create branded quotes and invoices, send them to clients and monitor payment status.',
    href: '#showcase',
  },
  {
    title: 'Rosters and leave',
    body: 'Build rosters, manage availability, approve leave and keep shifts connected to timesheets.',
    href: '#showcase',
  },
  {
    title: 'Vehicle tracking',
    body: 'Track rego, servicing and odometer readings for every company vehicle, with costs feeding straight into expenses.',
    href: '#showcase',
  },
  {
    title: 'Team chat and video',
    body: 'Keep team conversations, direct messages, groups and scheduled calls in the same workspace.',
    href: '#showcase',
  },
  {
    title: 'AI assistant',
    body: 'Use AI-powered workflows to search business context, draft actions and move faster.',
    href: '#showcase',
  },
  {
    title: 'Insights and reporting',
    body: 'See revenue, project health, time trends and operational metrics without spreadsheet work.',
    href: '#showcase',
  },
  {
    title: 'Clients and sessions',
    body: 'Manage clients, progress notes, sessions, payments and project history from one profile.',
    href: '#showcase',
  },
]

function ShowcaseCard({ item, priority = false }: { item: ShowcaseItem; priority?: boolean }) {
  return (
    <a
      href={item.image.src}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${item.label} product screenshot`}
      className="group w-[320px] shrink-0 overflow-hidden rounded-2xl border border-cyan-200/15 bg-slate-900/85 p-2 shadow-2xl shadow-slate-950/50 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-cyan-950/40 focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:w-[520px]"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-bold text-white">{item.label}</span>
        <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
          Live view
        </span>
      </div>
      <Image
        src={item.image}
        alt={item.alt}
        priority={priority}
        sizes="(min-width: 640px) 520px, 320px"
        className="aspect-[16/10] w-full rounded-xl border border-white/10 object-cover"
      />
    </a>
  )
}

export default function FeatureCarousel() {
  const marqueeItems = [...SHOWCASE_IMAGES, ...SHOWCASE_IMAGES]

  return (
    <>
      <section id="features" className="bg-slate-950 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Platform</p>
            <h2 className="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
              The operating layer for modern small teams.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              TimeWiseHub brings the daily work of running a business into one focused,
              professional workspace.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <a
                href={feature.href}
                key={feature.title}
                className="landing-rise rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-cyan-300/[0.06] focus:outline-none focus:ring-2 focus:ring-cyan-300"
                aria-label={`View product showcase for ${feature.title}`}
              >
                <div className="mb-5 h-1.5 w-12 rounded-full bg-cyan-300 shadow-lg shadow-cyan-400/40" />
                <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{feature.body}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section
        id="showcase"
        className="overflow-hidden border-y border-white/10 bg-[linear-gradient(180deg,#020617_0%,#07111f_52%,#020617_100%)] py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">
                Product showcase
              </p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
                Real product screens, polished for every workflow.
              </h2>
            </div>
            <p className="text-lg leading-8 text-slate-400">
              Browse the dashboard, insights, invoices, roster, clients, assistant, chat,
              team and project views. Hover the showcase to pause the motion.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-[1.75rem] border border-cyan-200/15 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-950/30">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold text-white">{SHOWCASE_IMAGES[0].label}</span>
              <a
                href={SHOWCASE_IMAGES[0].image.src}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                Command centre
              </a>
            </div>
            <a
              href={SHOWCASE_IMAGES[0].image.src}
              target="_blank"
              rel="noreferrer"
              aria-label="Open Dashboard product screenshot"
              className="block focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <Image
                src={SHOWCASE_IMAGES[0].image}
                alt={SHOWCASE_IMAGES[0].alt}
                priority
                sizes="(min-width: 1280px) 1216px, 100vw"
                className="h-auto w-full rounded-2xl border border-white/10 object-cover"
              />
            </a>
          </div>
        </div>

        <div className="landing-marquee mt-12">
          <div className="landing-marquee-track flex gap-5">
            {marqueeItems.map((item, index) => (
              <ShowcaseCard item={item} key={`${item.label}-${index}`} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
