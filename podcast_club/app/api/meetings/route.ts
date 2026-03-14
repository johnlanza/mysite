import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession } from '@/lib/auth';
import { MAX_MEETING_PODCASTS, normalizeMeetingPodcastIds } from '@/lib/meeting-podcasts';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
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

export async function GET() {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  await connectToDatabase();

  const meetings = await MeetingModel.find()
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
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return NextResponse.json(
    meetings.map((meeting) => ({
      ...formatMeetingPayload(meeting),
      status: meeting.status || (meeting.completedAt ? 'completed' : 'scheduled')
    }))
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { date, host, podcast, podcasts, location, notes } = await req.json();
    const selectedPodcastIds = normalizeMeetingPodcastIds({ podcasts, podcast });

    if (!date || !host) {
      return NextResponse.json({ message: 'date and host are required.' }, { status: 400 });
    }

    if (selectedPodcastIds.length > MAX_MEETING_PODCASTS) {
      return NextResponse.json({ message: `Meetings can include up to ${MAX_MEETING_PODCASTS} podcasts.` }, { status: 400 });
    }

    await connectToDatabase();

    const hostMember = await MemberModel.findById(host).select('address').lean();
    if (!hostMember) {
      return NextResponse.json({ message: 'Host not found.' }, { status: 404 });
    }

    const finalLocation = typeof location === 'string' && location.trim() ? location.trim() : hostMember.address;

    if (!finalLocation) {
      return NextResponse.json({ message: 'location is required.' }, { status: 400 });
    }

    if (selectedPodcastIds.length > 0) {
      const selectedPodcasts = await PodcastModel.find({ _id: { $in: selectedPodcastIds } }).select('status').lean();
      if (selectedPodcasts.length !== selectedPodcastIds.length) {
        return NextResponse.json({ message: 'One or more podcasts were not found.' }, { status: 404 });
      }
      if (selectedPodcasts.some((selectedPodcast) => selectedPodcast.status !== 'pending')) {
        return NextResponse.json({ message: 'Only Podcasts To Discuss can be selected for meetings.' }, { status: 400 });
      }
    }

    const existingScheduled = await MeetingModel.findOne({
      $or: [
        { status: 'scheduled' },
        {
          status: { $exists: false },
          completedAt: null,
          date: { $gte: new Date() }
        }
      ]
    })
      .select('_id')
      .lean();
    const shouldCreateAsCompleted = Boolean(existingScheduled);

    const meeting = await MeetingModel.create({
      date,
      host,
      podcast: selectedPodcastIds[0] || null,
      podcasts: selectedPodcastIds,
      location: finalLocation,
      notes,
      status: shouldCreateAsCompleted ? 'completed' : 'scheduled',
      completedAt: shouldCreateAsCompleted ? new Date() : null
    });

    if (shouldCreateAsCompleted && selectedPodcastIds.length > 0) {
      await PodcastModel.updateMany(
        { _id: { $in: selectedPodcastIds } },
        {
          status: 'discussed',
          discussedMeeting: meeting._id
        }
      );
    }

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
      return NextResponse.json({ message: 'Meeting not found after creation.' }, { status: 404 });
    }

    return NextResponse.json(
      {
        ...formatMeetingPayload(populated),
        status: shouldCreateAsCompleted ? 'completed' : 'scheduled'
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to create meeting.' },
      { status: 500 }
    );
  }
}
