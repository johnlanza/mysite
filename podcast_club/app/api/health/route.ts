import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'podcast-club',
      commit: process.env.RENDER_GIT_COMMIT || null,
      branch: process.env.RENDER_GIT_BRANCH || null
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  );
}
