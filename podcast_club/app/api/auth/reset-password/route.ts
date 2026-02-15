import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { hashToken, normalizeToken } from '@/lib/password-reset';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    const normalizedToken = normalizeToken(token);
    const nextPassword = String(password || '');

    if (!normalizedToken || !nextPassword) {
      return NextResponse.json({ message: 'Token and password are required.' }, { status: 400 });
    }

    if (nextPassword.length < 12) {
      return NextResponse.json({ message: 'Password must be at least 12 characters.' }, { status: 400 });
    }

    await connectToDatabase();

    const record = await PasswordResetTokenModel.findOne({
      tokenHash: hashToken(normalizedToken),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    })
      .select('member')
      .lean();

    if (!record) {
      return NextResponse.json({ message: 'Invalid or expired reset token.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);

    const member = await MemberModel.findByIdAndUpdate(
      record.member,
      {
        passwordHash,
        passwordChangedAt: new Date()
      },
      { new: true }
    ).lean();

    if (!member) {
      return NextResponse.json({ message: 'Account not found.' }, { status: 404 });
    }

    const now = new Date();
    await PasswordResetTokenModel.updateMany({ member: record.member, usedAt: null }, { $set: { usedAt: now } });

    return NextResponse.json({ message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to reset password.' },
      { status: 500 }
    );
  }
}
