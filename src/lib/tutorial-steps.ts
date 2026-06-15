export type TutorialStep = {
  id: string
  target: string
  heading: string
  body: string
  roles: ('owner' | 'admin' | 'manager' | 'employee')[]
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'home',
    target: 'home',
    heading: 'Your home base',
    body: 'Everything important surfaces here — your tasks, upcoming shifts, and what needs attention today.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
  {
    id: 'clients',
    target: 'clients',
    heading: 'Your clients',
    body: 'Add clients first. Time entries, invoices, projects, and sessions all link back to a client.',
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'time',
    target: 'time',
    heading: 'Tracking time',
    body: 'Start the timer when you begin work, or log time manually. Entries attach to a client and project.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
  {
    id: 'roster',
    target: 'roster',
    heading: 'Scheduling your team',
    body: "Build the week's roster here. Hit Publish and your team gets notified instantly.",
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'roster-employee',
    target: 'roster',
    heading: 'Your roster',
    body: "See when you're scheduled to work. You'll get a notification whenever a new roster is published.",
    roles: ['employee'],
  },
  {
    id: 'assistant',
    target: 'assistant',
    heading: 'Your AI assistant',
    body: 'Ask it anything — "how many hours did I log this week?", "draft an invoice for Acme". It knows your data.',
    roles: ['owner', 'admin', 'manager'],
  },
  {
    id: 'chat',
    target: 'chat',
    heading: 'Team chat',
    body: 'Message your team without leaving the app. Respects quiet hours — no pings outside work time.',
    roles: ['owner', 'admin', 'manager', 'employee'],
  },
]

export type UserRole = 'owner' | 'admin' | 'manager' | 'employee'

export function getStepsForRole(role: UserRole): TutorialStep[] {
  const seen = new Set<string>()
  return TUTORIAL_STEPS.filter(s => {
    if (!s.roles.includes(role)) return false
    if (seen.has(s.target)) return false
    seen.add(s.target)
    return true
  })
}
