import type { Types } from 'mongoose';

type MemberLite = { _id: Types.ObjectId | string; name: string };
type MemberRef = MemberLite | Types.ObjectId | string;

type RatingLite = {
  member: MemberRef;
  value: string;
  points: number;
};

type PodcastLeanLike = {
  _id: Types.ObjectId | string;
  title: string;
  host?: string;
  episodeCount?: number;
  episodeNames?: string;
  totalTimeMinutes?: number;
  link: string;
  notes?: string | null;
  description?: string | null;
  status: 'pending' | 'discussed';
  submittedBy: MemberRef;
  ratings?: RatingLite[];
  discussedMeeting?: Types.ObjectId | string | { _id?: Types.ObjectId | string; date?: Date | string | null } | null;
  createdAt?: Date;
};

export function formatPodcastForClient(podcast: PodcastLeanLike, members: MemberLite[]) {
  const submittedBy =
    typeof podcast.submittedBy === 'object' &&
    podcast.submittedBy !== null &&
    '_id' in podcast.submittedBy &&
    'name' in podcast.submittedBy
      ? { _id: String(podcast.submittedBy._id), name: String(podcast.submittedBy.name) }
      : { _id: String(podcast.submittedBy), name: 'Unknown' };

  const ratings = (podcast.ratings || []).map((rating) => ({
    member:
      typeof rating.member === 'object' &&
      rating.member !== null &&
      '_id' in rating.member &&
      'name' in rating.member
        ? { _id: String(rating.member._id), name: String(rating.member.name) }
        : { _id: String(rating.member), name: 'Unknown' },
    value: rating.value,
    points: rating.points
  }));

  const rankingScore = ratings.reduce((total, rating) => total + rating.points, 0);
  const voterIds = new Set(ratings.map((rating) => String(rating.member._id)));
  const missingVoters = members
    .filter((member) => !voterIds.has(String(member._id)))
    .map((member) => member.name)
    .sort((a, b) => a.localeCompare(b));

  const discussedMeetingId =
    podcast.discussedMeeting &&
    typeof podcast.discussedMeeting === 'object' &&
    '_id' in podcast.discussedMeeting &&
    podcast.discussedMeeting._id
      ? String(podcast.discussedMeeting._id)
      : podcast.discussedMeeting
        ? String(podcast.discussedMeeting)
        : null;

  const discussedMeetingDate =
    podcast.discussedMeeting &&
    typeof podcast.discussedMeeting === 'object' &&
    'date' in podcast.discussedMeeting &&
    podcast.discussedMeeting.date
      ? new Date(podcast.discussedMeeting.date).toISOString()
      : null;

  return {
    _id: String(podcast._id),
    title: podcast.title,
    host: podcast.host || '',
    episodeCount: podcast.episodeCount ?? 0,
    episodeNames: podcast.episodeNames || '',
    totalTimeMinutes: podcast.totalTimeMinutes ?? 0,
    link: podcast.link,
    notes: podcast.notes || podcast.description || '',
    status: podcast.status,
    submittedBy,
    ratings,
    rankingScore,
    missingVoters,
    discussedMeeting: discussedMeetingId,
    discussedMeetingDate,
    createdAt: podcast.createdAt ? new Date(podcast.createdAt).toISOString() : undefined
  };
}

export function sortPodcastsLikeSheet<T extends { missingVoters: string[]; rankingScore: number; title: string }>(podcasts: T[]) {
  return podcasts.sort((a, b) => {
    if (b.missingVoters.length !== a.missingVoters.length) {
      return b.missingVoters.length - a.missingVoters.length;
    }
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }
    return a.title.localeCompare(b.title);
  });
}
