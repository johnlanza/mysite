import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import CarveOutModel from '@/models/CarveOut';
import '@/models/Meeting';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    await connectToDatabase();

    const carveOut = await CarveOutModel.findById(params.id);
    if (!carveOut) {
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    if (String(carveOut.member) === session.member._id) {
      return NextResponse.json({ message: "You can't fist bump your own carve out." }, { status: 400 });
    }

    const alreadyFistBumped = carveOut.fistBumps.some((entry) => String(entry.member) === session.member._id);
    if (alreadyFistBumped) {
      return NextResponse.json({ message: 'You already gave this carve out a fist bump.' }, { status: 400 });
    }

    carveOut.fistBumps.push({ member: session.member._id, createdAt: new Date() });
    await carveOut.save();

    const populated = await CarveOutModel.findById(carveOut._id)
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .lean();

    if (!populated) {
      return NextResponse.json({ message: 'Carve out not found after fist bump.' }, { status: 404 });
    }

    return NextResponse.json(populated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to fist bump carve out.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    await connectToDatabase();

    const carveOut = await CarveOutModel.findById(params.id);
    if (!carveOut) {
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    const existingIndex = carveOut.fistBumps.findIndex((entry) => String(entry.member) === session.member._id);
    if (existingIndex < 0) {
      return NextResponse.json({ message: "You haven't fist bumped this carve out." }, { status: 400 });
    }

    carveOut.fistBumps.splice(existingIndex, 1);
    await carveOut.save();

    const populated = await CarveOutModel.findById(carveOut._id)
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .lean();

    if (!populated) {
      return NextResponse.json({ message: 'Carve out not found after removing fist bump.' }, { status: 404 });
    }

    return NextResponse.json(populated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to remove fist bump.' },
      { status: 500 }
    );
  }
}
