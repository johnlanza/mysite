import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import CarveOutModel from '@/models/CarveOut';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json()) as {
      title?: string;
      type?: 'book' | 'video' | 'movie' | 'podcast' | 'article' | 'other';
      url?: string;
      notes?: string;
      meeting?: string;
    };

    await connectToDatabase();
    const existing = await CarveOutModel.findById(params.id).select('member').lean();
    if (!existing) {
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    const isOwner = String(existing.member) === session.member._id;
    if (!session.member.isAdmin && !isOwner) {
      return NextResponse.json({ message: 'Only admins or the member who submitted this carve out can edit it.' }, { status: 403 });
    }

    const nextTitle = String(body.title || '').trim();
    const nextMeeting = String(body.meeting || '').trim();
    if (!nextTitle || !nextMeeting) {
      return NextResponse.json({ message: 'title and meeting are required.' }, { status: 400 });
    }

    const updated = await CarveOutModel.findByIdAndUpdate(
      params.id,
      {
        title: nextTitle,
        ...(body.type ? { type: body.type } : {}),
        url: String(body.url || '').trim(),
        notes: String(body.notes || '').trim(),
        meeting: nextMeeting
      },
      { new: true, runValidators: true }
    )
      .populate('member', 'name')
      .populate('meeting', 'date')
      .lean();

    if (!updated) {
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to update carve out.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirmText?: string };
    if (String(body.confirmText || '').trim() !== 'DELETE') {
      return NextResponse.json({ message: 'Type DELETE to confirm carve out deletion.' }, { status: 400 });
    }

    await connectToDatabase();
    const carveOut = await CarveOutModel.findById(params.id).select('title member').lean();
    if (!carveOut) {
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    const isOwner = String(carveOut.member) === session.member._id;
    if (!session.member.isAdmin && !isOwner) {
      return NextResponse.json(
        { message: 'Only admins or the member who submitted this carve out can delete it.' },
        { status: 403 }
      );
    }

    await CarveOutModel.findByIdAndDelete(params.id);
    return NextResponse.json({ message: 'Carve out deleted.', carveOut: { _id: String(carveOut._id), title: carveOut.title } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to delete carve out.' },
      { status: 500 }
    );
  }
}
