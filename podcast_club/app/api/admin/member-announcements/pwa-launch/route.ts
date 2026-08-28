import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { isEmailDeliveryConfigured, sendMemberAppAnnouncementEmail } from '@/lib/email';
import MemberModel from '@/models/Member';

const ANNOUNCEMENT_KEY = 'pwa-launch-2026-08-29';
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SCHEDULED_AT = '2026-08-29T16:00:00.000Z';

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('execute') === ANNOUNCEMENT_KEY) {
    return POST(new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: DEFAULT_SCHEDULED_AT })
    }));
  }

  return new Response(
    [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>Schedule member announcement</title></head>',
      '<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">',
      '<h1>Schedule member announcement</h1>',
      '<p>Schedule the approved Royal Podcast Society app announcement for every member at 9:00 AM Pacific on August 29, 2026.</p>',
      '<form method="post">',
      `<input type="hidden" name="scheduledAt" value="${DEFAULT_SCHEDULED_AT}">`,
      '<button type="submit" style="font:inherit;padding:.75rem 1rem;cursor:pointer">Schedule member emails</button>',
      '</form></body></html>'
    ].join(''),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Member email delivery is not configured.' }, { status: 503 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    const scheduledAt = contentType.includes('application/json')
      ? String((await req.json()).scheduledAt || '')
      : String((await req.formData()).get('scheduledAt') || '');
    const scheduledDate = new Date(String(scheduledAt || ''));
    const delay = scheduledDate.getTime() - Date.now();

    if (Number.isNaN(scheduledDate.getTime()) || delay < 60_000) {
      return NextResponse.json(
        { message: 'scheduledAt must be a valid time at least one minute in the future.' },
        { status: 400 }
      );
    }

    if (delay > MAX_SCHEDULE_AHEAD_MS) {
      return NextResponse.json(
        { message: 'scheduledAt cannot be more than 30 days in the future.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const members = await MemberModel.find().select('name email').sort({ name: 1 }).lean();
    const scheduledAtIso = scheduledDate.toISOString();
    const deliveries = await Promise.allSettled(
      members.map((member) =>
        sendMemberAppAnnouncementEmail({
          to: member.email,
          recipientName: member.name,
          scheduledAt: scheduledAtIso,
          idempotencyKey: `${ANNOUNCEMENT_KEY}/${String(member._id)}`
        })
      )
    );

    const scheduled = members.flatMap((member, index) => {
      const delivery = deliveries[index];
      return delivery.status === 'fulfilled' && delivery.value.delivered
        ? [{
            name: member.name,
            email: member.email,
            emailId: delivery.value.emailId
          }]
        : [];
    });
    const failed = members.flatMap((member, index) => {
      const delivery = deliveries[index];
      return delivery.status === 'rejected' ||
        (delivery.status === 'fulfilled' && !delivery.value.delivered)
        ? [{
            name: member.name,
            email: member.email,
            reason: delivery.status === 'rejected'
              ? delivery.reason instanceof Error
                ? delivery.reason.message
                : 'Unknown delivery error'
              : delivery.value.reason
          }]
        : [];
    });

    return NextResponse.json({
      announcement: ANNOUNCEMENT_KEY,
      scheduledAt: scheduledAtIso,
      scheduled,
      failed
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to schedule the member announcement.' },
      { status: 500 }
    );
  }
}
