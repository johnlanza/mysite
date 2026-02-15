import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import MemberModel from '@/models/Member';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { memberId } = await req.json();
    const targetId = String(memberId || '').trim();
    if (!targetId) {
      return NextResponse.json({ message: 'memberId is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const target = await MemberModel.findById(targetId).select('_id').lean();
    if (!target) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, String(target._id), { impersonatorId: admin.member._id });
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to start preview.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  if (!session.member.isImpersonating || !session.member.impersonatorId) {
    return NextResponse.json({ message: 'Not currently previewing another member.' }, { status: 400 });
  }

  await connectToDatabase();
  const admin = await MemberModel.findById(session.member.impersonatorId).select('_id isAdmin').lean();
  if (!admin || !admin.isAdmin) {
    const response = NextResponse.json({ message: 'Original admin session is no longer valid.' }, { status: 401 });
    clearSessionCookie(response);
    return response;
  }

  const response = NextResponse.json({ success: true });
  setSessionCookie(response, String(admin._id));
  return response;
}
