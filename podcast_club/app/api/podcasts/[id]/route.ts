import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import PodcastModel from '@/models/Podcast';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json({ message: session.message }, { status: session.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirmText?: string };
    if (String(body.confirmText || '').trim() !== 'DELETE') {
      return NextResponse.json({ message: 'Type DELETE to confirm podcast deletion.' }, { status: 400 });
    }

    await connectToDatabase();

    const podcast = await PodcastModel.findById(params.id).select('title submittedBy status').lean();
    if (!podcast) {
      return NextResponse.json({ message: 'Podcast not found.' }, { status: 404 });
    }

    const isOwner = String(podcast.submittedBy) === session.member._id;
    if (!session.member.isAdmin && !isOwner) {
      return NextResponse.json({ message: 'Only admins or the submitter can delete this podcast.' }, { status: 403 });
    }

    const meetingsUsingPodcast = await MeetingModel.find({ podcast: params.id }).select('_id').lean();

    if (!session.member.isAdmin) {
      if (podcast.status === 'discussed') {
        return NextResponse.json({ message: 'Discussed podcasts cannot be deleted.' }, { status: 409 });
      }

      if (meetingsUsingPodcast.length > 0) {
        return NextResponse.json(
          { message: 'This podcast is attached to one or more meetings and cannot be deleted.' },
          { status: 409 }
        );
      }
    }

    if (session.member.isAdmin && meetingsUsingPodcast.length > 0) {
      const meetingIds = meetingsUsingPodcast.map((meeting) => meeting._id);
      await Promise.all([
        CarveOutModel.deleteMany({ meeting: { $in: meetingIds } }),
        MeetingModel.deleteMany({ _id: { $in: meetingIds } })
      ]);
    }

    await PodcastModel.findByIdAndDelete(params.id);

    return NextResponse.json({
      message: 'Podcast deleted.',
      podcast: { _id: String(podcast._id), title: podcast.title }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to delete podcast.' },
      { status: 500 }
    );
  }
}
