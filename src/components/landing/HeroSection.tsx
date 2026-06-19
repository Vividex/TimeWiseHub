import Link from 'next/link'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pt-16">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <h1 className="relative text-5xl md:text-7xl font-bold text-white max-w-4xl leading-tight">
        Everything your team needs,{' '}
        <span className="text-cyan-400">in one place</span>
      </h1>
      <p className="relative mt-6 text-xl text-slate-400 max-w-2xl">
        Rostering, timesheets, payroll, chat, tasks, and HR — built for real
        businesses, not enterprise budgets.
      </p>
      <Link
        href="/register"
        className="relative mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-cyan-500 text-white text-lg font-semibold hover:bg-cyan-600 transition-colors shadow-lg shadow-cyan-500/30"
      >
        Get started free
      </Link>
      <p className="relative mt-4 text-sm text-slate-500">No credit card required</p>
    </section>
  )
}
