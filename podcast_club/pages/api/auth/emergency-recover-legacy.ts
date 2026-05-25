import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import { hashRecoveryCode, normalizeRecoveryCode, safeEqualString } from '@/lib/recovery';
import EmergencyRecoveryUseModel from '@/models/EmergencyRecoveryUse';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const { email, password, recoveryCode } = req.body ?? {};
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const nextPassword = String(password || '');
    const normalizedInputCode = normalizeRecoveryCode(recoveryCode || '');
    const configuredCode = normalizeRecoveryCode(process.env.OWNER_RECOVERY_CODE || '');

    if (!configuredCode) {
      return res.status(503).json({ message: 'Emergency recovery is not configured.' });
    }
    if (!normalizedEmail || !nextPassword || !normalizedInputCode) {
      return res.status(400).json({ message: 'Email, password, and recovery code are required.' });
    }
    if (nextPassword.length < 12) {
      return res.status(400).json({ message: 'Password must be at least 12 characters.' });
    }

    const inputHash = hashRecoveryCode(normalizedInputCode);
    const configuredHash = hashRecoveryCode(configuredCode);
    if (!safeEqualString(inputHash, configuredHash)) {
      return res.status(403).json({ message: 'Invalid recovery code.' });
    }

    await connectToDatabase();
    const alreadyUsed = await EmergencyRecoveryUseModel.findOne({ codeHash: configuredHash }).lean();
    if (alreadyUsed) {
      return res.status(403).json({ message: 'This emergency recovery code has already been used. Rotate OWNER_RECOVERY_CODE.' });
    }

    const member = await MemberModel.findOne({ email: normalizedEmail }).select('isAdmin').lean();
    if (!member || !member.isAdmin) {
      return res.status(404).json({ message: 'Admin account not found for this email.' });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    await MemberModel.findByIdAndUpdate(member._id, { passwordHash, passwordChangedAt: new Date() });
    await PasswordResetTokenModel.updateMany({ member: member._id, usedAt: null }, { $set: { usedAt: new Date() } });
    await EmergencyRecoveryUseModel.create({ codeHash: configuredHash, usedAt: new Date(), usedBy: member._id });

    return res.status(200).json({
      message: 'Admin password reset complete. Log in with your new password and rotate OWNER_RECOVERY_CODE.'
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to perform emergency recovery.'
    });
  }
}
