const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();

export const BASE_PATH =
  rawBasePath && rawBasePath !== '/'
    ? `${rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`}`.replace(/\/+$/, '')
    : '';

export function withBasePath(path: string) {
  if (!path) return BASE_PATH || '/';
  if (/^(https?:)?\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_PATH) return normalizedPath;
  if (normalizedPath === BASE_PATH || normalizedPath.startsWith(`${BASE_PATH}/`)) return normalizedPath;
  return `${BASE_PATH}${normalizedPath}`;
}
