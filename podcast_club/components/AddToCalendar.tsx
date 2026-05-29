'use client';

import { withBasePath } from '@/lib/base-path';
import {
  createCalendarEventLinks,
  PODCAST_CLUB_MEETING_END_HOUR,
  PODCAST_CLUB_MEETING_START_HOUR,
  PODCAST_CLUB_MEETING_TIME_ZONE
} from '@/lib/calendar';
import { getMeetingPodcasts } from '@/lib/meeting-podcasts';
import type { Meeting, Podcast } from '@/lib/types';

type AddToCalendarProps = {
  meeting: Meeting;
  podcastsById?: Map<string, Podcast>;
  className?: string;
};

export default function AddToCalendar({ meeting, podcastsById, className }: AddToCalendarProps) {
  const meetingPodcasts = getMeetingPodcasts(meeting, podcastsById);
  const podcastSummary =
    meetingPodcasts.length > 0
      ? meetingPodcasts.map((podcast) => podcast.title).join(', ')
      : 'TBD';
  const description = [
    'Time: 7:00 PM-10:00 PM PT',
    `Host: ${meeting.host.name}`,
    `Podcasts: ${podcastSummary}`,
    meeting.notes ? `Notes: ${meeting.notes}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const links = createCalendarEventLinks({
    id: `podcast-club-meeting-${meeting._id}`,
    title: 'Royal Podcast Society Meeting',
    startDate: meeting.date,
    startHour: PODCAST_CLUB_MEETING_START_HOUR,
    endHour: PODCAST_CLUB_MEETING_END_HOUR,
    timeZone: PODCAST_CLUB_MEETING_TIME_ZONE,
    location: meeting.location,
    description
  });

  if (!links) return null;

  return (
    <div className={className ? `add-calendar-panel ${className}` : 'add-calendar-panel'}>
      <div className="add-calendar-copy">
        <span>Add to calendar</span>
        <strong>7:00-10:00 PM PT</strong>
      </div>
      <div className="add-calendar-actions" aria-label="Calendar options">
        <a href={links.googleUrl} target="_blank" rel="noopener noreferrer">
          Google
        </a>
        <a href={withBasePath(`/api/meetings/${meeting._id}/calendar`)} type="text/calendar">
          Apple/Outlook
        </a>
      </div>
    </div>
  );
}
