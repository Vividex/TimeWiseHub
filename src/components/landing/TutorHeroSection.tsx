import Image from 'next/image'
import Link from 'next/link'
import dashboardImage from '../../../promo/tutoring-dashboard.png'

const VALUE_ITEMS = [
  'Parent & student profiles',
  'Per-lesson billing',
  'Subject & topic tracking',
  'Progress reports built in',
]

const STATS = [
  { label: 'Setup path', value: 'Free' },
  { label: 'Billing model', value: 'Per-lesson' },
  { label: 'Progress tracking', value: 'Built-in' },
]

export default function TutorHeroSection() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.18),transparent_32%),linear-gradient(145deg,#020617_0%,#07111f_45%,#020617_100%)] px-4 pb-20 pt-32 sm:px-6 lg:pb-28 lg:pt-40">
        <div className="pointer-events-none absolute inset-x-0 top-16 h-64 bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-teal-400/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg shadow-cyan-950/30">
              Built for tutoring & education businesses
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Everything your tutoring business needs, in one place.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Manage students and parents, bill per lesson, track subjects and topics,
              and share progress reports — all from one platform built for tutors.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-6 py-3 text-base font-bold text-slate-950 shadow-xl shadow-cyan-500/25 transition hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                Get started free
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-300/10"
              >
                View features
              </a>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {STATS.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-float relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-cyan-400/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-cyan-200/20 bg-slate-900/70 p-2 shadow-2xl shadow-cyan-950/40">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400/80" />
                <span className="h-3 w-3 rounded-full bg-amber-300/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs font-semibold text-slate-400">timewisehub.app/dashboard</span>
              </div>
              <Image
                src={dashboardImage}
                alt="TimeWiseHub tutoring dashboard overview"
                priority
                sizes="(min-width: 1024px) 56vw, 100vw"
                className="h-auto w-full rounded-xl border border-white/10 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-slate-950 px-4 py-5 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_ITEMS.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-semibold text-slate-200"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
