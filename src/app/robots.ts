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
    sitemap: 'https://timewisehub.com.au/sitemap.xml',
  }
}
