import { connectToDatabase } from '@/lib/db';
import {
  isEmailDeliveryConfigured,
  sendMeetingSelectionEmail,
  sendNewPodcastEmail,
  sendPodcastEmailReport,
  sendWeeklyReviewReminderEmail,
  type MeetingSelectionEmailPodcast
} from '@/lib/email';
import type { MeetingSelectionChangeKind } from '@/lib/meeting-selection-change';
import { buildEmailIdempotencyKey, buildMeetingSelectionEventFingerprint } from '@/lib/notification-idempotency';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

type PodcastNotificationDetails = {
  _id: unknown;
  title: string;
  host: string;
  episodeCount: number;
  episodeNames: string;
  totalTimeMinutes: number;
  link: string;
  notes?: string | null;
  ratings?: Array<{
    member: unknown;
    value: string;
  }>;
};

function hasReviewFromMember(podcast: PodcastNotificationDetails, memberId: string) {
  return (podcast.ratings || []).some((rating) => {
    const value = String(rating.value || '').trim().toLowerCase();
    return String(rating.member) === memberId && value !== 'no selection';
  });
}

type EmailReportRecipient = {
  name: string;
  email: string;
  details?: string;
};

type AdminRecipient = {
  name: string;
  email: string;
};

type ReminderField = 'weeklyPodcastReminderKey' | 'oneTimePodcastReminderKey';

type MeetingSelectionPodcastDetails = PodcastNotificationDetails;

type ApplePodcastResult = {
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
};

function normalizeArtworkText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function artworkTitleScore(title: string, candidate: string) {
  const expected = normalizeArtworkText(title);
  const actual = normalizeArtworkText(candidate);
  if (!expected || !actual) return 0;
  if (expected === actual) return 1;
  if (expected.includes(actual) || actual.includes(expected)) return 0.9;
  const expectedTokens = new Set(expected.split(' ').filter((token) => token.length > 1));
  const actualTokens = new Set(actual.split(' ').filter((token) => token.length > 1));
  const overlap = [...expectedTokens].filter((token) => actualTokens.has(token)).length;
  return expectedTokens.size > 0 ? overlap / expectedTokens.size : 0;
}

