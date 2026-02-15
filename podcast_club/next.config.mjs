/** @type {import('next').NextConfig} */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();
const basePath =
  rawBasePath && rawBasePath !== '/'
    ? `${rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, '')
    : '';

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  ...(basePath ? { basePath } : {}),
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
