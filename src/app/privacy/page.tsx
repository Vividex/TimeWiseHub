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
            <p className="mt-2 text-sm text-gray-500">Last updated: 4 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Who we are</h2>
            <p className="text-sm text-gray-600 leading-relaxed">TimeWiseHub is operated by Vividex. We provide a cloud-based productivity platform for tracking work hours, managing expenses, and organising projects. You can contact us at <a href="mailto:abbotts.automotive@gmail.com" className="text-cyan-600 hover:underline">abbotts.automotive@gmail.com</a>.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. What data we collect</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li><strong>Account data:</strong> email address, full name, timezone, and password (stored as a secure hash by Supabase Auth).</li>
              <li><strong>Time entries:</strong> start/end times, durations, and descriptions you log.</li>
              <li><strong>Expenses:</strong> amounts, currencies, categories, dates, descriptions, and any receipt images you upload.</li>
              <li><strong>Projects and tasks:</strong> names, descriptions, due dates, priorities, and notes you create.</li>
              <li><strong>Activity log:</strong> a timestamped record of actions taken within the platform (creates, updates, deletes).</li>
              <li><strong>Billing data:</strong> subscription plan and status. Payment card details are handled entirely by Stripe and never stored on our servers.</li>
              <li><strong>Push subscriptions:</strong> browser push endpoints if you opt in to notifications.</li>
              <li><strong>Technical data:</strong> authentication tokens (session cookies), and basic server logs.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. How we use your data</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>To provide and operate the TimeWiseHub service.</li>
              <li>To send transactional emails (account verification, password reset, billing receipts).</li>
              <li>To send push notifications if you have opted in.</li>
              <li>To process subscription payments via Stripe.</li>
              <li>To improve the product based on aggregate, anonymised usage patterns.</li>
            </ul>
            <p className="text-sm text-gray-600">We do not sell your data to third parties.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. Data storage and security</h2>
            <p className="text-sm text-gray-600 leading-relaxed">Your data is stored in Supabase (PostgreSQL), hosted on AWS infrastructure. All data is encrypted in transit (TLS) and at rest. Row-level security policies ensure users can only access their own data. The application is deployed on Vercel with HTTPS enforced.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Your rights (GDPR)</h2>
            <p className="text-sm text-gray-600">If you are in the EEA or UK, you have the right to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li><strong>Access</strong> your data — use the "Download my data" button in Settings at any time.</li>
              <li><strong>Rectification</strong> — update your profile in Settings.</li>
              <li><strong>Erasure</strong> — contact us to request account deletion. All your data will be permanently removed within 30 days.</li>
              <li><strong>Data portability</strong> — your data export (Settings → Download my data) is in machine-readable JSON format.</li>
              <li><strong>Object to processing</strong> — contact us at the email above.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Third-party services</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
              <li><strong>Vercel</strong> — application hosting and CDN.</li>
              <li><strong>Stripe</strong> — payment processing. Stripe&apos;s privacy policy applies to payment data.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Data retention</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We retain your data for as long as your account is active. On account deletion, all personal data is removed within 30 days. Stripe retains billing records as required by financial regulations.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Cookies</h2>
            <p className="text-sm text-gray-600">We use essential session cookies for authentication. See our <Link href="/cookies" className="text-cyan-600 hover:underline">Cookie Policy</Link> for details.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Changes to this policy</h2>
            <p className="text-sm text-gray-600 leading-relaxed">We may update this policy from time to time. Material changes will be notified by email. Continued use of the service after changes constitutes acceptance.</p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">Questions? Contact us at <a href="mailto:abbotts.automotive@gmail.com" className="text-cyan-600 hover:underline">abbotts.automotive@gmail.com</a></p>
        </div>
      </div>
    </div>
  )
}

