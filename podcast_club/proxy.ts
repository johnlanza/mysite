import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  isReadOnlyPreview,
  READ_ONLY_PREVIEW_MESSAGE
} from '@/lib/preview-mode';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SAFE_AUTH_MUTATIONS = [
  '/api/auth/login',
  '/api/auth/login-legacy',
  '/api/auth/logout'
];

function isSafeAuthMutation(pathname: string) {
  return SAFE_AUTH_MUTATIONS.some(
    (route) => pathname === route || pathname.endsWith(route)
  );
}

export function proxy(request: NextRequest) {
  if (
    !isReadOnlyPreview() ||
    SAFE_METHODS.has(request.method) ||
    isSafeAuthMutation(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      message: READ_ONLY_PREVIEW_MESSAGE,
      previewReadOnly: true
    },
    {
      status: 403,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}

export const config = {
  matcher: '/api/:path*'
};
