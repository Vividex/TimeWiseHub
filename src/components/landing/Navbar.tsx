import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur border-b border-slate-100">
      <span className="font-bold text-lg text-slate-900">TimeWiseHub</span>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          Get started free
        </Link>
      </div>
    </nav>
  )
}
