import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import { hashClaimCode, normalizeClaimCode } from '@/lib/account-claim';
import MemberModel from '@/models/Member';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const { email, claimCode, password } = req.body ?? {};
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedClaimCode = normalizeClaimCode(claimCode);
    const nextPassword = String(password || '');

    if (!normalizedEmail || !normalizedClaimCode || !nextPassword) {
      return res.status(400).json({ message: 'Email, claim code, and password are required.' });
    }
    if (nextPassword.length < 12) {
      return res.status(400).json({ message: 'Password must be at least 12 characters.' });
    }

    await connectToDatabase();
    const member = await MemberModel.findOne({ email: normalizedEmail })
      .select('+claimCodeHash accountStatus claimCodeExpiresAt')
      .lean();

    if (!member || member.accountStatus !== 'pending' || !member.claimCodeHash || !member.claimCodeExpiresAt) {
      return res.status(400).json({ message: 'Invalid claim attempt.' });
    }
    if (new Date(member.claimCodeExpiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Claim code expired. Contact an admin for a new code.' });
    }
    if (member.claimCodeHash !== hashClaimCode(normalizedClaimCode)) {
      return res.status(400).json({ message: 'Invalid claim attempt.' });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    await MemberModel.findByIdAndUpdate(member._id, {
      passwordHash,
      accountStatus: 'claimed',
      claimCodeHash: null,
      claimCodeExpiresAt: null,
      passwordChangedAt: new Date()
    });

    return res.status(200).json({ message: 'Account claimed. You can now log in.' });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to claim account.'
    });
  }
}
