import Link from 'next/link'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-white via-slate-50 to-cyan-50 pt-16">
      <h1 className="text-5xl md:text-7xl font-bold text-slate-900 max-w-4xl leading-tight">
        Everything your team needs,{' '}
        <span className="text-cyan-500">in one place</span>
      </h1>
      <p className="mt-6 text-xl text-slate-500 max-w-2xl">
        Rostering, timesheets, payroll, chat, tasks, and HR — built for real
        businesses, not enterprise budgets.
      </p>
      <Link
        href="/register"
        className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-cyan-500 text-white text-lg font-semibold hover:bg-cyan-600 transition-colors shadow-lg shadow-cyan-200"
      >
        Get started free
      </Link>
      <p className="mt-4 text-sm text-slate-400">No credit card required</p>
    </section>
  )
}
