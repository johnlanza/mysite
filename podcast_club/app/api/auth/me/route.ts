import { NextResponse } from 'next/server';
import { getSessionMember } from '@/lib/auth';

export async function GET() {
  const member = await getSessionMember();
  if (!member) {
    return NextResponse.json({ member: null }, { status: 401 });
  }

  return NextResponse.json({ member });
}
