import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-[#FAFAF8] py-10 px-6 text-center text-sm text-zinc-500">
      <p className="font-['Poppins'] font-black text-zinc-900 mb-2">TimeWise<span className="text-cyan-500">Hub</span></p>
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
