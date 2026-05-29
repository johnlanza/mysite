import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { formatAddress, normalizeAddressInput, validateAddressInput } from '@/lib/address';
import CarveOutModel from '@/models/CarveOut';
import JoinCodeModel from '@/models/JoinCode';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import PasswordResetTokenModel from '@/models/PasswordResetToken';
import PodcastModel from '@/models/Podcast';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { name, email, isAdmin, ...rawAddress } = await req.json();
    const normalizedEmail = email ? String(email).toLowerCase().trim() : '';
    const normalizedAddress = normalizeAddressInput(rawAddress);
    const hasAnyAddressField = Boolean(
      rawAddress.addressLine1 ||
        rawAddress.addressLine2 ||
        rawAddress.city ||
        rawAddress.state ||
        rawAddress.postalCode
    );

    const { id } = await params;

    await connectToDatabase();
    const currentMember = await MemberModel.findById(id)
      .select('addressLine1 addressLine2 city state postalCode')
      .lean();
    if (!currentMember) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    if (normalizedEmail) {
      const existing = await MemberModel.findOne({
        _id: { $ne: id },
        email: normalizedEmail
      }).lean();
      if (existing) {
        return NextResponse.json({ message: 'A member with this email already exists.' }, { status: 409 });
      }
    }

    const mergedAddress = {
      addressLine1: normalizedAddress.addressLine1 || currentMember.addressLine1 || '',
      addressLine2:
        normalizedAddress.addressLine2 || (!('addressLine2' in rawAddress) ? currentMember.addressLine2 || '' : ''),
      city: normalizedAddress.city || currentMember.city || '',
      state: normalizedAddress.state || currentMember.state || '',
      postalCode: normalizedAddress.postalCode || currentMember.postalCode || ''
    };

    if (hasAnyAddressField) {
      const addressError = validateAddressInput(mergedAddress);
      if (addressError) {
        return NextResponse.json({ message: addressError }, { status: 400 });
      }
    }

    const member = await MemberModel.findByIdAndUpdate(
      id,
      {
        ...(name ? { name } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(hasAnyAddressField
          ? {
              ...mergedAddress,
              address: formatAddress(mergedAddress)
            }
          : {}),
        ...(typeof isAdmin === 'boolean' ? { isAdmin } : {})
      },
      { new: true, runValidators: true }
    )
      .select('name email address addressLine1 addressLine2 city state postalCode isAdmin accountStatus')
      .lean();

    if (!member) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    return NextResponse.json({
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
      accountStatus: member.accountStatus || 'claimed'
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to update member.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { confirmation } = await req.json();
    if (String(confirmation || '').trim() !== 'DELETE') {
      return NextResponse.json({ message: 'Type DELETE to confirm member deletion.' }, { status: 400 });
    }

    const { id } = await params;

    if (admin.member._id === id) {
      return NextResponse.json({ message: 'You cannot delete your own account.' }, { status: 400 });
    }

    await connectToDatabase();

    const member = await MemberModel.findById(id).select('name email').lean();
    if (!member) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    await Promise.all([
      MeetingModel.updateMany({ host: id }, { $set: { host: admin.member._id } }),
      PodcastModel.updateMany({ submittedBy: id }, { $set: { submittedBy: admin.member._id } }),
      PodcastModel.updateMany({ 'ratings.member': id }, { $pull: { ratings: { member: id } } }),
      CarveOutModel.deleteMany({ member: id }),
      JoinCodeModel.updateMany({ createdBy: id }, { $set: { createdBy: admin.member._id } }),
      JoinCodeModel.updateMany({ usedBy: id }, { $set: { usedBy: null } }),
      PasswordResetTokenModel.deleteMany({ member: id })
    ]);

    await MemberModel.findByIdAndDelete(id);

    return NextResponse.json({
      message: 'Member deleted.',
      member: {
        _id: String(member._id),
        name: member.name,
        email: member.email
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to delete member.' },
      { status: 500 }
    );
  }
}
