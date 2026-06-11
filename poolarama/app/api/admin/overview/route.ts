import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, getMockAdminOverview } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import type { AdminParticipantOverview } from "@/lib/poolarama-types";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({ participants: getMockAdminOverview(), storageMode: "mock" });
    }

    const [pool, participants, submissions] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean()
    ]);
    const preTournamentLocked = buildPoolState(pool).preTournament.status === "locked";

    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const overview: AdminParticipantOverview[] = roster.map((knownParticipant) => {
      const participant =
        participants.find((item) => item.participantCode === knownParticipant.code) || null;
      const submission =
        submissions.find((item) => item.participantCode === knownParticipant.code) || null;

      return {
        code: knownParticipant.code,
        inviteCode: participant?.inviteCode || knownParticipant.inviteCode || knownParticipant.code,
        name: knownParticipant.name,
        nickname: knownParticipant.nickname,
        venmoPaid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
        submitted: Boolean(submission),
        submittedAt: submission?.submittedAt?.toISOString() || null,
        champion: preTournamentLocked ? submission?.picks?.champion || null : null,
        goldenBoot: preTournamentLocked ? submission?.picks?.goldenBoot || null : null
      };
    });

    return NextResponse.json({ participants: overview, pool: buildPoolState(pool), storageMode: "mongo" });
  } catch (error) {
    console.error("Poolarama /api/admin/overview failed", error);

    return NextResponse.json({
      participants: getMockAdminOverview(),
      storageMode: "mock",
      warning: "Database unavailable; using mock admin overview."
    });
  }
}
