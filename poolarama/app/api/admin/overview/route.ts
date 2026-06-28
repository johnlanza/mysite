import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, getMockAdminOverview } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";
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
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({ participants: getMockAdminOverview(), storageMode: "mock" });
    }

    const [pool, participants, submissions] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: { $in: ["preTournament", "r32"] } }).lean()
    ]);

    if (participants.length === 0 && !allowMockFallback()) return poolDataUnavailableResponse();

    const preTournamentLocked = buildPoolState(pool).preTournament.status === "locked";

    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const overview: AdminParticipantOverview[] = roster.map((knownParticipant) => {
      const participant =
        participants.find((item) => item.participantCode === knownParticipant.code) || null;
      const submission =
        submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "preTournament") || null;
      const r32Submission =
        submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "r32") || null;

      return {
        code: knownParticipant.code,
        inviteCode: participant?.inviteCode || knownParticipant.inviteCode || knownParticipant.code,
        name: participant?.name || knownParticipant.name,
        nickname: participant?.nickname || knownParticipant.nickname,
        venmoPaid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
        submitted: Boolean(submission),
        submittedAt: submission?.submittedAt?.toISOString() || null,
        r32Submitted: Boolean(r32Submission),
        r32SubmittedAt: r32Submission?.submittedAt?.toISOString() || null,
        champion: preTournamentLocked ? submission?.picks?.champion || null : null,
        goldenBoot: preTournamentLocked ? submission?.picks?.goldenBoot || null : null
      };
    });

    return NextResponse.json({ participants: overview, pool: buildPoolState(pool), storageMode: "mongo" });
  } catch (error) {
    console.error("Poolarama /api/admin/overview failed", error);

    if (!allowMockFallback()) return poolDataUnavailableResponse();

    return NextResponse.json({
      participants: getMockAdminOverview(),
      storageMode: "mock",
      warning: "Database unavailable; using mock admin overview."
    });
  }
}
