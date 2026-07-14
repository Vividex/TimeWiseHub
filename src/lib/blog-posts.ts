export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  body: string[]
  cta?: {
    text: string
    label: string
    href: string
  }
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'tracking-a-tutoring-business',
    title: '5 things every tutoring business needs',
    description:
      'Beyond the timetable: billing, student progress, parent updates and video lessons that actually work are what keep a tutoring business organised.',
    date: '2026-07-13',
    body: [
      'Most tutors start out with a shared calendar and a notes app, and that works fine for the first handful of students. The trouble shows up around student ten or fifteen, when the same few questions start eating your evenings: who still owes for last month, which student is falling behind in a specific topic, and whether a parent actually saw the message you sent.',
      'Video lessons that actually let the student participate. A lot of tutors default to whatever video call tool they already use for everything else, and most of those are built for one person presenting while everyone else watches — screen share shows the worksheet or the student, never both, and only one person can actually touch anything. For a subject where working through a problem together is the point, that is a real limitation, not a minor inconvenience.',
      'Subject and topic progress. A generic "went well" note after each session is not useful three months later when a parent asks how their child is actually tracking. Recording progress against specific subjects and topics turns a term of sessions into something you can summarise in thirty seconds, and it becomes proof of value when it is time to justify a rate increase.',
      'Worksheets and resources tied to the actual topic. Six months into tutoring a student, "where is that worksheet from March" should not require searching your email or a drive folder. Keeping files attached to the specific subject and topic they belong to means the history builds itself instead of living in whichever folder you happened to save into that week.',
      'Parent and client communication. When a lesson gets rescheduled or a student misses homework, the conversation needs to be attached to the student record, not buried in a text thread you cannot search. This matters even more once you are not the only tutor in the business.',
      'Payments and outstanding invoices. Chasing payment is the least enjoyable part of running a tutoring business, and it gets worse the longer it is left. Knowing exactly who owes what, without reconstructing it from bank statements, is the difference between a quick reminder and an awkward conversation.',
      'None of this requires expensive practice-management software built for large tutoring centres. It just requires picking somewhere to keep this information consistently, before the business outgrows a notes app.',
    ],
    cta: {
      text: 'TimeWiseHub is built for exactly this — per-lesson billing, subject and topic tracking with file storage, video lessons with live shared annotation, and parent updates over plain email, all in one place.',
      label: 'See TimeWiseHub for tutors',
      href: '/solutions/tutors',
    },
  },
]

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug)
}
