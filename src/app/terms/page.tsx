import Link from 'next/link'

export const metadata = { title: 'Terms of Service — TimeWiseHub' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub by Vividex</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Terms of Service</h1>
            <p className="mt-2 text-sm text-gray-500">Last updated: 14 June 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">1. Acceptance</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              By creating an account or using TimeWiseHub, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are using TimeWiseHub on behalf of an organisation, you represent and warrant that you have the authority to bind that organisation to these Terms, in which case &quot;you&quot; refers to that organisation.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              If you do not agree to these Terms, do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">2. Accounts</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>You must provide accurate and complete information when registering.</li>
              <li>You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.</li>
              <li>You must be at least 16 years old to use the service.</li>
              <li>One person or organisation may not maintain more than one free account.</li>
              <li>You must notify us immediately at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a> if you become aware of any unauthorised use of your account.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">3. Subscriptions and billing</h2>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Paid plans are billed monthly in advance in AUD.</li>
              <li>You may cancel at any time. Access continues until the end of the current billing period. No partial refunds are issued for unused time.</li>
              <li>We reserve the right to change pricing with 30 days&apos; written notice.</li>
              <li>The Business plan is billed per seat. Adding members increases your monthly charge at the next billing cycle.</li>
              <li>Refunds are issued at our sole discretion and only for verified billing errors.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">4. User content</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              All content you submit, post, upload, or transmit through TimeWiseHub — including but not limited to messages, task notes, files, attachments, and profile images (&quot;User Content&quot;) — remains your property.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              By submitting User Content, you grant Vividex a limited, non-exclusive, royalty-free licence to store, display, and process that content solely as necessary to provide the service.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">You warrant that:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>you have all rights necessary to submit the User Content;</li>
              <li>the User Content does not infringe any third-party intellectual property, privacy, or other legal rights; and</li>
              <li>the User Content does not contain material that is unlawful, threatening, abusive, harassing, defamatory, obscene, or otherwise objectionable.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex does not endorse, monitor, or assume any responsibility for User Content. We reserve the right — but have no obligation — to review, edit, or remove any User Content at our sole discretion and without notice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">5. Acceptable use</h2>
            <p className="text-sm text-gray-600">You agree not to use TimeWiseHub to:</p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>harass, bully, threaten, defame, or discriminate against any person;</li>
              <li>upload, share, or transmit content that is unlawful, infringing, pornographic, or contains malware or malicious code;</li>
              <li>access, export, or misuse payroll data, HR records, or personal information of other users beyond what is required for your authorised role within your organisation;</li>
              <li>access or attempt to access accounts, systems, or data you are not authorised to view;</li>
              <li>interfere with or disrupt the service or the servers or networks connected to it;</li>
              <li>reverse engineer, decompile, or attempt to extract the source code of any part of the platform;</li>
              <li>impersonate any person or entity, or misrepresent your affiliation with any person or entity;</li>
              <li>use the service for any unlawful purpose or in violation of any applicable law or regulation.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">6. Platform role</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              TimeWiseHub is a software platform and tool — not a publisher, editor, or speaker of User Content. Vividex acts solely as a passive conduit for the transmission and storage of User Content and has no obligation to screen, review, monitor, or moderate any User Content or user interactions.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Users access and use TimeWiseHub and interact with other users entirely at their own risk. Vividex and TimeWiseHub are not liable for any actions, conduct, communications, content, or data created or shared by any user, whether or not such conduct is in violation of these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">7. Indemnification</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You agree to indemnify, defend, and hold harmless Vividex, its directors, officers, employees, contractors, and agents from and against any and all claims, liabilities, losses, damages, and expenses (including reasonable legal costs) arising out of or in connection with:
            </p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>your use of or access to the service;</li>
              <li>your User Content;</li>
              <li>your breach of any provision of these Terms; or</li>
              <li>your violation of any applicable law or the rights of any third party.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              This indemnity survives termination of your account and these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">8. Intellectual property</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Vividex owns all rights in the platform, including its software, design, trademarks, and brand. You own your data. No licence is granted to copy, reproduce, modify, or reverse-engineer any part of the platform beyond what is necessary to use the service as intended.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">9. Disclaimers</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The service is provided <strong>&quot;AS IS&quot;</strong> and <strong>&quot;AS AVAILABLE&quot;</strong> without warranty of any kind. To the maximum extent permitted by law, Vividex expressly disclaims all warranties, express or implied, including but not limited to:
            </p>
            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">
              <li>implied warranties of merchantability and fitness for a particular purpose;</li>
              <li>warranties that the service will be uninterrupted, timely, secure, or error-free;</li>
              <li>warranties regarding the accuracy, reliability, or completeness of any content on the platform; and</li>
              <li>warranties that any defects or errors in the service will be corrected.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              You use the service entirely at your own risk.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">10. Limitation of liability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">To the maximum extent permitted by applicable law:</p>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-disc pl-5">
              <li>Vividex shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, goodwill, or business opportunity, arising from or related to your use of or inability to use the service — even if Vividex has been advised of the possibility of such damages;</li>
              <li>Vividex&apos;s total aggregate liability to you for all claims arising out of or relating to these Terms or the service shall not exceed the total fees paid by you to Vividex in the twelve (12) months immediately preceding the event giving rise to the claim; and</li>
              <li>Vividex is not liable for any loss or damage arising from user conduct, User Content, unauthorised access to our servers or the personal information stored on them, interruptions or cessation of service, or any bugs, viruses, or harmful code transmitted through the service.</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed">
              These limitations apply regardless of the legal theory under which any claim is brought. Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities — in such cases, our liability is limited to the fullest extent permitted by applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">11. Your data</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You own your data. We use it only to provide and improve the service, as described in our <Link href="/privacy" className="text-cyan-600 hover:underline">Privacy Policy</Link>. You can export or request deletion of your data at any time by contacting us at <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">12. Service availability</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We aim for high availability but do not guarantee uninterrupted service. We are not liable for losses arising from downtime, data loss, maintenance windows, or service interruptions beyond our control.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">13. Termination</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You may close your account at any time via account settings or by contacting us. We may suspend or terminate accounts that violate these Terms, with or without notice. Upon termination, your data will be deleted within 30 days, subject to any legal retention obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">14. Governing law</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              These Terms are governed by the laws of New South Wales, Australia. You agree to submit to the exclusive jurisdiction of the courts of New South Wales for the resolution of any dispute arising from these Terms or your use of the service.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Nothing in this clause limits any rights you may have under mandatory consumer protection laws applicable in your jurisdiction, including the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">15. Changes to these Terms</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              We may update these Terms from time to time. Material changes will be notified by email at least 14 days before they take effect. Continued use of the service after the effective date of any changes constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <p className="text-sm text-gray-400 border-t border-gray-100 pt-6">
            Questions about these Terms? Contact us at{' '}
            <a href="mailto:admin@vividex.au" className="text-cyan-600 hover:underline">admin@vividex.au</a>
          </p>
        </div>
      </div>
    </div>
  )
}
