import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { formatAddress, normalizeAddressInput, validateAddressInput } from '@/lib/address';
import { hashJoinCode, normalizeJoinCode } from '@/lib/join-codes';
import JoinCodeModel from '@/models/JoinCode';
import MemberModel from '@/models/Member';

export async function POST(req: Request) {
  let consumedCodeId: string | null = null;

  try {
    const { name, email, password, inviteCode, ...rawAddress } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedAddress = normalizeAddressInput(rawAddress);
    const addressError = validateAddressInput(normalizedAddress);

    if (!name || !normalizedEmail || !password) {
      return NextResponse.json(
        { message: 'Name, email, password, and full address are required.' },
        { status: 400 }
      );
    }

    if (addressError) {
      return NextResponse.json({ message: addressError }, { status: 400 });
    }

    await connectToDatabase();

    const memberCount = await MemberModel.countDocuments();
    if (memberCount > 0) {
      const normalizedInviteCode = normalizeJoinCode(inviteCode || '');
      if (!normalizedInviteCode) {
        return NextResponse.json({ message: 'A valid one-time join code is required.' }, { status: 403 });
      }

      const consumedCode = await JoinCodeModel.findOneAndUpdate(
        {
          codeHash: hashJoinCode(normalizedInviteCode),
          usedAt: null
        },
        { $set: { usedAt: new Date() } },
        { new: true }
      ).lean();

      if (!consumedCode) {
        return NextResponse.json({ message: 'Invalid or already used join code.' }, { status: 403 });
      }

      consumedCodeId = String(consumedCode._id);
    }

    const existing = await MemberModel.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      if (existing.accountStatus === 'pending') {
        return NextResponse.json(
          {
            message:
              'An admin already created this account. Use Claim Account to set your password instead of registering again.'
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ message: 'A member with this email already exists.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
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

    const response = NextResponse.json({
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

    setSessionCookie(response, String(member._id));
    return response;
  } catch (error) {
    if (consumedCodeId) {
      try {
        await JoinCodeModel.findByIdAndUpdate(consumedCodeId, { $set: { usedAt: null, usedBy: null } });
      } catch {
        // Ignore rollback failures and return original error.
      }
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to register.' },
      { status: 500 }
    );
  }
}
