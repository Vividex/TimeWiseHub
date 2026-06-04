import Link from 'next/link'

export const metadata = { title: 'Cookie Policy — TimeWiseHub' }

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-blue-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Cookie Policy</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 4 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">What are cookies?</h2>
            <p className="text-sm text-gray-600 leading-relaxed">Cookies are small text files stored on your device by your browser. They allow websites to remember your preferences and keep you signed in between visits.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Cookies we use</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400 pr-4">Name</th>
                    <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400 pr-4">Purpose</th>
                    <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400 pr-4">Type</th>
                    <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-700">sb-*</td>
                    <td className="py-3 pr-4 text-gray-600">Supabase authentication session — keeps you logged in</td>
                    <td className="py-3 pr-4 text-gray-600">Essential</td>
                    <td className="py-3 text-gray-600">1 week (refreshed on activity)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-700">cookie_consent</td>
                    <td className="py-3 pr-4 text-gray-600">Stores your cookie consent preference</td>
                    <td className="py-3 pr-4 text-gray-600">Functional</td>
                    <td className="py-3 text-gray-600">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-600">We do not use advertising or analytics cookies. We do not use third-party tracking cookies.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Managing cookies</h2>
            <p className="text-sm text-gray-600 leading-relaxed">You can control cookies through your browser settings. Disabling the authentication cookie (<code className="rounded bg-gray-100 px-1 font-mono text-xs">sb-*</code>) will prevent you from staying signed in.</p>
            <p className="text-sm text-gray-600">Most browsers allow you to view, manage, and delete cookies. Visit your browser&apos;s help documentation for instructions.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Local storage</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We also use browser local storage to store your notification and UI preferences (such as dismissing banners). This data stays on your device and is never sent to our servers.</p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">Questions? Contact us at <a href="mailto:abbotts.automotive@gmail.com" className="text-blue-600 hover:underline">abbotts.automotive@gmail.com</a></p>
        </div>
      </div>
    </div>
  )
}
