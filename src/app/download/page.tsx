import Link from 'next/link'

const LATEST_VERSION = '0.1.7'
const WINDOWS_DOWNLOAD_URL = `https://github.com/Vividex/TimeWiseHub/releases/download/v${LATEST_VERSION}/TimeWiseHub_${LATEST_VERSION}_x64-setup.exe`
const RELEASES_URL = 'https://github.com/Vividex/TimeWiseHub/releases'

export const metadata = {
  title: 'Download TimeWiseHub — Desktop App for Windows',
  description: 'Download the TimeWiseHub desktop app for Windows. Track time, manage expenses, and stay on top of deadlines from your desktop.',
}

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="font-['Poppins'] text-xl font-black tracking-tight text-white">
            TimeWiseHub
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-cyan-400">Desktop App</p>
          <h1 className="font-['Poppins'] text-4xl font-black tracking-tight text-white sm:text-5xl">
            TimeWiseHub for Windows
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-slate-400">
            The full TimeWiseHub experience as a native desktop app. Track time, manage expenses, and hit every deadline — without opening a browser.
          </p>

          <div className="mt-12 flex flex-col items-center gap-4">
            <a
              href={WINDOWS_DOWNLOAD_URL}
              className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-8 py-4 text-base font-bold"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 16l-6-6h4V4h4v6h4l-6 6zM4 18h16v2H4v-2z" />
              </svg>
              Download for Windows — v{LATEST_VERSION}
            </a>
            <p className="text-xs font-medium text-slate-500">
              Windows 10 or later · 64-bit · Free installer
            </p>
          </div>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            { title: 'Works offline', body: "Log time and expenses even without an internet connection. Syncs when you're back online." },
            { title: 'Runs in the background', body: "Idle detection and nudges work while the app is minimised — no browser tab needed." },
            { title: 'Always up to date', body: "The desktop app connects to your live TimeWiseHub account. Your data is always in sync." },
          ].map(({ title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-800/50 p-6">
              <h3 className="font-['Poppins'] text-base font-black text-white">{title}</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-slate-800 bg-slate-800/50 p-8">
          <h2 className="font-['Poppins'] text-lg font-black text-white">System requirements</h2>
          <ul className="mt-4 space-y-2 text-sm font-medium text-slate-400">
            <li>Windows 10 or Windows 11 (64-bit)</li>
            <li>~50 MB disk space</li>
            <li>Internet connection required to sync with your account</li>
          </ul>
          <p className="mt-6 text-xs text-slate-500">
            Mac and Linux versions are planned for a future release.{' '}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
              View all releases on GitHub →
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
