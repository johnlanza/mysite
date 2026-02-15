import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { hashClaimCode, normalizeClaimCode } from '@/lib/account-claim';
import MemberModel from '@/models/Member';

export async function POST(req: Request) {
  try {
    const { email, claimCode, password } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedClaimCode = normalizeClaimCode(claimCode);
    const nextPassword = String(password || '');

    if (!normalizedEmail || !normalizedClaimCode || !nextPassword) {
      return NextResponse.json({ message: 'Email, claim code, and password are required.' }, { status: 400 });
    }

    if (nextPassword.length < 12) {
      return NextResponse.json({ message: 'Password must be at least 12 characters.' }, { status: 400 });
    }

    await connectToDatabase();

    const member = await MemberModel.findOne({ email: normalizedEmail })
      .select('+claimCodeHash accountStatus claimCodeExpiresAt')
      .lean();

    if (!member || member.accountStatus !== 'pending' || !member.claimCodeHash || !member.claimCodeExpiresAt) {
      return NextResponse.json({ message: 'Invalid claim attempt.' }, { status: 400 });
    }

    if (new Date(member.claimCodeExpiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ message: 'Claim code expired. Contact an admin for a new code.' }, { status: 400 });
    }

    if (member.claimCodeHash !== hashClaimCode(normalizedClaimCode)) {
      return NextResponse.json({ message: 'Invalid claim attempt.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);

    await MemberModel.findByIdAndUpdate(member._id, {
      passwordHash,
      accountStatus: 'claimed',
      claimCodeHash: null,
      claimCodeExpiresAt: null,
      passwordChangedAt: new Date()
    });

    return NextResponse.json({ message: 'Account claimed. You can now log in.' });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to claim account.' },
      { status: 500 }
    );
  }
}