function publicArtworkUrl(value?: string) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchArtworkJson<T>(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'RoyalPodcastSociety/1.0' }
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePodcastEmailArtwork(podcast: MeetingSelectionPodcastDetails) {
  let linkedUrl: URL | null = null;
  try {
    linkedUrl = new URL(podcast.link);
  } catch {
    // Search Apple by title when the saved listening link is not a full URL.
  }

  if (linkedUrl?.hostname.replace(/^www\./, '') === 'open.spotify.com') {
    const payload = await fetchArtworkJson<{ thumbnail_url?: string }>(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(linkedUrl.toString())}`
    );
    const spotifyArtwork = publicArtworkUrl(payload?.thumbnail_url);
    if (spotifyArtwork) return spotifyArtwork;
  }

  const appleId = linkedUrl?.hostname.endsWith('podcasts.apple.com')
    ? linkedUrl.pathname.match(/id(\d+)/i)?.[1]
    : null;
  const endpoint = appleId
    ? `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&entity=podcast`
    : `https://itunes.apple.com/search?term=${encodeURIComponent(`${podcast.title} ${podcast.host}`)}&media=podcast&entity=podcast&limit=8`;
  const payload = await fetchArtworkJson<{ results?: ApplePodcastResult[] }>(endpoint);
  const matches = (payload?.results || [])
    .map((result) => ({
      result,
      score: artworkTitleScore(podcast.title, result.collectionName || '') +
        (normalizeArtworkText(result.artistName || '').includes(normalizeArtworkText(podcast.host)) ? 0.08 : 0)
    }))
    .sort((left, right) => right.score - left.score);
  const best = matches[0];
  if (!best || best.score < 0.58) return null;
  return publicArtworkUrl(
    best.result.artworkUrl600 || (best.result.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.')
  );
}

async function sendAdminEmailReports({
  admins,
  mailingName,
  sentRecipients,
  failedRecipients,
  reportKey
}: {
  admins: AdminRecipient[];
  mailingName: string;
  sentRecipients: EmailReportRecipient[];
  failedRecipients: EmailReportRecipient[];
  reportKey?: string;
}) {
  if (sentRecipients.length === 0 && failedRecipients.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const reports = await Promise.allSettled(
    admins.map((admin) =>
      sendPodcastEmailReport({
        to: admin.email,
        recipientName: admin.name,
        mailingName,
        sentRecipients,
        failedRecipients,
        idempotencyKey: reportKey
          ? buildEmailIdempotencyKey('podcast-report', reportKey, admin.email)
          : undefined
      })
    )
  );

  const failed = reports.filter(
    (report) =>
      report.status === 'rejected' ||
      (report.status === 'fulfilled' && !report.value.delivered)
  );
  for (const report of failed) {
    console.error(
      '[podcast-notifications] Admin email report failed',
      report.status === 'rejected' ? report.reason : report.value.reason
    );
  }

  return {
    sent: reports.length - failed.length,
    failed: failed.length
  };
}

function getWeekKey(date = new Date()) {
  const timeZone = process.env.PODCAST_CLUB_REMINDER_TIME_ZONE || 'America/Los_Angeles';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const thursday = new Date(localDate);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isWeeklyReminderWindow(date = new Date()) {
  const timeZone = process.env.PODCAST_CLUB_REMINDER_TIME_ZONE || 'America/Los_Angeles';
  const reminderHour = Number(process.env.PODCAST_CLUB_REMINDER_HOUR || 9);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.weekday === 'Mon' && Number(values.hour) >= reminderHour;
}

export async function notifyMembersOfNewPodcast(
  podcast: PodcastNotificationDetails,
  submittedByName: string
) {
  if (!isEmailDeliveryConfigured()) {
    return { sent: 0, skipped: 0, failed: 0, notConfigured: true };
  }

  await connectToDatabase();
  const members = await MemberModel.find().select('name email isAdmin').lean();
  const admins = members.filter((member) => member.isAdmin);
  const podcastId = String(podcast._id);
  const deliveries = await Promise.allSettled(
    members.map((member) =>
      sendNewPodcastEmail({
        to: member.email,
        recipientName: member.name,
        submittedByName,
        title: podcast.title,
        host: podcast.host,
        episodeCount: podcast.episodeCount,
        episodeNames: podcast.episodeNames,
        totalTimeMinutes: podcast.totalTimeMinutes,
        link: podcast.link,
        notes: podcast.notes || '',
        idempotencyKey: buildEmailIdempotencyKey('new-podcast', podcastId, String(member._id))
      })
    )
  );

  const failed = deliveries.filter((delivery) => delivery.status === 'rejected');
  for (const delivery of failed) {
    console.error('[podcast-notifications] New podcast email failed', delivery.reason);
  }

  const sentRecipients = members.flatMap((member, index) => {
    const delivery = deliveries[index];
    return delivery.status === 'fulfilled' && delivery.value.delivered
      ? [{ name: member.name, email: member.email }]
      : [];
  });
  const failedRecipients = members.flatMap((member, index) => {
    const delivery = deliveries[index];
    return delivery.status === 'rejected' ||
      (delivery.status === 'fulfilled' && !delivery.value.delivered)
      ? [{ name: member.name, email: member.email }]
      : [];
  });
  const adminReport = await sendAdminEmailReports({
    admins,
    mailingName: `New podcast: ${podcast.title}`,
    sentRecipients,
    failedRecipients,
    reportKey: `new-podcast:${podcastId}`
  });

  return {
    sent: sentRecipients.length,
    skipped: deliveries.filter(
      (delivery) => delivery.status === 'fulfilled' && !delivery.value.delivered
    ).length,
    failed: failed.length,
    notConfigured: false,
    adminReport
  };
}

export async function notifyMembersOfMeetingSelection({
  meetingId,
  meetingDate,
  hostName,
  changeKind,
  previousPodcastIds,
  nextPodcastIds,
  podcasts
}: {
  meetingId: string;
  meetingDate: Date | string;
  hostName: string;
  changeKind: MeetingSelectionChangeKind;
  previousPodcastIds: string[];
  nextPodcastIds: string[];
  podcasts: MeetingSelectionPodcastDetails[];
}) {
  if (!isEmailDeliveryConfigured()) {
    return { sent: 0, skipped: 0, failed: 0, notConfigured: true };
  }

  await connectToDatabase();
  const members = await MemberModel.find().select('name email').lean();
  const emailPodcasts: MeetingSelectionEmailPodcast[] = await Promise.all(
    podcasts.map(async (podcast) => ({
      title: podcast.title,
      host: podcast.host,
      episodeCount: podcast.episodeCount,
      episodeNames: podcast.episodeNames,
      totalTimeMinutes: podcast.totalTimeMinutes,
      link: podcast.link,
      notes: podcast.notes || '',
      artworkUrl: await resolvePodcastEmailArtwork(podcast)
    }))
  );
  const eventFingerprint = buildMeetingSelectionEventFingerprint({
    meetingId,
    changeKind,
    previousPodcastIds,
    nextPodcastIds
  });
  const deliveries = await Promise.allSettled(
    members.map((member) =>
      sendMeetingSelectionEmail({
        to: member.email,
        recipientName: member.name,
        hostName,
        meetingDate,
        meetingId,
        changeKind,
        podcasts: emailPodcasts,
        idempotencyKey: `meeting-selection-${eventFingerprint}-${String(member._id)}`
      })
    )
  );

  for (const delivery of deliveries) {
    if (delivery.status === 'rejected') {
      console.error('[podcast-notifications] Meeting selection email failed', delivery.reason);
    } else if (!delivery.value.delivered) {
      console.error('[podcast-notifications] Meeting selection email skipped', delivery.value.reason);
    }
  }

  return {
    sent: deliveries.filter((delivery) => delivery.status === 'fulfilled' && delivery.value.delivered).length,
    skipped: deliveries.filter((delivery) => delivery.status === 'fulfilled' && !delivery.value.delivered).length,
    failed: deliveries.filter((delivery) => delivery.status === 'rejected').length,
    notConfigured: false
  };
}

export async function runWeeklyPodcastReviewSweep({
  reminderKey = getWeekKey(),
  mailingName = 'Weekly review reminders',
  reminderField = 'weeklyPodcastReminderKey'
}: {
  reminderKey?: string;
  mailingName?: string;
  reminderField?: ReminderField;
} = {}) {
  if (!isEmailDeliveryConfigured()) {
    return { sent: 0, skipped: 0, failed: 0, notConfigured: true };
  }

  await connectToDatabase();
  const [members, podcasts] = await Promise.all([
    MemberModel.find()
      .select('name email isAdmin weeklyPodcastReminderKey oneTimePodcastReminderKey')
      .lean(),
    PodcastModel.find({ status: 'pending' })
      .select('title host episodeCount episodeNames totalTimeMinutes link notes ratings')
      .lean<PodcastNotificationDetails[]>()
  ]);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const sentRecipients: EmailReportRecipient[] = [];
  const failedRecipients: EmailReportRecipient[] = [];

  for (const member of members) {
    const memberId = String(member._id);
    const missingPodcasts = podcasts.filter((podcast) => !hasReviewFromMember(podcast, memberId));
    if (missingPodcasts.length === 0) {
      skipped += 1;
      continue;
    }

    const claimedMember = await MemberModel.findOneAndUpdate(
      {
        _id: member._id,
        [reminderField]: { $ne: reminderKey }
      },
      { $set: { [reminderField]: reminderKey } }
    )
      .select('_id')
      .lean();
    if (!claimedMember) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendWeeklyReviewReminderEmail({
        to: member.email,
        recipientName: member.name,
        idempotencyKey: buildEmailIdempotencyKey('podcast-review', reminderKey, memberId),
        podcasts: missingPodcasts.map((podcast) => ({
          title: podcast.title,
          host: podcast.host,
          episodeCount: podcast.episodeCount,
          episodeNames: podcast.episodeNames,
          totalTimeMinutes: podcast.totalTimeMinutes,
          link: podcast.link,
          notes: podcast.notes || ''
        }))
      });

      if (!result.delivered) {
        await MemberModel.updateOne(
          { _id: member._id, [reminderField]: reminderKey },
          { $unset: { [reminderField]: 1 } }
        );
        failedRecipients.push({
          name: member.name,
          email: member.email,
          details: `${missingPodcasts.length} podcast${missingPodcasts.length === 1 ? '' : 's'} awaiting review`
        });
        skipped += 1;
        continue;
      }

      sent += 1;
      sentRecipients.push({
        name: member.name,
        email: member.email,
        details: `${missingPodcasts.length} podcast${missingPodcasts.length === 1 ? '' : 's'} awaiting review`
      });
    } catch (error) {
      await MemberModel.updateOne(
        { _id: member._id, [reminderField]: reminderKey },
        { $unset: { [reminderField]: 1 } }
      );
      failed += 1;
      failedRecipients.push({
        name: member.name,
        email: member.email,
        details: `${missingPodcasts.length} podcast${missingPodcasts.length === 1 ? '' : 's'} awaiting review`
      });
      console.error('[podcast-notifications] Weekly reminder email failed', {
        memberId,
        error
      });
    }
  }

  const adminReport = await sendAdminEmailReports({
    admins: members.filter((member) => member.isAdmin),
    mailingName,
    sentRecipients,
    failedRecipients,
    reportKey: `review-sweep:${reminderKey}`
  });

  return { sent, skipped, failed, notConfigured: false, adminReport };
}
