import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession } from '@/lib/auth';
import { formatAddress, normalizeAddressInput, validateAddressInput } from '@/lib/address';
import { createClaimCode } from '@/lib/account-claim';
import { buildAdminRoasts } from '@/lib/member-roasts';
import PodcastModel from '@/models/Podcast';
import CarveOutModel from '@/models/CarveOut';
import MemberModel from '@/models/Member';

export async function GET() {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  await connectToDatabase();
  const members = await MemberModel.find()
    .select('name email address addressLine1 addressLine2 city state postalCode isAdmin accountStatus')
    .sort({ name: 1 })
    .lean();

  const roastsByMember =
    session.member.isAdmin
      ? buildAdminRoasts({
          members: members.map((member) => ({
            _id: String(member._id),
            name: member.name,
            email: member.email,
            isAdmin: Boolean(member.isAdmin)
          })),
          podcasts: (
            await PodcastModel.find()
              .select('title host notes episodeNames totalTimeMinutes submittedBy ratings')
              .lean()
          ).map((podcast) => ({
            title: podcast.title,
            host: podcast.host || '',
            notes: podcast.notes || '',
            episodeNames: podcast.episodeNames || '',
            totalTimeMinutes: podcast.totalTimeMinutes || 0,
            submittedBy: String(podcast.submittedBy),
            ratings: (podcast.ratings || []).map((rating) => ({
              member: String(rating.member),
              value: rating.value,
              points: rating.points
            }))
          })),
          carveOuts: (
            await CarveOutModel.find()
              .select('title type service notes member fistBumps')
              .lean()
          ).map((carveOut) => ({
            title: carveOut.title,
            type: carveOut.type || 'other',
            service: carveOut.service || '',
            notes: carveOut.notes || '',
            member: String(carveOut.member),
            fistBumps: (carveOut.fistBumps || []).map((entry) => ({ member: String(entry.member) }))
          }))
        })
      : null;

  return NextResponse.json(
    members.map((member) => ({
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
      accountStatus: member.accountStatus || 'claimed',
      ...(roastsByMember ? { adminRoast: roastsByMember[String(member._id)] } : {})
    }))
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { name, email, password, isAdmin, ...rawAddress } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedAddress = normalizeAddressInput(rawAddress);
    const addressError = validateAddressInput(normalizedAddress);

    if (!name || !normalizedEmail) {
      return NextResponse.json(
        { message: 'Name, email, and full address are required.' },
        { status: 400 }
      );
    }

    if (addressError) {
      return NextResponse.json({ message: addressError }, { status: 400 });
    }

    await connectToDatabase();

    const existing = await MemberModel.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return NextResponse.json({ message: 'A member with this email already exists.' }, { status: 409 });
    }

    const rawPassword = String(password || '');
    const hasPassword = rawPassword.length > 0;
    if (hasPassword && rawPassword.length < 12) {
      return NextResponse.json({ message: 'Password must be at least 12 characters.' }, { status: 400 });
    }

    const claim = hasPassword ? null : createClaimCode();
    const passwordHash = hasPassword ? await bcrypt.hash(rawPassword, 12) : null;

    const member = await MemberModel.create({
      name,
      email: normalizedEmail,
      ...normalizedAddress,
      address: formatAddress(normalizedAddress),
      passwordHash,
      accountStatus: hasPassword ? 'claimed' : 'pending',
      claimCodeHash: claim?.codeHash || null,
      claimCodeExpiresAt: claim?.expiresAt || null,
      isAdmin: Boolean(isAdmin)
    });

    return NextResponse.json(
      {
        _id: String(member._id),
        name: member.name,
        email: member.email,
        addressLine1: member.addressLine1,
        addressLine2: member.addressLine2 || '',
        city: member.city,
        state: member.state,
        postalCode: member.postalCode,
        address: member.address,
        isAdmin: member.isAdmin,
        accountStatus: member.accountStatus,
        claimCode: claim?.code || null,
        claimCodeExpiresAt: claim?.expiresAt?.toISOString() || null
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to create member.' },
      { status: 500 }
    );
  }
}
