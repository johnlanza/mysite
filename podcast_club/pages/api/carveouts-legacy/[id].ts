import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionMemberFromCookieValue } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { normalizeCarveOutServiceInput } from '@/lib/carveout-meta';
import CarveOutModel from '@/models/CarveOut';
import '@/models/Meeting';

const SESSION_COOKIE = process.env.MYSITE_SESSION_COOKIE || 'mysite_session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'PATCH') {
    return updateCarveOut(req, res);
  }

  if (req.method === 'DELETE') {
    return deleteCarveOut(req, res);
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ message: 'Method not allowed.' });
}

async function updateCarveOut(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSessionMemberFromCookieValue(req.cookies[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const id = String(req.query.id || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Carve out id is required.' });
    }

    const body = req.body ?? {};
    const nextTitle = String(body.title || '').trim();
    const nextMeeting = String(body.meeting || '').trim();
    if (!nextTitle || !nextMeeting) {
      return res.status(400).json({ message: 'title and meeting are required.' });
    }

    await connectToDatabase();
    const existing = await CarveOutModel.findById(id).select('member').lean();
    if (!existing) {
      return res.status(404).json({ message: 'Carve out not found.' });
    }

    const isOwner = String(existing.member) === session._id;
    if (!session.isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Only admins or the member who submitted this carve out can edit it.' });
    }

    const updated = await CarveOutModel.findByIdAndUpdate(
      id,
      {
        title: nextTitle,
        ...(body.type ? { type: body.type } : {}),
        service: normalizeCarveOutServiceInput(body.service),
        url: String(body.url || '').trim(),
        notes: String(body.notes || '').trim(),
        meeting: nextMeeting
      },
      { new: true, runValidators: true }
    )
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .lean();

    if (!updated) {
      return res.status(404).json({ message: 'Carve out not found.' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to update carve out.'
    });
  }
}

async function deleteCarveOut(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSessionMemberFromCookieValue(req.cookies[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const id = String(req.query.id || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Carve out id is required.' });
    }

    const confirmText = String(req.body?.confirmText || '').trim();
    if (confirmText !== 'DELETE') {
      return res.status(400).json({ message: 'Type DELETE to confirm carve out deletion.' });
    }

    await connectToDatabase();
    const carveOut = await CarveOutModel.findById(id).select('title member').lean();
    if (!carveOut) {
      return res.status(404).json({ message: 'Carve out not found.' });
    }

    const isOwner = String(carveOut.member) === session._id;
    if (!session.isAdmin && !isOwner) {
      return res.status(403).json({
        message: 'Only admins or the member who submitted this carve out can delete it.'
      });
    }

    await CarveOutModel.findByIdAndDelete(id);
    return res.status(200).json({
      message: 'Carve out deleted.',
      carveOut: { _id: String(carveOut._id), title: carveOut.title }
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to delete carve out.'
    });
  }
}
