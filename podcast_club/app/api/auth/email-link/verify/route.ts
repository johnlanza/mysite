import { NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { hashToken } from '@/lib/password-reset';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import EmailLoginTokenModel from '@/models/EmailLoginToken';
import MemberModel from '@/models/Member';

export async function POST(request: Request) {
  if (isReadOnlyPreview()) {
    return NextResponse.json({ message: 'Email sign-in is disabled in read-only preview mode.' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ message: 'Sign-in token is required.' }, { status: 400 });

    await connectToDatabase();
    const now = new Date();
    const record = await EmailLoginTokenModel.findOneAndUpdate(
      {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { $gt: now }
      },
      { $set: { usedAt: now } },
      { new: true }
    )
      .select('member persistent createdAt')
      .lean();

    if (!record) {
      return NextResponse.json({ message: 'This sign-in link is invalid or has expired.' }, { status: 400 });
    }

    const member = await MemberModel.findById(record.member).select('_id accountStatus passwordChangedAt').lean();
    if (!member) {
      return NextResponse.json({ message: 'Member account not found.' }, { status: 404 });
    }

    if (
      member.passwordChangedAt &&
      record.createdAt &&
      new Date(member.passwordChangedAt).getTime() > new Date(record.createdAt).getTime()
    ) {
      return NextResponse.json({ message: 'This sign-in link is invalid or has expired.' }, { status: 400 });
    }

    if (member.accountStatus === 'pending') {
      await MemberModel.findByIdAndUpdate(member._id, {
        accountStatus: 'claimed',
        claimCodeHash: null,
        claimCodeExpiresAt: null
      });
    }

    await EmailLoginTokenModel.updateMany(
      { member: member._id, usedAt: null },
      { $set: { usedAt: now } }
    );

    const response = NextResponse.json({ message: 'Signed in.' });
    setSessionCookie(response, String(member._id), { persistent: record.persistent !== false });
    return response;
  } catch (error) {
    console.error('[email-link] verification failed', error);
    return NextResponse.json({ message: 'Unable to use this sign-in link.' }, { status: 500 });
  }
}
