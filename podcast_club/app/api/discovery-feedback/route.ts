import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import {
  isDiscoveryDiscussionLevel,
  isDiscoveryListenState,
  isDiscoveryReaction,
  isDiscoveryReviewLevel
} from '@/lib/discovery-feedback';
import DiscoveryFeedbackModel from '@/models/DiscoveryFeedback';

function safeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function getMemberFeedback(memberId: string) {
  const [rows, reviewCounts] = await Promise.all([
    DiscoveryFeedbackModel.find({ member: memberId })
      .select([
        'recommendationKey',
        'reaction',
        'themes',
        'discussionSignals',
        'sourceKey',
        'listenState',
        'attention',
        'subjectFit',
        'guestValue',
        'hostQuality',
        'discussionPotential',
        'findGuestElsewhere',
        'guestName',
        'note'
      ].join(' '))
      .lean(),
    DiscoveryFeedbackModel.aggregate<{ _id: string; count: number }>([
      { $match: { listenState: { $in: ['listened', 'stopped'] } } },
      { $group: { _id: '$recommendationKey', count: { $sum: 1 } } }
    ])
  ]);

  const history = Object.fromEntries(rows.map((row) => [row.recommendationKey, {
    reaction: row.reaction,
    themes: row.themes || [],
    discussionSignals: Number(row.discussionSignals || 0),
    sourceKey: row.sourceKey || '',
    listenState: row.listenState,
    attention: row.attention,
    subjectFit: row.subjectFit,
    guestValue: row.guestValue,
    hostQuality: row.hostQuality,
    discussionPotential: row.discussionPotential,
    findGuestElsewhere: Boolean(row.findGuestElsewhere),
    guestName: row.guestName || '',
    note: row.note || ''
  }]));

  return {
    reactions: Object.fromEntries(rows.flatMap((row) => row.reaction ? [[row.recommendationKey, row.reaction]] : [])),
    history,
    reviewCounts: Object.fromEntries(reviewCounts.map((row) => [row._id, row.count]))
  };
}

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });
  await connectToDatabase();
  return NextResponse.json(await getMemberFeedback(session.member._id));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const recommendationKey = safeText(body?.recommendationKey, 240);
  const title = safeText(body?.title, 240);
  const href = safeText(body?.href, 2000);
  const sourceKey = safeText(body?.sourceKey, 240);
  const guestName = safeText(body?.guestName, 120);
  const note = safeText(body?.note, 600);
  const themes = Array.isArray(body?.themes)
    ? body.themes
      .filter((theme): theme is string => typeof theme === 'string')
      .map((theme) => theme.trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 8)
    : [];
  const rawDiscussionSignals = Number(body?.discussionSignals || 0);
  const discussionSignals = Number.isFinite(rawDiscussionSignals)
    ? Math.max(0, Math.min(3, rawDiscussionSignals))
    : 0;
  const remove = body?.remove === true;

  if (!recommendationKey || !title) {
    return NextResponse.json({ message: 'A valid discovery is required.' }, { status: 400 });
  }

  await connectToDatabase();
  if (remove) {
    await DiscoveryFeedbackModel.deleteOne({ member: session.member._id, recommendationKey });
    return NextResponse.json(await getMemberFeedback(session.member._id));
  }

  const hasReviewFields = [
    body?.listenState,
    body?.attention,
    body?.subjectFit,
    body?.guestValue,
    body?.hostQuality,
    body?.discussionPotential
  ].some((value) => value !== undefined);

  if (hasReviewFields) {
    if (
      !isDiscoveryListenState(body?.listenState) ||
      !isDiscoveryReviewLevel(body?.attention) ||
      !isDiscoveryReviewLevel(body?.subjectFit) ||
      !isDiscoveryReviewLevel(body?.guestValue) ||
      !isDiscoveryReviewLevel(body?.hostQuality) ||
      !isDiscoveryDiscussionLevel(body?.discussionPotential)
    ) {
      return NextResponse.json({ message: 'Complete each part of the listening review.' }, { status: 400 });
    }

    await DiscoveryFeedbackModel.findOneAndUpdate(
      { member: session.member._id, recommendationKey },
      {
        $set: {
          title,
          href,
          themes,
          discussionSignals,
          sourceKey,
          listenState: body.listenState,
          attention: body.attention,
          subjectFit: body.subjectFit,
          guestValue: body.guestValue,
          hostQuality: body.hostQuality,
          discussionPotential: body.discussionPotential,
          findGuestElsewhere: body.findGuestElsewhere === true,
          guestName,
          note
        },
        $unset: { reaction: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json(await getMemberFeedback(session.member._id));
  }

  // Preserve the legacy endpoint contract for feedback saved before this review UI.
  if (body?.reaction === null) {
    await DiscoveryFeedbackModel.deleteOne({ member: session.member._id, recommendationKey });
  } else if (isDiscoveryReaction(body?.reaction)) {
    await DiscoveryFeedbackModel.findOneAndUpdate(
      { member: session.member._id, recommendationKey },
      {
        $set: { title, href, reaction: body.reaction, themes, discussionSignals, sourceKey },
        $unset: {
          listenState: 1,
          attention: 1,
          subjectFit: 1,
          guestValue: 1,
          hostQuality: 1,
          discussionPotential: 1,
          findGuestElsewhere: 1,
          guestName: 1,
          note: 1
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    return NextResponse.json({ message: 'A valid listening review is required.' }, { status: 400 });
  }

  return NextResponse.json(await getMemberFeedback(session.member._id));
}
