import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import MemberModel from '@/models/Member';

export async function GET() {
  await connectToDatabase();
  const count = await MemberModel.countDocuments();
  return NextResponse.json({ hasUsers: count > 0 });
}
