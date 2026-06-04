import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeCarveOutServiceInput } from '@/lib/carveout-meta';
import CarveOutModel from '@/models/CarveOut';
import '@/models/Meeting';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await requireSession();
  if (!session.ok) {
    console.warn('[carveouts:PATCH] auth failed', { status: session.status });
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json()) as {
      title?: string;
      type?: 'book' | 'video' | 'movie' | 'podcast' | 'article' | 'other';
      service?: string;
      url?: string;
      notes?: string;
      meeting?: string;
    };

    const { id } = await params;

    await connectToDatabase();
    const existing = await CarveOutModel.findById(id).select('member').lean();
    if (!existing) {
      console.warn('[carveouts:PATCH] not found', { memberId: session.member._id, carveOutId: id });
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    const isOwner = String(existing.member) === session.member._id;
    if (!session.member.isAdmin && !isOwner) {
      console.warn('[carveouts:PATCH] forbidden', { memberId: session.member._id, carveOutId: id });
      return NextResponse.json({ message: 'Only admins or the member who submitted this carve out can edit it.' }, { status: 403 });
    }

    const nextTitle = String(body.title || '').trim();
    const nextMeeting = String(body.meeting || '').trim();
    if (!nextTitle || !nextMeeting) {
      console.warn('[carveouts:PATCH] validation failed', {
        memberId: session.member._id,
        carveOutId: id,
        hasTitle: Boolean(nextTitle),
        hasMeeting: Boolean(nextMeeting)
      });
      return NextResponse.json({ message: 'title and meeting are required.' }, { status: 400 });
    }

    const updated = await CarveOutModel.findByIdAndUpdate(
      id,
      {
        title: nextTitle,
        ...(body.type ? { type: body.type } : {}),
        service: normalizeCarveOutServiceInput(body.service),
        url: String(body.url || '').trim(),
        notes: String(body.notes || '').trim(),
        meeting: nextMeeting
      },
      { new: true, runValidators: true }
    )
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .lean();

    if (!updated) {
      console.warn('[carveouts:PATCH] not found after update', { memberId: session.member._id, carveOutId: id });
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[carveouts:PATCH] update failed', {
      memberId: session.member._id,
      error
    });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to update carve out.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const session = await requireSession();
  if (!session.ok) {
    console.warn('[carveouts:DELETE] auth failed', { status: session.status });
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirmText?: string };
    if (String(body.confirmText || '').trim() !== 'DELETE') {
      console.warn('[carveouts:DELETE] confirmation failed', { memberId: session.member._id });
      return NextResponse.json({ message: 'Type DELETE to confirm carve out deletion.' }, { status: 400 });
    }

    const { id } = await params;

    await connectToDatabase();
    const carveOut = await CarveOutModel.findById(id).select('title member').lean();
    if (!carveOut) {
      console.warn('[carveouts:DELETE] not found', { memberId: session.member._id, carveOutId: id });
      return NextResponse.json({ message: 'Carve out not found.' }, { status: 404 });
    }

    const isOwner = String(carveOut.member) === session.member._id;
    if (!session.member.isAdmin && !isOwner) {
      console.warn('[carveouts:DELETE] forbidden', { memberId: session.member._id, carveOutId: id });
      return NextResponse.json(
        { message: 'Only admins or the member who submitted this carve out can delete it.' },
        { status: 403 }
      );
    }

    await CarveOutModel.findByIdAndDelete(id);
    return NextResponse.json({ message: 'Carve out deleted.', carveOut: { _id: String(carveOut._id), title: carveOut.title } });
  } catch (error) {
    console.error('[carveouts:DELETE] delete failed', {
      memberId: session.member._id,
      error
    });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to delete carve out.' },
      { status: 500 }
    );
  }
}
