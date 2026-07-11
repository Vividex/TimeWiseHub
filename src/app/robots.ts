import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/api/',
        '/select-org',
        '/setup-username',
        '/invite/',
        '/join/',
        '/login',
        '/register',
        '/reset-password',
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.timewisehub.com.au'}/sitemap.xml`,
  }
}
