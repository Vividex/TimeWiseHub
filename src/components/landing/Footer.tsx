import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 py-10 px-6 text-center text-sm text-slate-500">
      <p className="font-semibold text-slate-700 mb-2">TimeWiseHub</p>
      <div className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-slate-900 transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-slate-900 transition-colors">
          Privacy
        </Link>
      </div>
      <p className="mt-4">© {new Date().getFullYear()} TimeWiseHub. All rights reserved.</p>
    </footer>
  )
}
