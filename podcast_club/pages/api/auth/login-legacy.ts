import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import { buildSessionCookieHeader } from '@/lib/auth';
import { formatAddress } from '@/lib/address';
import MemberModel from '@/models/Member';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const { email, password, remember } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    await connectToDatabase();
    const member = await MemberModel.findOne({ email: String(email).toLowerCase().trim() })
      .select('+passwordHash name email address addressLine1 addressLine2 city state postalCode isAdmin accountStatus')
      .lean();

    if (!member) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (member.accountStatus === 'pending' && !member.passwordHash) {
      return res.status(403).json({
        message: 'This account has not been claimed yet. Use Claim Account to set your password.'
      });
    }

    if (!member.passwordHash) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(String(password), member.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (member.accountStatus === 'pending') {
      await MemberModel.findByIdAndUpdate(member._id, {
        accountStatus: 'claimed',
        claimCodeHash: null,
        claimCodeExpiresAt: null
      });
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(String(member._id), { persistent: Boolean(remember) }));
    return res.status(200).json({
      _id: String(member._id),
      name: member.name,
      email: member.email,
      addressLine1: member.addressLine1 || '',
      addressLine2: member.addressLine2 || '',
      city: member.city || '',
      state: member.state || '',
      postalCode: member.postalCode || '',
      address: formatAddress(member),
      isAdmin: member.isAdmin
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to login.'
    });
  }
}
