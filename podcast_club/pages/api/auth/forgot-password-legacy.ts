import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/lib/db';
import { buildPasswordResetUrl, sendPasswordResetEmail } from '@/lib/email';
import { createPasswordResetToken, hashIp } from '@/lib/password-reset';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a password reset link has been sent.'
};

function getRequestIp(req: NextApiRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers['x-real-ip'] || 'unknown';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const { email } = req.body ?? {};
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    await connectToDatabase();
    const ipHash = hashIp(String(getRequestIp(req) || 'unknown'));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const ipRequestCount = await PasswordResetTokenModel.countDocuments({
      requestedIpHash: ipHash,
      createdAt: { $gte: oneHourAgo }
    });
    if (ipRequestCount > 20) return res.status(200).json(GENERIC_RESPONSE);

    const member = await MemberModel.findOne({ email: normalizedEmail }).select('name email').lean();
    if (!member) return res.status(200).json(GENERIC_RESPONSE);

    const memberRequestCount = await PasswordResetTokenModel.countDocuments({
      member: member._id,
      createdAt: { $gte: oneHourAgo }
    });
    if (memberRequestCount > 5) return res.status(200).json(GENERIC_RESPONSE);

    await PasswordResetTokenModel.updateMany({ member: member._id, usedAt: null }, { $set: { usedAt: new Date() } });
    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await PasswordResetTokenModel.create({
      member: member._id,
      tokenHash,
      expiresAt,
      requestedIpHash: ipHash
    });

    await sendPasswordResetEmail({
      to: member.email,
      name: member.name,
      resetUrl: buildPasswordResetUrl(token)
    });

    return res.status(200).json(GENERIC_RESPONSE);
  } catch (error) {
    console.error('[forgot-password-legacy] error', error);
    return res.status(200).json(GENERIC_RESPONSE);
  }
}
