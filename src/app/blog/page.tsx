import Link from 'next/link'
import type { Metadata } from 'next'
import { blogPosts } from '@/lib/blog-posts'

export const metadata: Metadata = {
  title: 'Blog — TimeWiseHub',
  description: 'Practical notes on running a service business — tutoring, scheduling, invoicing and team operations.',
}

export default function BlogIndexPage() {
  const posts = [...blogPosts].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-block text-sm font-bold text-cyan-600 hover:underline">← Back</Link>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub Blog</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">Blog</h1>
        </div>

        {posts.length === 0 ? (
          <p className="mt-8 text-sm text-gray-600">No posts yet — check back soon.</p>
        ) : (
          <div className="mt-8 space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <p className="text-xs text-gray-500">
                  {new Date(post.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">{post.title}</h2>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{post.description}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
