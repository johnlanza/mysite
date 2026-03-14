import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { normalizeMeetingPodcastIds } from '@/lib/meeting-podcasts';
import MeetingModel from '@/models/Meeting';
import PodcastModel from '@/models/Podcast';

function formatMeetingPayload<T extends { podcasts?: unknown[] | null; podcast?: unknown | null }>(meeting: T) {
  const podcasts =
    Array.isArray(meeting.podcasts) && meeting.podcasts.length > 0
      ? meeting.podcasts
      : meeting.podcast
        ? [meeting.podcast]
        : [];

  return {
    ...meeting,
    podcasts,
    podcast: podcasts[0] || null
  };
}

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

    const alreadyCompleted = meeting.status === 'completed' || Boolean(meeting.completedAt);
    if (alreadyCompleted) {
      return NextResponse.json({ message: 'Meeting is already completed.' }, { status: 400 });
    }
    const meetingPodcastIds = normalizeMeetingPodcastIds({
      podcasts: Array.isArray(meeting.podcasts) ? meeting.podcasts.map((podcast) => String(podcast)) : [],
      podcast: meeting.podcast ? String(meeting.podcast) : null
    });

    if (meetingPodcastIds.length === 0) {
      return NextResponse.json({ message: 'Select a podcast before completing this meeting.' }, { status: 400 });
    }

    meeting.status = 'completed';
    meeting.completedAt = new Date();
    meeting.notes = completionNotes;
    meeting.set({
      podcast: meetingPodcastIds[0],
      podcasts: meetingPodcastIds
    });
    await meeting.save();

    await PodcastModel.updateMany(
      { _id: { $in: meetingPodcastIds } },
      {
        status: 'discussed',
        discussedMeeting: meeting._id
      }
    );

    const populated = await MeetingModel.findById(meeting._id)
      .populate('host', 'name address')
      .populate({
        path: 'podcast',
        select: 'title host episodeCount episodeNames totalTimeMinutes link notes description submittedBy',
        populate: { path: 'submittedBy', select: 'name' }
      })
      .populate({
        path: 'podcasts',
        select: 'title host episodeCount episodeNames totalTimeMinutes link notes description submittedBy',
        populate: { path: 'submittedBy', select: 'name' }
      })
      .lean();

    if (!populated) {
      return NextResponse.json({ message: 'Meeting not found after completion.' }, { status: 404 });
    }

    return NextResponse.json(formatMeetingPayload(populated));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to complete meeting.' },
      { status: 500 }
    );
  }
}
