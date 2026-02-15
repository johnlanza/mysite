import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import MeetingModel from '@/models/Meeting';
import PodcastModel from '@/models/Podcast';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { notes } = await req.json();
    const completionNotes = String(notes || '').trim();
    if (!completionNotes) {
      return NextResponse.json({ message: 'Completion notes are required.' }, { status: 400 });
    }

    await connectToDatabase();

    const meeting = await MeetingModel.findById(params.id);
    if (!meeting) {
      return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
    }

    const alreadyCompleted =
      meeting.status === 'completed' || Boolean(meeting.completedAt) || new Date(meeting.date).getTime() < Date.now();
    if (alreadyCompleted) {
      return NextResponse.json({ message: 'Meeting is already completed.' }, { status: 400 });
    }
    if (!meeting.podcast) {
      return NextResponse.json({ message: 'Select a podcast before completing this meeting.' }, { status: 400 });
    }

    meeting.status = 'completed';
    meeting.completedAt = new Date();
    meeting.notes = completionNotes;
    await meeting.save();

    await PodcastModel.findByIdAndUpdate(meeting.podcast, {
      status: 'discussed',
      discussedMeeting: meeting._id
    });

    const populated = await MeetingModel.findById(meeting._id)
      .populate('host', 'name address')
      .populate('podcast', 'title host episodeCount episodeNames totalTimeMinutes link notes description')
      .lean();

    return NextResponse.json(populated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to complete meeting.' },
      { status: 500 }
    );
  }
}
