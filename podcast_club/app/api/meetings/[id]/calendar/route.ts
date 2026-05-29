import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import {
  createCalendarEventLinks,
  PODCAST_CLUB_MEETING_END_HOUR,
  PODCAST_CLUB_MEETING_START_HOUR,
  PODCAST_CLUB_MEETING_TIME_ZONE
} from '@/lib/calendar';
import { connectToDatabase } from '@/lib/db';
import MeetingModel from '@/models/Meeting';
import '@/models/Podcast';

type CalendarMeeting = {
  _id: unknown;
  date: Date | string;
  host?: { name?: string } | null;
  podcast?: { title?: string } | null;
  podcasts?: { title?: string }[];
  location?: string;
  notes?: string;
  status?: 'scheduled' | 'completed';
  completedAt?: Date | string | null;
};

function isCompletedMeeting(meeting: CalendarMeeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return false;
}

function getPodcastSummary(meeting: CalendarMeeting) {
  const podcasts = meeting.podcasts && meeting.podcasts.length > 0 ? meeting.podcasts : meeting.podcast ? [meeting.podcast] : [];
  const titles = podcasts.map((podcast) => podcast.title).filter((title): title is string => Boolean(title));

  return titles.length > 0 ? titles.join(', ') : 'TBD';
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  await connectToDatabase();

  const meeting = await MeetingModel.findById(params.id)
    .populate('host', 'name')
    .populate('podcast', 'title')
    .populate('podcasts', 'title')
    .lean<CalendarMeeting | null>();

  if (!meeting) {
    return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
  }

  if (isCompletedMeeting(meeting)) {
    return NextResponse.json({ message: 'Calendar files are only available for upcoming meetings.' }, { status: 400 });
  }

  const description = [
    'Time: 7:00 PM-10:00 PM PT',
    `Host: ${meeting.host?.name || 'TBD'}`,
    `Podcasts: ${getPodcastSummary(meeting)}`,
    meeting.notes ? `Notes: ${meeting.notes}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const links = createCalendarEventLinks({
    id: `podcast-club-meeting-${String(meeting._id)}`,
    title: 'Royal Podcast Society Meeting',
    startDate: new Date(meeting.date).toISOString(),
    startHour: PODCAST_CLUB_MEETING_START_HOUR,
    endHour: PODCAST_CLUB_MEETING_END_HOUR,
    timeZone: PODCAST_CLUB_MEETING_TIME_ZONE,
    location: meeting.location || '',
    description
  });

  if (!links) {
    return NextResponse.json({ message: 'Meeting date is invalid.' }, { status: 400 });
  }

  return new NextResponse(links.icsContent, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${links.icsFilename}"`,
      'Content-Type': 'text/calendar; charset=utf-8'
    }
  });
}
