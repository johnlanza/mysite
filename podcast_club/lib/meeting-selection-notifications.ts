import { getMeetingSelectionChangeKind } from '@/lib/meeting-selection-change';
import { notifyMembersOfMeetingSelection } from '@/lib/podcast-notifications';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

type MeetingSelectionPodcast = {
  _id: unknown;
  title: string;
  host: string;
  episodeCount: number;
  episodeNames: string;
  totalTimeMinutes: number;
  link: string;
  notes?: string | null;
};

export async function notifyMeetingSelectionChange({
  meetingId,
  meetingDate,
  hostId,
  meetingStatus,
  previousPodcastIds,
  nextPodcastIds
}: {
  meetingId: string;
  meetingDate: Date | string;
  hostId: string;
  meetingStatus: 'scheduled' | 'completed';
  previousPodcastIds: string[];
  nextPodcastIds: string[];
}) {
  if (meetingStatus !== 'scheduled') return null;
  const changeKind = getMeetingSelectionChangeKind(previousPodcastIds, nextPodcastIds);
  if (!changeKind) return null;

  const [host, selectedPodcasts] = await Promise.all([
    MemberModel.findById(hostId).select('name').lean(),
    nextPodcastIds.length > 0
      ? PodcastModel.find({ _id: { $in: nextPodcastIds } })
          .select('title host episodeCount episodeNames totalTimeMinutes link notes')
          .lean<MeetingSelectionPodcast[]>()
      : Promise.resolve([] as MeetingSelectionPodcast[])
  ]);
  if (!host) throw new Error('Meeting host was not found for the selection notification.');

  const podcastsById = new Map(selectedPodcasts.map((podcast) => [String(podcast._id), podcast]));
  const orderedPodcasts = nextPodcastIds
    .map((podcastId) => podcastsById.get(podcastId))
    .filter((podcast): podcast is MeetingSelectionPodcast => Boolean(podcast));
  if (orderedPodcasts.length !== nextPodcastIds.length) {
    throw new Error('A selected podcast was not found for the selection notification.');
  }

  return notifyMembersOfMeetingSelection({
    meetingId,
    meetingDate,
    hostName: host.name,
    changeKind,
    previousPodcastIds,
    nextPodcastIds,
    podcasts: orderedPodcasts.map((podcast) => ({
      ...podcast,
      ratings: []
    }))
  });
}
