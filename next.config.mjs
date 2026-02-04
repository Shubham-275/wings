/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.doordash.com',
      },
      {
        protocol: 'https',
        hostname: '**.ubereats.com',
      },
      {
        protocol: 'https',
        hostname: '**.grubhub.com',
      },
      {
        protocol: 'https',
        hostname: '**.yelp.com',
      },
      {
        protocol: 'https',
        hostname: '**.yelpcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Transpile mapbox-gl for SSR compatibility
  transpilePackages: ['mapbox-gl'],
};

export default nextConfig;
