import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/solutions/tutors',
        destination: '/',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
