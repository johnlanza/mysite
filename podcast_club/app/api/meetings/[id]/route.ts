import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession } from '@/lib/auth';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

async function getFinalLocation(host: string, location?: string) {
  const hostMember = await MemberModel.findById(host).select('address').lean();
  if (!hostMember) {
    return { ok: false as const, status: 404, message: 'Host not found.' };
  }

  const finalLocation = typeof location === 'string' && location.trim() ? location.trim() : hostMember.address;
  if (!finalLocation) {
    return { ok: false as const, status: 400, message: 'location is required.' };
  }

  return { ok: true as const, finalLocation };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json()) as {
      date?: string;
      host?: string;
      podcast?: string | null;
      location?: string;
      notes?: string;
    };
    const { date, host, location, notes } = body;

    await connectToDatabase();

    const existingMeeting = await MeetingModel.findById(params.id).lean();
    if (!existingMeeting) {
      return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
    }

    const isAdmin = session.member.isAdmin;
    const isHost = String(existingMeeting.host) === session.member._id;
    if (!isAdmin && !isHost) {
      return NextResponse.json({ message: 'Only admins or the meeting host can edit this meeting.' }, { status: 403 });
    }

    const nextHost = isAdmin ? host || String(existingMeeting.host) : String(existingMeeting.host);
    const locationResult = await getFinalLocation(nextHost, location);
    if (!locationResult.ok) {
      return NextResponse.json({ message: locationResult.message }, { status: locationResult.status });
    }

    const oldPodcast = existingMeeting.podcast ? String(existingMeeting.podcast) : null;
    const hasPodcastField = Object.prototype.hasOwnProperty.call(body, 'podcast');
    const nextPodcast = hasPodcastField
      ? (typeof body.podcast === 'string' && body.podcast.trim() ? body.podcast.trim() : null)
      : oldPodcast;

    if (nextPodcast && nextPodcast !== oldPodcast) {
      const selectedPodcast = await PodcastModel.findById(nextPodcast).select('status').lean();
      if (!selectedPodcast) {
        return NextResponse.json({ message: 'Podcast not found.' }, { status: 404 });
      }
      if (selectedPodcast.status !== 'pending') {
        return NextResponse.json({ message: 'Only Podcasts To Discuss can be selected for meetings.' }, { status: 400 });
      }
    }

    const updated = await MeetingModel.findByIdAndUpdate(
      params.id,
      {
        ...(date ? { date } : {}),
        ...(isAdmin && host ? { host } : {}),
        ...(hasPodcastField ? { podcast: nextPodcast } : {}),
        location: locationResult.finalLocation,
        ...(typeof notes === 'string' ? { notes } : {})
      },
      { new: true, runValidators: true }
    )
      .populate('host', 'name address')
      .populate('podcast', 'title host episodeCount episodeNames totalTimeMinutes link notes description')
      .lean();

    if (!updated) {
      return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
    }

    if (existingMeeting.status === 'completed' && nextPodcast !== oldPodcast) {
      if (oldPodcast) {
        await PodcastModel.findOneAndUpdate(
          { _id: oldPodcast, discussedMeeting: existingMeeting._id },
          { status: 'pending', discussedMeeting: null }
        );
      }
      if (nextPodcast) {
        await PodcastModel.findByIdAndUpdate(nextPodcast, {
          status: 'discussed',
          discussedMeeting: existingMeeting._id
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to update meeting.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirmText?: string };

    await connectToDatabase();

    const meeting = await MeetingModel.findById(params.id).lean();
    if (!meeting) {
      return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
    }

    const isCompleted =
      meeting.status === 'completed' || Boolean(meeting.completedAt) || new Date(meeting.date).getTime() < Date.now();

    if (isCompleted && body.confirmText !== 'DELETE') {
      return NextResponse.json(
        { message: 'Past meeting deletion requires typing DELETE.' },
        { status: 400 }
      );
    }

    await Promise.all([MeetingModel.findByIdAndDelete(params.id), CarveOutModel.deleteMany({ meeting: meeting._id })]);

    if (isCompleted && meeting.podcast) {
      await PodcastModel.findOneAndUpdate(
        { _id: meeting.podcast, discussedMeeting: meeting._id },
        { status: 'pending', discussedMeeting: null }
      );
    }

    return NextResponse.json({ message: 'Meeting deleted.' });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to delete meeting.' },
      { status: 500 }
    );
  }
}
