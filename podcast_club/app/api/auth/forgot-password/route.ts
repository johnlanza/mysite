import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { buildPasswordResetUrl, sendPasswordResetEmail } from '@/lib/email';
import { createPasswordResetToken, hashIp } from '@/lib/password-reset';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';

const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a password reset link has been sent.'
};

function getRequestIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
    }

    await connectToDatabase();

    const ipHash = hashIp(getRequestIp(req));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const ipRequestCount = await PasswordResetTokenModel.countDocuments({
      requestedIpHash: ipHash,
      createdAt: { $gte: oneHourAgo }
    });
    if (ipRequestCount > 20) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const member = await MemberModel.findOne({ email: normalizedEmail }).select('name email').lean();
    if (!member) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const memberRequestCount = await PasswordResetTokenModel.countDocuments({
      member: member._id,
      createdAt: { $gte: oneHourAgo }
    });
    if (memberRequestCount > 5) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    await PasswordResetTokenModel.updateMany(
      {
        member: member._id,
        usedAt: null
      },
      { $set: { usedAt: new Date() } }
    );

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

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error('[forgot-password] error', error);
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
