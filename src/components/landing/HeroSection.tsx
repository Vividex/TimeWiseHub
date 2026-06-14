import Link from 'next/link'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-slate-900 via-slate-800 to-violet-950 pt-16">
      <h1 className="text-5xl md:text-7xl font-bold text-white max-w-4xl leading-tight">
        Everything your team needs,{' '}
        <span className="text-violet-400">in one place</span>
      </h1>
      <p className="mt-6 text-xl text-slate-300 max-w-2xl">
        Rostering, timesheets, payroll, chat, tasks, and HR — built for real
        businesses, not enterprise budgets.
      </p>
      <Link
        href="/register"
        className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet-600 text-white text-lg font-semibold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-900/40"
      >
        Get started free
      </Link>
      <p className="mt-4 text-sm text-slate-500">No credit card required</p>
    </section>
  )
}
