import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import MeetingFeedbackModel, { MEETING_FEEDBACK_OPTIONS } from '@/models/MeetingFeedback';

type FeedbackOption = (typeof MEETING_FEEDBACK_OPTIONS)[number];

function isFeedbackOption(value: unknown): value is FeedbackOption {
  return typeof value === 'string' && MEETING_FEEDBACK_OPTIONS.includes(value as FeedbackOption);
}

async function getFeedbackSummary(podcastId: string, memberId: string) {
  const rows = await MeetingFeedbackModel.find({ podcast: podcastId }).select('member selections').lean();
  const mine = rows.find((row) => String(row.member) === memberId);
  return {
    selections: (mine?.selections || []).filter(isFeedbackOption),
    counts: {
      listen: rows.filter((row) => row.selections.includes('listen')).length,
      discussion: rows.filter((row) => row.selections.includes('discussion')).length,
      surprise: rows.filter((row) => row.selections.includes('surprise')).length
    },
    responseCount: rows.length
  };
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  const podcastId = new URL(request.url).searchParams.get('podcastId') || '';
  if (!mongoose.isValidObjectId(podcastId)) {
    return NextResponse.json({ message: 'A valid podcast is required.' }, { status: 400 });
  }

  await connectToDatabase();
  return NextResponse.json(await getFeedbackSummary(podcastId, session.member._id));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  const body = await request.json().catch(() => null) as {
    podcastId?: unknown;
    meetingId?: unknown;
    selections?: unknown;
  } | null;
  const podcastId = typeof body?.podcastId === 'string' ? body.podcastId : '';
  const meetingId = typeof body?.meetingId === 'string' ? body.meetingId : '';
  if (!mongoose.isValidObjectId(podcastId) || (meetingId && !mongoose.isValidObjectId(meetingId))) {
    return NextResponse.json({ message: 'A valid podcast and meeting are required.' }, { status: 400 });
  }
  if (!Array.isArray(body?.selections) || body.selections.some((value) => !isFeedbackOption(value))) {
    return NextResponse.json({ message: 'Choose one or more valid feedback options.' }, { status: 400 });
  }
  const selections = [...new Set(body.selections as FeedbackOption[])];

  await connectToDatabase();
  if (selections.length === 0) {
    await MeetingFeedbackModel.deleteOne({ member: session.member._id, podcast: podcastId });
  } else {
    await MeetingFeedbackModel.findOneAndUpdate(
      { member: session.member._id, podcast: podcastId },
      { $set: { meeting: meetingId || null, selections } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return NextResponse.json(await getFeedbackSummary(podcastId, session.member._id));
}
