import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3" aria-label="TimeWiseHub home">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 text-sm font-black text-cyan-200 shadow-lg shadow-cyan-500/20">
            T
          </span>
          <span className="font-bold text-lg text-white">TimeWiseHub</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex">
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#showcase" className="transition-colors hover:text-white">
            Showcase
          </a>
          <a href="#pricing" className="transition-colors hover:text-white">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 transition-colors hover:bg-cyan-300"
          >
            <span className="hidden sm:inline">Get started free</span>
            <span className="sm:hidden">Start</span>
          </Link>
        </div>
      </div>
      <div className="mx-auto mt-3 grid max-w-7xl grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-300 md:hidden">
        <a
          href="#features"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 transition hover:border-cyan-300/40 hover:text-white"
        >
          Features
        </a>
        <a
          href="#showcase"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 transition hover:border-cyan-300/40 hover:text-white"
        >
          Showcase
        </a>
        <a
          href="#pricing"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 transition hover:border-cyan-300/40 hover:text-white"
        >
          Pricing
        </a>
      </div>
    </nav>
  )
}
