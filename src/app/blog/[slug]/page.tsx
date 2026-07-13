import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { blogPosts, getBlogPost } from '@/lib/blog-posts'

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}
  return { title: `${post.title} | TimeWiseHub`, description: post.description }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/blog" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back to blog</Link>

        <article className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub Blog</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">{post.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {new Date(post.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="mt-8 space-y-4">
            {post.body.map((paragraph, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          {post.cta && (
            <div className="mt-8 rounded-xl border border-cyan-100 bg-cyan-50 p-6">
              <p className="text-sm text-gray-700 leading-relaxed">{post.cta.text}</p>
              <Link
                href={post.cta.href}
                className="mt-4 inline-block rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-700"
              >
                {post.cta.label}
              </Link>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
