import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getRatingPoints, RATING_OPTIONS } from '@/lib/ranking';
import { formatPodcastForClient } from '@/lib/podcasts';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const { rating } = await req.json();
    const ratingValue = String(rating || '').trim();

    if (!ratingValue || !RATING_OPTIONS.includes(ratingValue as (typeof RATING_OPTIONS)[number])) {
      return NextResponse.json({ message: 'A valid rating is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const podcast = await PodcastModel.findById(params.id);

    if (!podcast) {
      return NextResponse.json({ message: 'Podcast not found.' }, { status: 404 });
    }

    if (podcast.status !== 'pending') {
      return NextResponse.json({ message: 'Only pending podcasts can be rated.' }, { status: 400 });
    }

    const isSubmitter = podcast.submittedBy.toString() === session.member._id;

    if (!isSubmitter && ratingValue === 'My podcast') {
      return NextResponse.json(
        { message: 'Only the member who submitted this podcast can use "My podcast".' },
        { status: 400 }
      );
    }

    if (isSubmitter && ratingValue !== 'My podcast') {
      return NextResponse.json(
        { message: 'You cannot change your own submitted podcast rating from "My podcast".' },
        { status: 400 }
      );
    }

    if (
      ratingValue === 'My podcast' &&
      podcast.ratings.some((vote) => vote.value === 'My podcast' && vote.member.toString() !== session.member._id)
    ) {
      return NextResponse.json(
        { message: '"My podcast" has already been selected by another member for this podcast.' },
        { status: 400 }
      );
    }

    const existing = podcast.ratings.findIndex((vote) => vote.member.toString() === session.member._id);
    const points = getRatingPoints(ratingValue);

    if (existing >= 0) {
      podcast.ratings[existing].value = ratingValue;
      podcast.ratings[existing].points = points;
    } else {
      podcast.ratings.push({ member: session.member._id, value: ratingValue, points });
    }

    await podcast.save();

    const [updated, members] = await Promise.all([
      PodcastModel.findById(params.id).populate('submittedBy', 'name').populate('ratings.member', 'name').lean(),
      MemberModel.find().select('name').lean()
    ]);

    if (!updated) {
      return NextResponse.json({ message: 'Podcast not found after update.' }, { status: 404 });
    }

    return NextResponse.json(formatPodcastForClient(updated, members));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to save rating.' },
      { status: 500 }
    );
  }
}
