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
    title: '5 things every tutoring business should track',
    description:
      'Beyond the timetable: lesson credits, subject progress, no-shows and payments are what actually decide whether a tutoring business stays organised.',
    date: '2026-07-13',
    body: [
      'Most tutors start out with a shared calendar and a notes app, and that works fine for the first handful of students. The trouble shows up around student ten or fifteen, when the same five questions start eating your evenings: who still owes for last month, which student is falling behind in a specific topic, who cancelled last-minute three times this term, and whether a parent actually saw the message you sent.',
      'Lesson credits and prepayments. If you bill per lesson or in blocks, "how many lessons has this student got left" needs to be answered in one glance, not a mental tally from memory or a spreadsheet you have to reopen. Once credits run low, that is also the moment to prompt a top-up before a lesson gets awkward.',
      'Subject and topic progress. A generic "went well" note after each session is not useful three months later when a parent asks how their child is actually tracking. Recording progress against specific subjects and topics turns a term of sessions into something you can summarise in thirty seconds, and it becomes proof of value when it is time to justify a rate increase.',
      'Attendance and no-shows. A pattern of late cancellations is a business problem, not just an annoyance — it is unpaid time. Tracking it consistently, rather than remembering the vague sense that "this family cancels a lot," is what lets you enforce a cancellation policy fairly and with evidence.',
      'Parent and client communication. When a lesson gets rescheduled or a student misses homework, the conversation needs to be attached to the student record, not buried in a text thread you cannot search. This matters even more once you are not the only tutor in the business.',
      'Payments and outstanding invoices. Chasing payment is the least enjoyable part of running a tutoring business, and it gets worse the longer it is left. Knowing exactly who owes what, without reconstructing it from bank statements, is the difference between a quick reminder and an awkward conversation.',
      'None of this requires expensive practice-management software built for large tutoring centres. It just requires picking somewhere to keep this information consistently, before the business outgrows a notes app.',
    ],
    cta: {
      text: 'TimeWiseHub is built for exactly this — student and parent records, per-lesson billing, subject progress tracking and scheduling, all in one place.',
      label: 'See TimeWiseHub for tutors',
      href: '/solutions/tutors',
    },
  },
]

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug)
}
