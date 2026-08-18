import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { buildEmailLoginUrl, isEmailLoginConfigured, sendEmailLoginLink } from '@/lib/email';
import { createEmailLoginToken, hashIp } from '@/lib/password-reset';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import EmailLoginTokenModel from '@/models/EmailLoginToken';
import MemberModel from '@/models/Member';

const GENERIC_RESPONSE = {
  message: 'If that email belongs to a member, a sign-in link is on its way.'
};

function getRequestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (isReadOnlyPreview()) {
    return NextResponse.json({ message: 'Email sign-in is disabled in read-only preview mode.' }, { status: 403 });
  }

  if (!isEmailLoginConfigured()) {
    return NextResponse.json(
      { message: 'Email sign-in is temporarily unavailable. Please use your password.' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown; remember?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    if (!email) return NextResponse.json({ message: 'Email is required.' }, { status: 400 });

    await connectToDatabase();
    const ipHash = hashIp(getRequestIp(request));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const ipRequestCount = await EmailLoginTokenModel.countDocuments({
      requestedIpHash: ipHash,
      createdAt: { $gte: oneHourAgo }
    });
    if (ipRequestCount >= 20) return NextResponse.json(GENERIC_RESPONSE);

    const member = await MemberModel.findOne({ email }).select('name email accountStatus').lean();
    if (!member) return NextResponse.json(GENERIC_RESPONSE);

    const memberRequestCount = await EmailLoginTokenModel.countDocuments({
      member: member._id,
      createdAt: { $gte: oneHourAgo }
    });
    if (memberRequestCount >= 5) return NextResponse.json(GENERIC_RESPONSE);

    const now = new Date();
    await EmailLoginTokenModel.updateMany(
      { member: member._id, usedAt: null },
      { $set: { usedAt: now } }
    );

    const { token, tokenHash } = createEmailLoginToken();
    await EmailLoginTokenModel.create({
      member: member._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      requestedIpHash: ipHash,
      persistent: body?.remember !== false
    });

    const delivery = await sendEmailLoginLink({
      to: member.email,
      name: member.name,
      loginUrl: buildEmailLoginUrl(token)
    });
    if (!delivery.delivered) {
      await EmailLoginTokenModel.updateOne({ tokenHash }, { $set: { usedAt: new Date() } });
      return NextResponse.json(
        { message: 'Email sign-in is temporarily unavailable. Please use your password.' },
        { status: 503 }
      );
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error('[email-link] request failed', error);
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
