import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { formatAddress } from '@/lib/address';
import MemberModel from '@/models/Member';

const SESSION_COOKIE = 'podcast_club_session';
const SESSION_DAYS = 7;

type SessionPayload = {
  memberId: string;
  iat: number;
  exp: number;
  impersonatorId?: string;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing SESSION_SECRET in environment variables');
  }
  return secret;
}

function base64UrlEncode(data: string) {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function signPayload(payloadEncoded: string) {
  return createHmac('sha256', getSessionSecret()).update(payloadEncoded).digest('base64url');
}

function createToken(payload: SessionPayload) {
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function safeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const [payloadEncoded, signature] = token.split('.');
    if (!payloadEncoded || !signature) return null;

    const expected = signPayload(payloadEncoded);
    if (!safeEqualString(signature, expected)) return null;

    const parsed = JSON.parse(base64UrlDecode(payloadEncoded)) as SessionPayload;
    if (!parsed.memberId || !parsed.iat || !parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.impersonatorId && typeof parsed.impersonatorId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSessionMember() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  await connectToDatabase();
  const member = await MemberModel.findById(payload.memberId)
    .select('name email address addressLine1 addressLine2 city state postalCode isAdmin passwordChangedAt')
    .lean();
  if (!member) return null;
  if (member.passwordChangedAt && new Date(member.passwordChangedAt).getTime() > payload.iat) {
    return null;
  }

  let impersonatorName = '';
  if (payload.impersonatorId) {
    const impersonator = await MemberModel.findById(payload.impersonatorId)
      .select('name isAdmin passwordChangedAt')
      .lean();
    if (!impersonator || !impersonator.isAdmin) {
      return null;
    }
    if (impersonator.passwordChangedAt && new Date(impersonator.passwordChangedAt).getTime() > payload.iat) {
      return null;
    }
    impersonatorName = impersonator.name;
  }

  return {
    _id: String(member._id),
    name: member.name,
    email: member.email,
    addressLine1: member.addressLine1 || '',
    addressLine2: member.addressLine2 || '',
    city: member.city || '',
    state: member.state || '',
    postalCode: member.postalCode || '',
    address: formatAddress(member),
    isAdmin: member.isAdmin,
    isImpersonating: Boolean(payload.impersonatorId),
    impersonatorId: payload.impersonatorId ? String(payload.impersonatorId) : undefined,
    impersonatorName: payload.impersonatorId ? impersonatorName : undefined
  };
}

export async function requireSession() {
  const member = await getSessionMember();
  if (!member) return { ok: false as const, status: 401, message: 'Authentication required.' };
  return { ok: true as const, member };
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!session.ok) return session;
  if (!session.member.isAdmin) return { ok: false as const, status: 403, message: 'Admin access required.' };
  return session;
}

export function setSessionCookie(response: NextResponse, memberId: string, options?: { impersonatorId?: string }) {
  const iat = Date.now();
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = createToken({
    memberId,
    iat,
    exp,
    ...(options?.impersonatorId ? { impersonatorId: options.impersonatorId } : {})
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(exp)
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0)
  });
}
