import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { allowMockFallback, isMaintenanceMode, isProductionRuntime } from "@/lib/runtime-safety";
import GroupStandingModel from "@/models/GroupStanding";
import MatchModel from "@/models/Match";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        {
          ok: false,
          storageMode: "unavailable",
          mongoConnected: false,
          production: isProductionRuntime(),
          mockFallbackAllowed: allowMockFallback(),
          maintenanceMode: isMaintenanceMode()
        },
        { status: 503 }
      );
    }

    const [pool, participants, preTournamentSubmissions, totalSubmissionCount, groupStandingCount, r32MatchCount] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean(),
      SubmissionModel.countDocuments({ poolSlug: defaultPoolSlug }),
      GroupStandingModel.countDocuments({ poolSlug: defaultPoolSlug }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "r32" })
    ]);
    const activeRoster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const activeParticipantCodes = new Set(activeRoster.map((participant) => participant.code));
    const activePreTournamentSubmissionCount = preTournamentSubmissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;

    return NextResponse.json({
      ok: true,
      storageMode: "mongo",
      mongoConnected: true,
      production: isProductionRuntime(),
      mockFallbackAllowed: allowMockFallback(),
      maintenanceMode: isMaintenanceMode(),
      pool: buildPoolState(pool),
      counts: {
        participants: activeRoster.length,
        rawParticipants: participants.length,
        preTournamentSubmissions: activePreTournamentSubmissionCount,
        rawPreTournamentSubmissions: preTournamentSubmissions.length,
        totalSubmissions: totalSubmissionCount,
        groupStandings: groupStandingCount,
        r32Matches: r32MatchCount
      }
    });
  } catch (error) {
    console.error("Poolarama /api/admin/health failed", error);

    return NextResponse.json(
      {
        ok: false,
        storageMode: "unavailable",
        mongoConnected: false,
        production: isProductionRuntime(),
        mockFallbackAllowed: allowMockFallback(),
        maintenanceMode: isMaintenanceMode()
      },
      { status: 503 }
    );
  }
}
