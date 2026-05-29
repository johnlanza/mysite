import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();
const basePath =
  rawBasePath && rawBasePath !== '/'
    ? `${rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, '')
    : '';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  typedRoutes: true,
  turbopack: {
    root: rootDir
  }
};

export default nextConfig;
