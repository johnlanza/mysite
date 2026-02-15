import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { createClaimCode } from '@/lib/account-claim';
import MemberModel from '@/models/Member';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { memberId } = await req.json();
    const normalizedMemberId = String(memberId || '').trim();
    if (!normalizedMemberId) {
      return NextResponse.json({ message: 'memberId is required.' }, { status: 400 });
    }

    await connectToDatabase();

    const member = await MemberModel.findById(normalizedMemberId).select('name email accountStatus').lean();
    if (!member) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    if (member.accountStatus !== 'pending') {
      return NextResponse.json({ message: 'Only pending accounts can receive claim codes.' }, { status: 400 });
    }

    const claim = createClaimCode();

    await MemberModel.findByIdAndUpdate(normalizedMemberId, {
      claimCodeHash: claim.codeHash,
      claimCodeExpiresAt: claim.expiresAt
    });

    return NextResponse.json({
      code: claim.code,
      expiresAt: claim.expiresAt.toISOString(),
      member: {
        _id: String(member._id),
        name: member.name,
        email: member.email
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to generate claim code.' },
      { status: 500 }
    );
  }
}
