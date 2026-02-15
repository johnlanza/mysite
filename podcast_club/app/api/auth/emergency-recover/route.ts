import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { hashRecoveryCode, normalizeRecoveryCode, safeEqualString } from '@/lib/recovery';
import EmergencyRecoveryUseModel from '@/models/EmergencyRecoveryUse';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

export async function POST(req: Request) {
  try {
    const { email, password, recoveryCode } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const nextPassword = String(password || '');
    const normalizedInputCode = normalizeRecoveryCode(recoveryCode || '');
    const configuredCode = normalizeRecoveryCode(process.env.OWNER_RECOVERY_CODE || '');

    if (!configuredCode) {
      return NextResponse.json({ message: 'Emergency recovery is not configured.' }, { status: 503 });
    }

    if (!normalizedEmail || !nextPassword || !normalizedInputCode) {
      return NextResponse.json({ message: 'Email, password, and recovery code are required.' }, { status: 400 });
    }

    if (nextPassword.length < 12) {
      return NextResponse.json({ message: 'Password must be at least 12 characters.' }, { status: 400 });
    }

    const inputHash = hashRecoveryCode(normalizedInputCode);
    const configuredHash = hashRecoveryCode(configuredCode);
    if (!safeEqualString(inputHash, configuredHash)) {
      return NextResponse.json({ message: 'Invalid recovery code.' }, { status: 403 });
    }

    await connectToDatabase();

    const alreadyUsed = await EmergencyRecoveryUseModel.findOne({ codeHash: configuredHash }).lean();
    if (alreadyUsed) {
      return NextResponse.json(
        { message: 'This emergency recovery code has already been used. Rotate OWNER_RECOVERY_CODE.' },
        { status: 403 }
      );
    }

    const member = await MemberModel.findOne({ email: normalizedEmail }).select('isAdmin').lean();
    if (!member || !member.isAdmin) {
      return NextResponse.json({ message: 'Admin account not found for this email.' }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    await MemberModel.findByIdAndUpdate(member._id, {
      passwordHash,
      passwordChangedAt: new Date()
    });

    await PasswordResetTokenModel.updateMany({ member: member._id, usedAt: null }, { $set: { usedAt: new Date() } });

    await EmergencyRecoveryUseModel.create({
      codeHash: configuredHash,
      usedAt: new Date(),
      usedBy: member._id
    });

    return NextResponse.json({
      message: 'Admin password reset complete. Log in with your new password and rotate OWNER_RECOVERY_CODE.'
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to perform emergency recovery.' },
      { status: 500 }
    );
  }
}
