import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import { hashToken, normalizeToken } from '@/lib/password-reset';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const { token, password } = req.body ?? {};
    const normalizedToken = normalizeToken(token);
    const nextPassword = String(password || '');

    if (!normalizedToken || !nextPassword) {
      return res.status(400).json({ message: 'Token and password are required.' });
    }
    if (nextPassword.length < 12) {
      return res.status(400).json({ message: 'Password must be at least 12 characters.' });
    }

    await connectToDatabase();
    const record = await PasswordResetTokenModel.findOne({
      tokenHash: hashToken(normalizedToken),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    }).select('member').lean();

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    const member = await MemberModel.findByIdAndUpdate(
      record.member,
      {
        passwordHash,
        passwordChangedAt: new Date(),
        accountStatus: 'claimed',
        claimCodeHash: null,
        claimCodeExpiresAt: null
      },
      { new: true }
    ).lean();

    if (!member) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const now = new Date();
    await PasswordResetTokenModel.updateMany({ member: record.member, usedAt: null }, { $set: { usedAt: now } });
    return res.status(200).json({ message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to reset password.'
    });
  }
}
