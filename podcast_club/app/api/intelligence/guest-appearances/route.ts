import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findGuestAppearances } from '@/lib/guest-appearances';

function safeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  const params = new URL(request.url).searchParams;
  const guestName = safeText(params.get('guestName'), 120);
  const excludeShow = safeText(params.get('excludeShow'), 240);
  const excludeEpisodeId = safeText(params.get('excludeEpisodeId'), 240);
  if (guestName.length < 3) {
    return NextResponse.json({ message: 'Enter the guest’s full name.' }, { status: 400 });
  }

  try {
    const appearances = await findGuestAppearances({ guestName, excludeShow, excludeEpisodeId });
    return NextResponse.json({ guestName, appearances });
  } catch (error) {
    console.error('[guest-appearances:POST] failed', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to search for other guest appearances.' },
      { status: 502 }
    );
  }
}
