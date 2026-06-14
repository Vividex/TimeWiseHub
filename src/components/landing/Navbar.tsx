import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-[#FAFAF8]/90 backdrop-blur-md border-b border-zinc-200">
      <Link href="/" className="font-['Poppins'] text-lg font-black text-zinc-950 tracking-tight">
        TimeWise<span className="text-cyan-500">Hub</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/login" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
          Sign in
        </Link>
        <Link
          href="/register"
          className="text-sm font-bold px-5 py-2.5 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800 transition-colors"
        >
          Get started free
        </Link>
      </div>
    </nav>
  )
}
