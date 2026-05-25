import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import { buildSessionCookieHeader } from '@/lib/auth';
import { formatAddress, normalizeAddressInput, validateAddressInput } from '@/lib/address';
import { hashJoinCode, normalizeJoinCode } from '@/lib/join-codes';
import JoinCodeModel from '@/models/JoinCode';
import MemberModel from '@/models/Member';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  let consumedCodeId: string | null = null;

  try {
    const { name, email, password, inviteCode, ...rawAddress } = req.body ?? {};
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedAddress = normalizeAddressInput(rawAddress);
    const addressError = validateAddressInput(normalizedAddress);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email, password, and full address are required.' });
    }

    if (addressError) {
      return res.status(400).json({ message: addressError });
    }

    await connectToDatabase();

    const memberCount = await MemberModel.countDocuments();
    if (memberCount > 0) {
      const normalizedInviteCode = normalizeJoinCode(inviteCode || '');
      if (!normalizedInviteCode) {
        return res.status(403).json({ message: 'A valid one-time join code is required.' });
      }

      const consumedCode = await JoinCodeModel.findOneAndUpdate(
        { codeHash: hashJoinCode(normalizedInviteCode), usedAt: null },
        { $set: { usedAt: new Date() } },
        { new: true }
      ).lean();

      if (!consumedCode) {
        return res.status(403).json({ message: 'Invalid or already used join code.' });
      }

      consumedCodeId = String(consumedCode._id);
    }

    const existing = await MemberModel.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      if (existing.accountStatus === 'pending') {
        return res.status(409).json({
          message: 'An admin already created this account. Use Claim Account to set your password instead of registering again.'
        });
      }
      return res.status(409).json({ message: 'A member with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const member = await MemberModel.create({
      name,
      email: normalizedEmail,
      ...normalizedAddress,
      address: formatAddress(normalizedAddress),
      passwordHash,
      isAdmin: memberCount === 0
    });

    if (consumedCodeId) {
      await JoinCodeModel.findByIdAndUpdate(consumedCodeId, { $set: { usedBy: member._id } });
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(String(member._id), { persistent: true }));
    return res.status(200).json({
      _id: String(member._id),
      name: member.name,
      email: member.email,
      addressLine1: member.addressLine1,
      addressLine2: member.addressLine2 || '',
      city: member.city,
      state: member.state,
      postalCode: member.postalCode,
      address: member.address,
      isAdmin: member.isAdmin
    });
  } catch (error) {
    if (consumedCodeId) {
      try {
        await JoinCodeModel.findByIdAndUpdate(consumedCodeId, { $set: { usedAt: null, usedBy: null } });
      } catch {}
    }

    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to register.'
    });
  }
}
