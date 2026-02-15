type SendPasswordResetEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
};

function getBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export function buildPasswordResetUrl(token: string) {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: SendPasswordResetEmailParams) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendApiKey || !from) {
    // Fallback for local/dev when email provider is not configured.
    console.log(`[password-reset] Email fallback for ${to}: ${resetUrl}`);
    return;
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
      subject: 'Reset your Podcast Club password',
      html: `<p>Hi ${name || 'there'},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes and can only be used once.</p>`
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Email provider failed: ${response.status} ${payload}`);
  }
}
