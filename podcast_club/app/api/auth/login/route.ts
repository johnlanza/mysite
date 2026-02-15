import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { formatAddress } from '@/lib/address';
import MemberModel from '@/models/Member';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    await connectToDatabase();
    const member = await MemberModel.findOne({ email: String(email).toLowerCase().trim() })
      .select('+passwordHash name email address addressLine1 addressLine2 city state postalCode isAdmin accountStatus')
      .lean();

    if (!member) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    if (member.accountStatus === 'pending' || !member.passwordHash) {
      return NextResponse.json(
        { message: 'This account has not been claimed yet. Use Claim Account to set your password.' },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, member.passwordHash);
    if (!valid) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const response = NextResponse.json({
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

    setSessionCookie(response, String(member._id));
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to login.' },
      { status: 500 }
    );
  }
}
