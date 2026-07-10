import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-10 text-sm text-slate-500 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold text-slate-200">TimeWiseHub</p>
          <p className="mt-2 max-w-xl">
            All-in-one business management for projects, time, invoices, rosters,
            expenses, communication and AI-powered workflows.
          </p>
        </div>
        <div className="flex gap-5">
          <Link href="/solutions/tutors" className="transition-colors hover:text-white">
            For tutors
          </Link>
          <Link href="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-7xl">© {new Date().getFullYear()} TimeWiseHub. All rights reserved.</p>
    </footer>
  )
}
