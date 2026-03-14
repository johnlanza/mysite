import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin, requireSession } from '@/lib/auth';
import { MAX_MEETING_PODCASTS, normalizeMeetingPodcastIds } from '@/lib/meeting-podcasts';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

function formatMeetingPayload<T extends { podcasts?: unknown[] | null; podcast?: unknown | null }>(meeting: T) {
  const podcasts =
    Array.isArray(meeting.podcasts) && meeting.podcasts.length > 0
      ? meeting.podcasts
      : meeting.podcast
        ? [meeting.podcast]
        : [];

  return {
    ...meeting,
    podcasts,
    podcast: podcasts[0] || null
  };
}

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
      podcasts?: string[] | null;
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

    const oldPodcastIds = normalizeMeetingPodcastIds({
      podcasts: Array.isArray(existingMeeting.podcasts) ? existingMeeting.podcasts.map((podcast) => String(podcast)) : [],
      podcast: existingMeeting.podcast ? String(existingMeeting.podcast) : null
    });
    const hasPodcastField =
      Object.prototype.hasOwnProperty.call(body, 'podcast') || Object.prototype.hasOwnProperty.call(body, 'podcasts');
    const nextPodcastIds = hasPodcastField
      ? normalizeMeetingPodcastIds({ podcasts: body.podcasts, podcast: body.podcast })
      : oldPodcastIds;

    if (nextPodcastIds.length > MAX_MEETING_PODCASTS) {
      return NextResponse.json({ message: `Meetings can include up to ${MAX_MEETING_PODCASTS} podcasts.` }, { status: 400 });
    }

    const newlyAddedPodcastIds = nextPodcastIds.filter((podcastId) => !oldPodcastIds.includes(podcastId));
    if (newlyAddedPodcastIds.length > 0) {
      const selectedPodcasts = await PodcastModel.find({ _id: { $in: newlyAddedPodcastIds } }).select('status').lean();
      if (selectedPodcasts.length !== newlyAddedPodcastIds.length) {
        return NextResponse.json({ message: 'One or more podcasts were not found.' }, { status: 404 });
      }
      if (selectedPodcasts.some((selectedPodcast) => selectedPodcast.status !== 'pending')) {
        return NextResponse.json({ message: 'Only Podcasts To Discuss can be selected for meetings.' }, { status: 400 });
      }
    }

    const updated = await MeetingModel.findByIdAndUpdate(
      params.id,
      {
        ...(date ? { date } : {}),
        ...(isAdmin && host ? { host } : {}),
        ...(hasPodcastField ? { podcast: nextPodcastIds[0] || null, podcasts: nextPodcastIds } : {}),
        location: locationResult.finalLocation,
        ...(typeof notes === 'string' ? { notes } : {})
      },
      { new: true, runValidators: true }
    )
      .populate('host', 'name address')
      .populate({
        path: 'podcast',
        select: 'title host episodeCount episodeNames totalTimeMinutes link notes description submittedBy',
        populate: { path: 'submittedBy', select: 'name' }
      })
      .populate({
        path: 'podcasts',
        select: 'title host episodeCount episodeNames totalTimeMinutes link notes description submittedBy',
        populate: { path: 'submittedBy', select: 'name' }
      })
      .lean();

    if (!updated) {
      return NextResponse.json({ message: 'Meeting not found.' }, { status: 404 });
    }

    if (existingMeeting.status === 'completed' && hasPodcastField) {
      const removedPodcastIds = oldPodcastIds.filter((podcastId) => !nextPodcastIds.includes(podcastId));

      if (removedPodcastIds.length > 0) {
        await PodcastModel.updateMany(
          { _id: { $in: removedPodcastIds }, discussedMeeting: existingMeeting._id },
          { status: 'pending', discussedMeeting: null }
        );
      }
      if (nextPodcastIds.length > 0) {
        await PodcastModel.updateMany(
          { _id: { $in: nextPodcastIds } },
          {
            status: 'discussed',
            discussedMeeting: existingMeeting._id
          }
        );
      }
    }

    return NextResponse.json(formatMeetingPayload(updated));
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

    const isCompleted = meeting.status === 'completed' || Boolean(meeting.completedAt);
    const meetingPodcastIds = normalizeMeetingPodcastIds({
      podcasts: Array.isArray(meeting.podcasts) ? meeting.podcasts.map((podcast) => String(podcast)) : [],
      podcast: meeting.podcast ? String(meeting.podcast) : null
    });

    if (isCompleted && body.confirmText !== 'DELETE') {
      return NextResponse.json(
        { message: 'Past meeting deletion requires typing DELETE.' },
        { status: 400 }
      );
    }

    await Promise.all([MeetingModel.findByIdAndDelete(params.id), CarveOutModel.deleteMany({ meeting: meeting._id })]);

    if (isCompleted && meetingPodcastIds.length > 0) {
      await PodcastModel.updateMany(
        { _id: { $in: meetingPodcastIds }, discussedMeeting: meeting._id },
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
