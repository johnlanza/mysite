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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

    await connectToDatabase();
    const currentMember = await MemberModel.findById(params.id)
      .select('addressLine1 addressLine2 city state postalCode')
      .lean();
    if (!currentMember) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    if (normalizedEmail) {
      const existing = await MemberModel.findOne({
        _id: { $ne: params.id },
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
      params.id,
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

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { confirmation } = await req.json();
    if (String(confirmation || '').trim() !== 'DELETE') {
      return NextResponse.json({ message: 'Type DELETE to confirm member deletion.' }, { status: 400 });
    }

    if (admin.member._id === params.id) {
      return NextResponse.json({ message: 'You cannot delete your own account.' }, { status: 400 });
    }

    await connectToDatabase();

    const member = await MemberModel.findById(params.id).select('name email').lean();
    if (!member) {
      return NextResponse.json({ message: 'Member not found.' }, { status: 404 });
    }

    await Promise.all([
      MeetingModel.updateMany({ host: params.id }, { $set: { host: admin.member._id } }),
      PodcastModel.updateMany({ submittedBy: params.id }, { $set: { submittedBy: admin.member._id } }),
      PodcastModel.updateMany({ 'ratings.member': params.id }, { $pull: { ratings: { member: params.id } } }),
      CarveOutModel.deleteMany({ member: params.id }),
      JoinCodeModel.updateMany({ createdBy: params.id }, { $set: { createdBy: admin.member._id } }),
      JoinCodeModel.updateMany({ usedBy: params.id }, { $set: { usedBy: null } }),
      PasswordResetTokenModel.deleteMany({ member: params.id })
    ]);

    await MemberModel.findByIdAndDelete(params.id);

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
