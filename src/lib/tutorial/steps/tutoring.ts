import type { TutorialStep } from '../types'

export const TUTORING_STEPS: TutorialStep[] = [
  {
    id: 'client',
    title: 'Add your first client',
    instructions: "Every tutoring relationship starts with a client. Add one now — the form is right there on the page.",
    target: () => '/dashboard/clients',
  },
  {
    id: 'student',
    title: 'Add a student',
    instructions: "Now add a student under that client. If you skipped adding a client, pick or add one first, then open their Students tab.",
    target: ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/students?new=1` : '/dashboard/clients',
    fallbackTarget: '/dashboard/clients',
  },
  {
    id: 'subjects',
    title: 'Upload a worksheet to Subjects',
    instructions: "Head to Subjects, pick a year group, pick a subject, then open or create a topic and drag a file into the upload zone there.",
    target: () => '/dashboard/subjects',
  },
  {
    id: 'program',
    title: 'Set up a program',
    instructions: "Programs organise your teaching content. Click \"New program\" on the Programs page to create your first one.",
    target: () => '/dashboard/programs',
  },
  {
    id: 'session',
    title: 'Create a session',
    instructions: "Book a session with the client you added earlier. If you skipped that step, pick or add a client first.",
    target: ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/sessions?new=1` : '/dashboard/clients',
    fallbackTarget: '/dashboard/clients',
  },
  {
    id: 'video_call',
    title: 'Schedule a call',
    instructions: "Head to Video and click \"Schedule a call\" to set up your first video session.",
    target: () => '/dashboard/video',
  },
]
