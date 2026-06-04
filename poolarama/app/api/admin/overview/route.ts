import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, getMockAdminOverview } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import type { AdminParticipantOverview } from "@/lib/poolarama-types";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({ participants: getMockAdminOverview(), storageMode: "mock" });
    }

    const [participants, submissions] = await Promise.all([
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean()
    ]);

    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const overview: AdminParticipantOverview[] = roster.map((knownParticipant) => {
      const participant =
        participants.find((item) => item.participantCode === knownParticipant.code) || null;
      const submission =
        submissions.find((item) => item.participantCode === knownParticipant.code) || null;

      return {
        code: knownParticipant.code,
        inviteCode: participant?.inviteCode || knownParticipant.inviteCode || knownParticipant.code,
        name: participant?.name || knownParticipant.name,
        nickname: participant?.nickname || knownParticipant.nickname,
        venmoPaid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
        submitted: Boolean(submission),
        submittedAt: submission?.submittedAt?.toISOString() || null,
        champion: submission?.picks?.champion || null,
        goldenBoot: submission?.picks?.goldenBoot || null
      };
    });

    return NextResponse.json({ participants: overview, storageMode: "mongo" });
  } catch (error) {
    console.error("Poolarama /api/admin/overview failed", error);

    return NextResponse.json({
      participants: getMockAdminOverview(),
      storageMode: "mock",
      warning: "Database unavailable; using mock admin overview."
    });
  }
}
