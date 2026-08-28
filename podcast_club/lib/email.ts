import { isReadOnlyPreview } from '@/lib/preview-mode';

type SendPasswordResetEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
};

type SendEmailLoginLinkParams = {
  to: string;
  name: string;
  loginUrl: string;
  loginCode: string;
};

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  scheduledAt?: string;
  idempotencyKey?: string;
};

type SendMemberAppAnnouncementEmailParams = {
  to: string;
  recipientName: string;
  scheduledAt: string;
  idempotencyKey: string;
};

type PodcastEmailDetails = {
  title: string;
  host: string;
  episodeCount: number;
  episodeNames: string;
  totalTimeMinutes: number;
  link: string;
  notes?: string;
};

type SendNewPodcastEmailParams = PodcastEmailDetails & {
  to: string;
  recipientName: string;
  submittedByName: string;
};

type SendWeeklyReviewReminderEmailParams = {
  to: string;
  recipientName: string;
  podcasts: PodcastEmailDetails[];
};

type EmailReportRecipient = {
  name: string;
  email: string;
  details?: string;
};

type SendPodcastEmailReportParams = {
  to: string;
  recipientName: string;
  mailingName: string;
  sentRecipients: EmailReportRecipient[];
  failedRecipients: EmailReportRecipient[];
};

function getBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function isEmailDeliveryConfigured() {
  return !isReadOnlyPreview() && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function isEmailLoginConfigured() {
  if (!isEmailDeliveryConfigured() || !process.env.APP_BASE_URL) return false;
  try {
    const url = new URL(process.env.APP_BASE_URL);
    return url.protocol === 'https:' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

async function sendEmail({
  to,
  subject,
  html,
  scheduledAt,
  idempotencyKey
}: SendEmailParams) {
  if (isReadOnlyPreview()) {
    return { delivered: false as const, reason: 'preview-read-only' as const };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendApiKey || !from) {
    return { delivered: false as const, reason: 'not-configured' as const };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {})
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Email provider failed: ${response.status} ${payload}`);
  }

  const payload = (await response.json()) as { id?: string };
  return { delivered: true as const, emailId: payload.id || null };
}

export function buildPasswordResetUrl(token: string) {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildEmailLoginUrl(token: string) {
  return `${getBaseUrl()}/email-login?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: SendPasswordResetEmailParams) {
  const result = await sendEmail({
    to,
    subject: 'Reset your Podcast Club password',
    html: `<p>Hi ${escapeHtml(name || 'there')},</p><p>Use this link to reset your password:</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p><p>This link expires in 30 minutes and can only be used once.</p>`
  });

  if (!result.delivered) {
    // Fallback for local/dev when email provider is not configured.
    console.log(`[password-reset] Email fallback for ${to}: ${resetUrl}`);
  }
}

export async function sendEmailLoginLink({ to, name, loginUrl, loginCode }: SendEmailLoginLinkParams) {
  return sendEmail({
    to,
    subject: 'Your Royal Podcast Society sign-in link',
    html: [
      `<p>Hi ${escapeHtml(name || 'there')},</p>`,
      '<p>Use this secure link to sign in to the Royal Podcast Society. No password is required.</p>',
      `<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2f2d2e;color:#fff;text-decoration:none;font-weight:700">Sign in to the Royal Podcast Society</a></p>`,
      '<p>If you are signing in from the Society app on your Home Screen, enter this one-time code inside the app:</p>',
      `<p style="font-size:22px;font-weight:800;letter-spacing:0.08em">${escapeHtml(loginCode)}</p>`,
      '<p>The link and code expire in 15 minutes. Using either one invalidates both. If you did not request them, you can ignore this email.</p>'
    ].join('')
  });
}

export async function sendNewPodcastEmail({
  to,
  recipientName,
  submittedByName,
  title,
  host,
  episodeCount,
  episodeNames,
  totalTimeMinutes,
  link,
  notes
}: SendNewPodcastEmailParams) {
  return sendEmail({
    to,
    subject: `New podcast added: ${title}`,
    html: [
      `<p>Hi ${escapeHtml(recipientName || 'there')},</p>`,
      `<p><strong>${escapeHtml(submittedByName)}</strong> added a podcast for the club:</p>`,
      `<h2>${escapeHtml(title)}</h2>`,
      '<ul>',
      `<li><strong>Host:</strong> ${escapeHtml(host)}</li>`,
      `<li><strong>Episode${episodeCount === 1 ? '' : 's'}:</strong> ${escapeHtml(episodeNames)}</li>`,
      `<li><strong>Episode count:</strong> ${escapeHtml(episodeCount)}</li>`,
      `<li><strong>Total time:</strong> ${escapeHtml(totalTimeMinutes)} minutes</li>`,
      notes ? `<li><strong>Notes:</strong> ${escapeHtml(notes)}</li>` : '',
      '</ul>',
      `<p><a href="${escapeHtml(link)}">Listen to the podcast</a></p>`,
      `<p><a href="${escapeHtml(`${getBaseUrl()}/podcasts`)}">Review it in Podcast Club</a></p>`
    ].join('')
  });
}

export async function sendWeeklyReviewReminderEmail({
  to,
  recipientName,
  podcasts
}: SendWeeklyReviewReminderEmailParams) {
  const podcastItems = podcasts
    .map(
      (podcast) =>
        `<li style="margin-bottom:16px"><strong>${escapeHtml(podcast.title)}</strong> — ${escapeHtml(podcast.host)}<br>` +
        `${escapeHtml(podcast.episodeNames)} · ${escapeHtml(podcast.totalTimeMinutes)} minutes<br>` +
        `<a href="${escapeHtml(podcast.link)}">Listen</a></li>`
    )
    .join('');

  return sendEmail({
    to,
    subject: `${podcasts.length} podcast${podcasts.length === 1 ? '' : 's'} awaiting your review`,
    html: [
      `<p>Hi ${escapeHtml(recipientName || 'there')},</p>`,
      `<p>${podcasts.length === 1 ? 'This podcast is' : 'These podcasts are'} still waiting for your review:</p>`,
      `<ul>${podcastItems}</ul>`,
      `<p><a href="${escapeHtml(`${getBaseUrl()}/podcasts`)}">Review your pending podcasts</a></p>`
    ].join('')
  });
}

export async function sendMemberAppAnnouncementEmail({
  to,
  recipientName,
  scheduledAt,
  idempotencyKey
}: SendMemberAppAnnouncementEmailParams) {
  const appUrl = getBaseUrl();
  const moreUrl = `${appUrl}/more`;

  return sendEmail({
    to,
    scheduledAt,
    idempotencyKey,
    subject: 'The Royal Podcast Society is now a web app',
    html: [
      `<p>Hi ${escapeHtml(recipientName || 'there')},</p>`,
      '<p><strong>The Royal Podcast Society is now a web app you can install on your phone—complete with our new theme music, per Steve’s request.</strong> 👑🎧</p>',
      `<p>To add it to your phone, visit <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> while signed in, open <strong>More</strong>, and tap <strong>NEW! Put the Society on Your Home Screen</strong>. Choose <strong>Show me how</strong> or <strong>Install Society App</strong> for instructions tailored to your iPhone or Android.</p>`,
      `<p><a href="${escapeHtml(moreUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2f2d2e;color:#fff;text-decoration:none;font-weight:700">Open the Royal Podcast Society</a></p>`,
      '<p>And a reminder to explore the recently added Discovery BETA and your Society Portrait. Be sure to open the full portrait—the detailed AI-written profile is the funny part.</p>'
    ].join('')
  });
}

export async function sendPodcastEmailReport({
  to,
  recipientName,
  mailingName,
  sentRecipients,
  failedRecipients
}: SendPodcastEmailReportParams) {
  const recipientList = (recipients: EmailReportRecipient[]) =>
    recipients
      .map(
        (recipient) =>
          `<li>${escapeHtml(recipient.name)} (${escapeHtml(recipient.email)})` +
          `${recipient.details ? ` — ${escapeHtml(recipient.details)}` : ''}</li>`
      )
      .join('');

  return sendEmail({
    to,
    subject: `Podcast Club email report: ${mailingName}`,
    html: [
      `<p>Hi ${escapeHtml(recipientName || 'there')},</p>`,
      `<p>Here is the delivery report for <strong>${escapeHtml(mailingName)}</strong>.</p>`,
      `<p><strong>Emailed (${sentRecipients.length}):</strong></p>`,
      sentRecipients.length > 0
        ? `<ul>${recipientList(sentRecipients)}</ul>`
        : '<p>No member emails were delivered.</p>',
      failedRecipients.length > 0
        ? [
            `<p><strong>Could not email (${failedRecipients.length}):</strong></p>`,
            `<ul>${recipientList(failedRecipients)}</ul>`
          ].join('')
        : ''
    ].join('')
  });
}
