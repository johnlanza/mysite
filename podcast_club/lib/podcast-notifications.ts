import { connectToDatabase } from '@/lib/db';
import {
  isEmailDeliveryConfigured,
  sendNewPodcastEmail,
  sendPodcastEmailReport,
  sendWeeklyReviewReminderEmail
} from '@/lib/email';
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

async function sendAdminEmailReports({
  admins,
  mailingName,
  sentRecipients,
  failedRecipients
}: {
  admins: AdminRecipient[];
  mailingName: string;
  sentRecipients: EmailReportRecipient[];
  failedRecipients: EmailReportRecipient[];
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
        failedRecipients
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
        notes: podcast.notes || ''
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
    failedRecipients
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

export async function runWeeklyPodcastReviewSweep({
  reminderKey = getWeekKey(),
  mailingName = 'Weekly review reminders'
}: {
  reminderKey?: string;
  mailingName?: string;
} = {}) {
  if (!isEmailDeliveryConfigured()) {
    return { sent: 0, skipped: 0, failed: 0, notConfigured: true };
  }

  await connectToDatabase();
  const [members, podcasts] = await Promise.all([
    MemberModel.find().select('name email isAdmin').lean(),
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
        weeklyPodcastReminderKey: { $ne: reminderKey }
      },
      { $set: { weeklyPodcastReminderKey: reminderKey } }
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
          { _id: member._id, weeklyPodcastReminderKey: reminderKey },
          { $unset: { weeklyPodcastReminderKey: 1 } }
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
        { _id: member._id, weeklyPodcastReminderKey: reminderKey },
        { $unset: { weeklyPodcastReminderKey: 1 } }
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
    failedRecipients
  });

  return { sent, skipped, failed, notConfigured: false, adminReport };
}
