import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession } from '@/lib/auth';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

export async function GET() {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  await connectToDatabase();

  const meetings = await MeetingModel.find()
    .populate('host', 'name address')
    .populate('podcast', 'title host episodeCount episodeNames totalTimeMinutes link notes description')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const now = Date.now();
  return NextResponse.json(
    meetings.map((meeting) => ({
      ...meeting,
      status:
        meeting.status ||
        (meeting.completedAt || (meeting.date && new Date(meeting.date).getTime() < now) ? 'completed' : 'scheduled')
    }))
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const { date, host, podcast, location, notes } = await req.json();
    const normalizedPodcast = typeof podcast === 'string' && podcast.trim() ? podcast.trim() : null;

    if (!date || !host) {
      return NextResponse.json({ message: 'date and host are required.' }, { status: 400 });
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

    if (normalizedPodcast) {
      const selectedPodcast = await PodcastModel.findById(normalizedPodcast).select('status').lean();
      if (!selectedPodcast) {
        return NextResponse.json({ message: 'Podcast not found.' }, { status: 404 });
      }
      if (selectedPodcast.status !== 'pending') {
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
      podcast: normalizedPodcast,
      location: finalLocation,
      notes,
      status: shouldCreateAsCompleted ? 'completed' : 'scheduled',
      completedAt: shouldCreateAsCompleted ? new Date() : null
    });

    if (shouldCreateAsCompleted && normalizedPodcast) {
      await PodcastModel.findByIdAndUpdate(normalizedPodcast, {
        status: 'discussed',
        discussedMeeting: meeting._id
      });
    }

    const populated = await MeetingModel.findById(meeting._id)
      .populate('host', 'name address')
      .populate('podcast', 'title host episodeCount episodeNames totalTimeMinutes link notes description')
      .lean();

    return NextResponse.json(
      {
        ...populated,
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
