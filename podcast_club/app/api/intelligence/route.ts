import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { buildClubIntelligenceReport } from '@/lib/intelligence';
import { formatPodcastForClient } from '@/lib/podcasts';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import '@/models/Podcast';
import PodcastModel from '@/models/Podcast';

type ObjectRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is ObjectRecord {
  return Boolean(value && typeof value === 'object');
}

function getId(value: unknown) {
  if (!value) return '';
  if (isObjectRecord(value) && value._id) return String(value._id);
  return String(value);
}

function getName(value: unknown, fallback = 'Unknown') {
  if (isObjectRecord(value) && typeof value.name === 'string' && value.name.trim()) {
    return value.name;
  }
  return fallback;
}

function toIsoDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date || typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

function getMeetingDate(value: unknown) {
  if (!isObjectRecord(value)) return undefined;
  return toIsoDate(value.date);
}

function getPodcastIdsFromMeeting(meeting: ObjectRecord) {
  const ids = new Set<string>();
  const podcasts = Array.isArray(meeting.podcasts) ? meeting.podcasts : [];
  podcasts.forEach((podcast) => {
    const id = getId(podcast);
    if (id) ids.add(id);
  });

  const podcastId = getId(meeting.podcast);
  if (podcastId) ids.add(podcastId);
  return [...ids];
}

export async function GET() {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    await connectToDatabase();

    const [members, podcasts, meetings, carveOuts] = await Promise.all([
      MemberModel.find().select('name').sort({ name: 1 }).lean(),
      PodcastModel.find()
        .populate('submittedBy', 'name')
        .populate('ratings.member', 'name')
        .populate('discussedMeeting', 'date')
        .lean(),
      MeetingModel.find().select('date notes podcast podcasts status completedAt createdAt').lean(),
      CarveOutModel.find()
        .populate('member', 'name')
        .populate('meeting', 'date')
        .populate('fistBumps.member', 'name')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    const meetingNotesByPodcastId = new Map<string, string[]>();
    (meetings as ObjectRecord[]).forEach((meeting) => {
      const notes = typeof meeting.notes === 'string' ? meeting.notes.trim() : '';
      if (!notes) return;

      getPodcastIdsFromMeeting(meeting).forEach((podcastId) => {
        const current = meetingNotesByPodcastId.get(podcastId) || [];
        current.push(notes);
        meetingNotesByPodcastId.set(podcastId, current);
      });
    });

    const podcastInputs = podcasts.map((podcast) => {
      const formatted = formatPodcastForClient(podcast, members);
      return {
        ...formatted,
        meetingNotes: meetingNotesByPodcastId.get(formatted._id) || []
      };
    });

    const carveOutInputs = (carveOuts as ObjectRecord[])
      .filter((carveOut) => carveOut.member && carveOut.meeting)
      .map((carveOut) => {
        const fistBumps = Array.isArray(carveOut.fistBumps) ? carveOut.fistBumps : [];
        return {
          _id: getId(carveOut),
          title: typeof carveOut.title === 'string' ? carveOut.title : 'Untitled carve out',
          type: typeof carveOut.type === 'string' ? carveOut.type : 'other',
          service: typeof carveOut.service === 'string' ? carveOut.service : '',
          url: typeof carveOut.url === 'string' ? carveOut.url : '',
          notes: typeof carveOut.notes === 'string' ? carveOut.notes : '',
          member: { name: getName(carveOut.member, 'Club Member') },
          meeting: { date: getMeetingDate(carveOut.meeting) || '' },
          fistBumps: fistBumps.map((entry) => ({
            member: { name: getName(isObjectRecord(entry) ? entry.member : null, 'Club Member') }
          })),
          createdAt: toIsoDate(carveOut.createdAt)
        };
      });

    const report = await buildClubIntelligenceReport({
      podcasts: podcastInputs,
      carveOuts: carveOutInputs
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('[intelligence:GET] failed', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to build club intelligence.' },
      { status: 500 }
    );
  }
}
