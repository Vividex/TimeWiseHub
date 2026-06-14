import Link from 'next/link'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 pt-24 pb-16 overflow-hidden bg-[#FAFAF8]">

      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #D4D4D8 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.55,
        }}
      />

      {/* Large watermark word — right-anchored, very subtle */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none overflow-hidden leading-none">
        <span className="font-['Poppins'] font-black text-zinc-100" style={{ fontSize: 'clamp(7rem,20vw,20rem)' }}>
          TIME
        </span>
      </div>

      <div className="relative max-w-6xl mx-auto w-full">

        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-10">
          <span className="block h-px w-10 bg-cyan-500 shrink-0" />
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-cyan-600">
            All-in-one team management
          </span>
        </div>

        {/* Headline */}
        <h1
          className="font-black text-zinc-950 leading-[0.92] mb-8"
          style={{ fontSize: 'clamp(3.2rem,8.5vw,7.5rem)' }}
        >
          Your team.<br />
          Your time.<br />
          <span className="text-cyan-500">Your way.</span>
        </h1>

        <p className="text-lg text-zinc-500 max-w-lg mb-12 leading-relaxed">
          Rostering, timesheets, payroll, chat, tasks, and HR —
          built for real businesses, not enterprise budgets.
        </p>

        <div className="flex flex-wrap items-center gap-5">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-zinc-950 text-white text-sm font-bold tracking-wide hover:bg-zinc-800 transition-colors"
          >
            Get started free
            <span className="text-cyan-400 text-base">→</span>
          </Link>
          <span className="text-sm text-zinc-400">No credit card required</span>
        </div>

        {/* Feature teasers */}
        <div className="mt-20 pt-8 border-t border-zinc-200 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { label: 'Roster', sub: 'Build in minutes' },
            { label: 'Payroll', sub: 'One click' },
            { label: 'HR', sub: 'Stay compliant' },
            { label: 'Chat', sub: 'Built in' },
          ].map(({ label, sub }) => (
            <div key={label}>
              <p className="font-['Poppins'] text-xl font-black text-zinc-900">{label}</p>
              <p className="text-xs text-zinc-400 mt-1 tracking-wide">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
