import Link from 'next/link'

export const metadata = { title: 'Help Centre — TimeWiseHub' }

const FAQS = [
  {
    section: 'Getting started',
    items: [
      {
        q: 'How do I create an account?',
        a: 'Click "Register" on the login page. Choose "Individual" for personal use or "Organisation" if you manage a team. After email verification, you\'ll be taken to your dashboard.',
      },
      {
        q: 'What is the difference between Individual and Organisation accounts?',
        a: 'Individual accounts are for personal use — one user, full features. Organisation accounts include a manager dashboard, employee invitations, expense approval workflows, and shared calendars. Organisation plans are billed per seat.',
      },
      {
        q: 'How do I invite team members?',
        a: 'Go to your Dashboard and use the "Invite member" form. Enter their email and role (manager, employee). They\'ll receive an invitation link valid for 7 days.',
      },
    ],
  },
  {
    section: 'Time tracking',
    items: [
      {
        q: 'How do I log time?',
        a: 'Use the Timer on the Time page to start/stop a live session, or click "+ Add manual entry" to log time after the fact. You can optionally link an entry to a task.',
      },
      {
        q: 'Can I edit or delete a time entry?',
        a: 'Yes. On the Time page, today\'s entries are listed below the timer. Click "Edit" to update the description, or "Delete" to remove it.',
      },
      {
        q: 'What does idle detection do?',
        a: 'If no time has been logged by 10 AM, you\'ll see a nudge reminder on your dashboard. The Activity page also shows a 5-week heatmap of your active vs. idle workdays.',
      },
    ],
  },
  {
    section: 'Expenses',
    items: [
      {
        q: 'How do I submit an expense?',
        a: 'Go to Expenses → "+ Add expense". Fill in the amount, date, category, and optional receipt upload. Expenses start in "Draft" status.',
      },
      {
        q: 'How does expense approval work?',
        a: 'Employees submit expenses which appear in the manager\'s expense view with "Submitted" status. Managers can approve or reject with a note. Approved expenses are marked accordingly.',
      },
      {
        q: 'How do I export expense reports?',
        a: 'On the Expenses page, use the "Export" button to download a CSV or PDF of your expense history.',
      },
    ],
  },
  {
    section: 'Projects and tasks',
    items: [
      {
        q: 'How do projects work?',
        a: 'Projects are containers for tasks and documents. Create a project from the Projects page, add a due date and colour, then create tasks within it. Use the inbox (active) and outbox (archived) to manage your workload.',
      },
      {
        q: 'What do the priority levels mean?',
        a: 'Tasks have four priorities: Urgent (red), High (orange), Normal (blue), Low (grey). The smart nudge system alerts you if a higher-priority task is waiting while you\'re working on a lower one.',
      },
      {
        q: 'Can I link a task to a time entry?',
        a: 'Yes. In the Timer or manual entry form, select a task from the "Link to task" dropdown. This lets you see time-by-project breakdowns in your Insights.',
      },
    ],
  },
  {
    section: 'Billing',
    items: [
      {
        q: 'What\'s included in the free plan?',
        a: 'The free plan includes up to 3 active projects and 30 days of time history. All other features are available.',
      },
      {
        q: 'How do I upgrade my plan?',
        a: 'Go to Billing in the sidebar. Click "Upgrade to Pro" or "Upgrade to Team". You\'ll be redirected to a secure Stripe checkout.',
      },
      {
        q: 'How do I cancel my subscription?',
        a: 'Go to Billing → "Manage subscription". This opens the Stripe customer portal where you can cancel, change plan, or update your payment method. Access continues until the end of your current billing period.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Yes. All payments are processed by Stripe. Your card details never touch our servers.',
      },
    ],
  },
  {
    section: 'Data and privacy',
    items: [
      {
        q: 'How do I download my data?',
        a: 'Go to Settings → "Download my data". This exports all your time entries, expenses, projects, tasks, and activity log as a JSON file.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Contact us at abbotts.automotive@gmail.com and we\'ll delete your account and all associated data within 30 days.',
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="mb-8 inline-block text-sm font-bold text-blue-600 hover:underline">← Dashboard</Link>

        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">TimeWiseHub</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Help Centre</h1>
          <p className="mt-2 text-sm font-semibold text-gray-500">Can&apos;t find an answer? Email <a href="mailto:abbotts.automotive@gmail.com" className="text-blue-600 hover:underline">abbotts.automotive@gmail.com</a></p>
        </div>

        <div className="space-y-8">
          {FAQS.map(section => (
            <div key={section.section} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{section.section}</h2>
              <div className="space-y-5 divide-y divide-gray-100">
                {section.items.map(item => (
                  <div key={item.q} className="pt-5 first:pt-0">
                    <p className="mb-2 text-sm font-bold text-gray-900">{item.q}</p>
                    <p className="text-sm font-medium leading-relaxed text-gray-600">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <p className="text-sm font-bold text-blue-900">Still need help?</p>
          <p className="mt-1 text-sm text-blue-700">Email us at <a href="mailto:abbotts.automotive@gmail.com" className="font-bold underline">abbotts.automotive@gmail.com</a> and we&apos;ll get back to you within 1 business day.</p>
        </div>
      </div>
    </div>
  )
}
