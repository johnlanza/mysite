import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';

export async function GET() {
  const session = await requireSession();
  if (!session.ok) {
    console.warn('[submission-health:GET] auth failed', { status: session.status });
    return NextResponse.json({ ok: false, message: session.message }, { status: session.status });
  }

  try {
    await connectToDatabase();
    return NextResponse.json({
      ok: true,
      checks: {
        auth: true,
        database: true
      }
    });
  } catch (error) {
    console.error('[submission-health:GET] database check failed', {
      memberId: session.member._id,
      error
    });
    return NextResponse.json(
      {
        ok: false,
        message: 'Submission infrastructure is unavailable.',
        checks: {
          auth: true,
          database: false
        }
      },
      { status: 503 }
    );
  }
}
