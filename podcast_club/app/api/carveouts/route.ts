import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import CarveOutModel from '@/models/CarveOut';

export async function GET() {
  const session = await requireSession();
  await connectToDatabase();

  if (!session.ok) {
    const carveOuts = await CarveOutModel.find().populate('meeting', 'date').sort({ createdAt: -1 }).lean();

    return NextResponse.json(
      carveOuts
        .filter((carveOut) => carveOut.meeting)
        .map((carveOut) => ({
          ...carveOut,
          member: { _id: '', name: 'Club Member' }
        }))
    );
  }

  const carveOuts = await CarveOutModel.find().populate('member', 'name').populate('meeting', 'date').sort({ createdAt: -1 }).lean();

  return NextResponse.json(carveOuts.filter((carveOut) => carveOut.member && carveOut.meeting));
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const { title, type, url, notes, meeting } = await req.json();

    if (!title || !meeting) {
      return NextResponse.json({ message: 'title and meeting are required.' }, { status: 400 });
    }

    await connectToDatabase();
    const carveOut = await CarveOutModel.create({ title, type, url, notes, member: session.member._id, meeting });

    const populated = await CarveOutModel.findById(carveOut._id)
      .populate('member', 'name')
      .populate('meeting', 'date')
      .lean();

    return NextResponse.json(populated, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to create carve out.' },
      { status: 500 }
    );
  }
}
