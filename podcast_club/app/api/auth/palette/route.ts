import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { isPaletteId } from '@/lib/palettes';
import MemberModel from '@/models/Member';

export async function PUT(req: Request) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  const payload = await req.json().catch(() => null);
  if (!isPaletteId(payload?.palette)) {
    return NextResponse.json({ message: 'Choose a valid color palette.' }, { status: 400 });
  }

  await MemberModel.findByIdAndUpdate(session.member._id, { $set: { palette: payload.palette } });
  return NextResponse.json({ palette: payload.palette });
}
