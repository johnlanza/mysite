import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import DiscoveryFeedbackModel, { DISCOVERY_REACTIONS } from '@/models/DiscoveryFeedback';

type DiscoveryReaction = (typeof DISCOVERY_REACTIONS)[number];

function isReaction(value: unknown): value is DiscoveryReaction {
  return typeof value === 'string' && DISCOVERY_REACTIONS.includes(value as DiscoveryReaction);
}

async function getMemberReactions(memberId: string) {
  const rows = await DiscoveryFeedbackModel.find({ member: memberId })
    .select('recommendationKey reaction themes discussionSignals')
    .lean();
  return {
    reactions: Object.fromEntries(rows.map((row) => [row.recommendationKey, row.reaction])),
    history: Object.fromEntries(rows.map((row) => [row.recommendationKey, {
      reaction: row.reaction,
      themes: row.themes || [],
      discussionSignals: Number(row.discussionSignals || 0)
    }]))
  };
}

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });
  await connectToDatabase();
  return NextResponse.json(await getMemberReactions(session.member._id));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  const body = await request.json().catch(() => null) as {
    recommendationKey?: unknown;
    title?: unknown;
    href?: unknown;
    reaction?: unknown;
    themes?: unknown;
    discussionSignals?: unknown;
  } | null;
  const recommendationKey = typeof body?.recommendationKey === 'string' ? body.recommendationKey.trim().slice(0, 240) : '';
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 240) : '';
  const href = typeof body?.href === 'string' ? body.href.trim().slice(0, 2000) : '';
  const themes = Array.isArray(body?.themes)
    ? body.themes.filter((theme): theme is string => typeof theme === 'string').map((theme) => theme.trim().slice(0, 120)).filter(Boolean).slice(0, 8)
    : [];
  const rawDiscussionSignals = Number(body?.discussionSignals || 0);
  const discussionSignals = Number.isFinite(rawDiscussionSignals)
    ? Math.max(0, Math.min(3, rawDiscussionSignals))
    : 0;
  if (!recommendationKey || !title || (body?.reaction !== null && !isReaction(body?.reaction))) {
    return NextResponse.json({ message: 'A valid recommendation and preference are required.' }, { status: 400 });
  }

  await connectToDatabase();
  if (body?.reaction === null) {
    await DiscoveryFeedbackModel.deleteOne({ member: session.member._id, recommendationKey });
  } else {
    await DiscoveryFeedbackModel.findOneAndUpdate(
      { member: session.member._id, recommendationKey },
      { $set: { title, href, reaction: body?.reaction, themes, discussionSignals } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return NextResponse.json(await getMemberReactions(session.member._id));
}
