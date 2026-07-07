import type { Terminology } from '@/lib/workspace-profiles/types'
import type { TutorialStep } from '../types'

export function getGenericSteps(terminology: Terminology): TutorialStep[] {
  return [
    {
      id: 'client',
      title: `Add your first ${terminology.client.singular.toLowerCase()}`,
      instructions: `Add a ${terminology.client.singular.toLowerCase()} to get started — the form is right there on the page.`,
      target: () => '/dashboard/clients',
    },
    {
      id: 'project',
      title: `Set up a ${terminology.project.singular.toLowerCase()}`,
      instructions: `Click "New ${terminology.project.singular.toLowerCase()}" on the page to create your first one.`,
      target: () => '/dashboard/projects',
    },
    {
      id: 'session',
      title: `Create a ${terminology.session.singular.toLowerCase()}`,
      instructions: `Book a ${terminology.session.singular.toLowerCase()} with the ${terminology.client.singular.toLowerCase()} you added earlier. If you skipped that step, pick or add one first.`,
      target: ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/sessions?new=1` : '/dashboard/clients',
      fallbackTarget: '/dashboard/clients',
    },
  ]
}
