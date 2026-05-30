import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionMemberFromCookieValue } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { normalizeCarveOutServiceInput } from '@/lib/carveout-meta';
import CarveOutModel from '@/models/CarveOut';
import '@/models/Meeting';

const SESSION_COOKIE = process.env.MYSITE_SESSION_COOKIE || 'mysite_session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  try {
    const session = await getSessionMemberFromCookieValue(req.cookies[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { title, type, service, url, notes, meeting } = req.body ?? {};
    const nextTitle = String(title || '').trim();
    const nextMeeting = String(meeting || '').trim();

    if (!nextTitle || !nextMeeting) {
      return res.status(400).json({ message: 'title and meeting are required.' });
    }

    await connectToDatabase();
    const carveOut = await CarveOutModel.create({
      title: nextTitle,
      type,
      service: normalizeCarveOutServiceInput(service),
      url: String(url || '').trim(),
      notes: String(notes || '').trim(),
      member: session._id,
      meeting: nextMeeting
    });

    const populated = await CarveOutModel.findById(carveOut._id)
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .lean();

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to create carve out.'
    });
  }
}
