import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — TimeWiseHub' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Privacy Policy</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 19 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Who we are</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex operates TimeWiseHub, a workforce management platform. We are based in New South Wales, Australia. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use TimeWiseHub.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Contact: <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. Data we collect</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We collect the following categories of personal information:</p>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li><strong>Account data:</strong> your name, email address, username, and password (stored as a secure hash — we never store your password in plain text).</li>
              <li><strong>Profile data:</strong> job title, start date, profile photo, work hours preferences, Australian state, and any other information you choose to add to your profile.</li>
              <li><strong>Usage data:</strong> time logs, expense records, tasks, leave requests, invoices, payroll records, and chat messages and attachments you create within the platform.</li>
              <li><strong>Payment data:</strong> subscription billing is handled by Stripe. We do not store raw card numbers or full payment details. We store only your Stripe customer ID and subscription status.</li>
              <li><strong>Technical data:</strong> IP address, browser type, and device information, collected automatically for security and service operation purposes.</li>
              <li><strong>AI assistant interactions:</strong> messages you send to the built-in AI assistant and the responses generated. These messages are transmitted to Anthropic (our AI provider) to generate a response. Do not send sensitive personal information through the AI assistant that you would not want processed by a third-party AI service.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. How we use your data</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We use your personal information to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>provide, operate, and maintain the TimeWiseHub service;</li>
              <li>send transactional emails such as account verification, password reset, and platform notifications via Resend;</li>
              <li>process subscription payments and manage your billing via Stripe;</li>
              <li>provide customer support and respond to enquiries;</li>
              <li>detect and prevent fraud, abuse, or security incidents; and</li>
              <li>comply with applicable legal obligations.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>We do not sell your personal information.</strong> We do not use your data for advertising or share it with third parties for their marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. Third-party processors</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We use the following third-party services to operate the platform. Each is bound by a data processing agreement and appropriate security standards.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-600 border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Processor</th>
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Purpose</th>
                    <th className="text-left py-2 font-semibold text-gray-700">Region</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 pr-4 font-medium">Supabase</td>
                    <td className="py-2 pr-4">Database, file storage, authentication</td>
                    <td className="py-2">Australia (ap-southeast-2)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Stripe</td>
                    <td className="py-2 pr-4">Subscription billing and payment processing</td>
                    <td className="py-2">Global</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Resend</td>
                    <td className="py-2 pr-4">Transactional email delivery</td>
                    <td className="py-2">Global</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Daily.co</td>
                    <td className="py-2 pr-4">Video calling infrastructure</td>
                    <td className="py-2">United States</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Anthropic</td>
                    <td className="py-2 pr-4">AI assistant (Claude) — processes messages you send to the assistant</td>
                    <td className="py-2">United States</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Vercel</td>
                    <td className="py-2 pr-4">Application hosting and edge delivery</td>
                    <td className="py-2">Global</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Data retention</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Personal data is retained for as long as your account is active.</li>
              <li>On account deletion, your data is removed from our systems within 30 days.</li>
              <li>Billing and financial records are retained for 7 years as required under Australian taxation law.</li>
              <li>We may retain anonymised, aggregated data that cannot identify you indefinitely.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Your rights</h2>
            <p className="text-sm text-gray-600 leading-relaxed">You have the right to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li><strong>Access</strong> the personal data we hold about you;</li>
              <li><strong>Correct</strong> inaccurate or incomplete data;</li>
              <li><strong>Delete</strong> your personal data (subject to legal retention obligations);</li>
              <li><strong>Object</strong> to certain processing of your data; and</li>
              <li><strong>Portability</strong> — receive your data in a structured, machine-readable format.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              To exercise any of these rights, contact us at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>. We will respond within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Security</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>All data is encrypted in transit using TLS and encrypted at rest.</li>
              <li>Access to production systems is restricted to authorised personnel and is logged.</li>
              <li>To report a security vulnerability, contact <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              No system is completely secure. While we take reasonable steps to protect your data, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Cookies</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We use session cookies only, which are required for authentication and to keep you logged in. We do not use tracking cookies, advertising cookies, or third-party analytics cookies that monitor your behaviour across other websites.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Changes to this policy</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you by email of any material changes before they take effect. The current version is always available at <Link href="/privacy" className="text-cyan-600 hover:underline">/privacy</Link>.
            </p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">
            Questions about this policy? Contact us at{' '}
            <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
          </p>
        </div>
      </div>
    </div>
  )
}
