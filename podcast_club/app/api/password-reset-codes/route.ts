import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { createPasswordResetCode } from '@/lib/password-reset';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { memberId } = await req.json();
    const normalizedMemberId = String(memberId || '').trim();
    if (!normalizedMemberId) {
      return NextResponse.json({ message: 'memberId is required.' }, { status: 400 });
    }

    await connectToDatabase();

    const member = await MemberModel.findById(normalizedMemberId).select('name email').lean();
    if (!member) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    await PasswordResetTokenModel.updateMany(
      {
        member: member._id,
        usedAt: null,
        expiresAt: { $gt: new Date() }
      },
      { $set: { usedAt: new Date() } }
    );

    const { code, tokenHash } = createPasswordResetCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await PasswordResetTokenModel.create({
      member: member._id,
      tokenHash,
      expiresAt
    });

    return NextResponse.json({
      code,
      expiresAt: expiresAt.toISOString(),
      member: {
        _id: String(member._id),
        name: member.name,
        email: member.email
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to generate password reset code.' },
      { status: 500 }
    );
  }
}
