import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { formatPodcastForClient, sortPodcastsLikeSheet } from '@/lib/podcasts';
import { getRatingPoints } from '@/lib/ranking';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

export async function GET() {
  const session = await requireSession();
  await connectToDatabase();

  if (!session.ok) {
    const discussed = await PodcastModel.find({ status: 'discussed' })
      .select('title host episodeCount episodeNames totalTimeMinutes link notes status discussedMeeting ratings')
      .populate('discussedMeeting', 'date')
      .sort({ createdAt: -1 })
      .lean();

    const publicPayload = discussed.map((podcast) => ({
      _id: String(podcast._id),
      title: podcast.title,
      host: podcast.host,
      episodeCount: podcast.episodeCount,
      episodeNames: podcast.episodeNames,
      totalTimeMinutes: podcast.totalTimeMinutes,
      link: podcast.link,
      notes: podcast.notes || '',
      status: 'discussed' as const,
      submittedBy: { _id: '', name: 'Club Member' },
      ratings: [],
      rankingScore: Array.isArray(podcast.ratings)
        ? podcast.ratings.reduce((sum, rating) => sum + Number(rating?.points || 0), 0)
        : 0,
      missingVoters: [],
      discussedMeeting:
        podcast.discussedMeeting && typeof podcast.discussedMeeting === 'object' && '_id' in podcast.discussedMeeting
          ? String(podcast.discussedMeeting._id)
          : podcast.discussedMeeting
            ? String(podcast.discussedMeeting)
            : null,
      discussedMeetingDate:
        podcast.discussedMeeting && typeof podcast.discussedMeeting === 'object' && 'date' in podcast.discussedMeeting
          ? (() => {
              const raw = (podcast.discussedMeeting as { date?: unknown }).date;
              if (!(raw instanceof Date) && typeof raw !== 'string' && typeof raw !== 'number') {
                return null;
              }
              const parsed = new Date(raw);
              return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
            })()
          : null
    }));

    return NextResponse.json(publicPayload);
  }

  const [members, podcasts] = await Promise.all([
    MemberModel.find().select('name').sort({ name: 1 }).lean(),
    PodcastModel.find()
      .populate('submittedBy', 'name')
      .populate('ratings.member', 'name')
      .populate('discussedMeeting', 'date')
      .lean()
  ]);

  const formatted = podcasts.map((podcast) => formatPodcastForClient(podcast, members));
  return NextResponse.json(sortPodcastsLikeSheet(formatted));
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const { title, host, episodeCount, episodeNames, totalTimeMinutes, link, notes } = await req.json();
    const normalizedTitle = String(title || '').trim();
    const normalizedHost = String(host || '').trim();
    const normalizedEpisodeNames = String(episodeNames || '').trim();
    const normalizedLink = String(link || '').trim();
    const normalizedNotes = String(notes || '').trim();
    const normalizedEpisodeCount = Number(episodeCount);
    const normalizedTotalMinutes = Number(totalTimeMinutes);

    if (
      !normalizedTitle ||
      !normalizedHost ||
      !normalizedEpisodeNames ||
      !normalizedLink ||
      !Number.isFinite(normalizedEpisodeCount) ||
      !Number.isFinite(normalizedTotalMinutes)
    ) {
      return NextResponse.json(
        { message: 'Title, host, # of episodes, episode name(s), total time, and link are required.' },
        { status: 400 }
      );
    }

    if (normalizedEpisodeCount < 1 || normalizedTotalMinutes < 1 || !Number.isInteger(normalizedEpisodeCount)) {
      return NextResponse.json(
        { message: '# of episodes must be a whole number, and total time must be at least 1 minute.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const podcast = await PodcastModel.create({
      title: normalizedTitle,
      host: normalizedHost,
      episodeCount: normalizedEpisodeCount,
      episodeNames: normalizedEpisodeNames,
      totalTimeMinutes: normalizedTotalMinutes,
      link: normalizedLink,
      notes: normalizedNotes,
      submittedBy: session.member._id,
      ratings: [
        {
          member: session.member._id,
          value: 'My podcast',
          points: getRatingPoints('My podcast')
        }
      ]
    });

    return NextResponse.json(podcast, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to create podcast.' },
      { status: 500 }
    );
  }
}
