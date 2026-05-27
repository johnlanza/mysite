import type { NextApiRequest, NextApiResponse } from 'next';
import {
  buildClearedSessionCookieHeader,
  buildSessionCookieHeader,
  getSessionMemberFromCookieValue
} from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import MemberModel from '@/models/Member';

const SESSION_COOKIE = process.env.MYSITE_SESSION_COOKIE || 'mysite_session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    return startPreview(req, res);
  }

  if (req.method === 'DELETE') {
    return stopPreview(req, res);
  }

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).json({ message: 'Method not allowed.' });
}

async function startPreview(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSessionMemberFromCookieValue(req.cookies[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!session.isAdmin) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { memberId } = req.body ?? {};
    const targetId = String(memberId || '').trim();
    if (!targetId) {
      return res.status(400).json({ message: 'memberId is required.' });
    }

    await connectToDatabase();
    const target = await MemberModel.findById(targetId).select('_id').lean();
    if (!target) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(String(target._id), { impersonatorId: session._id }));
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to start preview.'
    });
  }
}

async function stopPreview(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSessionMemberFromCookieValue(req.cookies[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!session.isImpersonating || !session.impersonatorId) {
      return res.status(400).json({ message: 'Not currently previewing another member.' });
    }

    await connectToDatabase();
    const admin = await MemberModel.findById(session.impersonatorId)
      .select('_id isAdmin passwordChangedAt')
      .lean();

    if (!admin || !admin.isAdmin) {
      res.setHeader('Set-Cookie', buildClearedSessionCookieHeader());
      return res.status(401).json({ message: 'Original admin session is no longer valid.' });
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(String(admin._id)));
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to stop preview.'
    });
  }
}
