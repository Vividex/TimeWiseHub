import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-10 px-6 text-center text-sm text-slate-500">
      <p className="font-semibold text-slate-300 mb-2">TimeWiseHub</p>
      <div className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-white transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-white transition-colors">
          Privacy
        </Link>
      </div>
      <p className="mt-4">© {new Date().getFullYear()} TimeWiseHub. All rights reserved.</p>
    </footer>
  )
}
