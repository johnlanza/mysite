type SendPasswordResetEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
};

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
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

function getBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
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
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail({ to, subject, html }: SendEmailParams) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendApiKey || !from) {
    return { delivered: false as const, reason: 'not-configured' as const };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Email provider failed: ${response.status} ${payload}`);
  }

  return { delivered: true as const };
}

export function buildPasswordResetUrl(token: string) {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
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
