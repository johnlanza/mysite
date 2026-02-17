/** @type {import('next').NextConfig} */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();
const basePath =
  rawBasePath && rawBasePath !== '/'
    ? `${rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, '')
    : '';

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
