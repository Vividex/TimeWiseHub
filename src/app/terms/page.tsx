import Link from 'next/link'

export const metadata = { title: 'Terms of Service — TimeWiseHub' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-blue-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Terms of Service</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 4 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Acceptance</h2>
            <p className="text-sm text-gray-600 leading-relaxed">By creating an account or using TimeWiseHub, you agree to these Terms. If you are using TimeWiseHub on behalf of an organisation, you confirm you have authority to bind that organisation to these Terms.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. Account</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>You must provide accurate information when registering.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must be at least 16 years old to use the service.</li>
              <li>One person or organisation may not maintain more than one free account.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. Subscriptions and billing</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Paid plans are billed monthly in advance in AUD.</li>
              <li>You may cancel at any time. Access continues until the end of the current billing period.</li>
              <li>We reserve the right to change pricing with 30 days&apos; notice.</li>
              <li>Refunds are issued at our discretion for billing errors.</li>
              <li>The Team plan is billed per seat. Adding members increases your monthly charge at the next billing cycle.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. Acceptable use</h2>
            <p className="text-sm text-gray-600">You agree not to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>Use the service for any unlawful purpose.</li>
              <li>Attempt to gain unauthorised access to other accounts or systems.</li>
              <li>Upload malicious files or content.</li>
              <li>Interfere with the performance or availability of the service.</li>
              <li>Reverse engineer or attempt to extract the source code.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Your data</h2>
            <p className="text-sm text-gray-600 leading-relaxed">You own your data. We only use it to provide the service as described in our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>. You can export or delete your data at any time.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Service availability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We aim for high availability but do not guarantee uninterrupted service. We are not liable for losses arising from downtime, data loss, or service interruptions.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Limitation of liability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">To the maximum extent permitted by law, Vividex&apos;s total liability to you for any claims arising from use of the service is limited to the amount you paid in the 12 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Termination</h2>
            <p className="text-sm text-gray-600 leading-relaxed">You may close your account at any time. We may suspend or terminate accounts that violate these Terms, with or without notice. Upon termination, your data will be deleted within 30 days.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Governing law</h2>
            <p className="text-sm text-gray-600 leading-relaxed">These Terms are governed by the laws of Queensland, Australia. Disputes will be resolved in the courts of Queensland.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">10. Changes</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We may update these Terms. Material changes will be notified by email at least 14 days in advance. Continued use of the service after changes constitutes acceptance.</p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">Questions? Contact us at <a href="mailto:abbotts.automotive@gmail.com" className="text-blue-600 hover:underline">abbotts.automotive@gmail.com</a></p>
        </div>
      </div>
    </div>
  )
}
