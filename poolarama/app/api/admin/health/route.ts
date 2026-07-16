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

    const [
      pool,
      participants,
      preTournamentSubmissions,
      r32Submissions,
      r16Submissions,
      qfSubmissions,
      sfSubmissions,
      finalSubmissions,
      totalSubmissionCount,
      groupStandingCount,
      r32MatchCount,
      r16MatchCount,
      qfMatchCount,
      sfMatchCount,
      finalMatchCount
    ] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "r32" }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "r16" }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "qf" }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "sf" }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "final" }).lean(),
      SubmissionModel.countDocuments({ poolSlug: defaultPoolSlug }),
      GroupStandingModel.countDocuments({ poolSlug: defaultPoolSlug }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "r32" }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "r16" }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "qf" }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "sf" }),
      MatchModel.countDocuments({ poolSlug: defaultPoolSlug, stage: "final" })
    ]);
    const activeRoster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const activeParticipantCodes = new Set(activeRoster.map((participant) => participant.code));
    const activePreTournamentSubmissionCount = preTournamentSubmissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;
    const activeR32SubmissionCount = r32Submissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;
    const activeR16SubmissionCount = r16Submissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;
    const activeQfSubmissionCount = qfSubmissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;
    const activeSfSubmissionCount = sfSubmissions.filter((submission) =>
      activeParticipantCodes.has(submission.participantCode)
    ).length;
    const activeFinalSubmissionCount = finalSubmissions.filter((submission) =>
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
        r32Submissions: activeR32SubmissionCount,
        rawR32Submissions: r32Submissions.length,
        r16Submissions: activeR16SubmissionCount,
        rawR16Submissions: r16Submissions.length,
        qfSubmissions: activeQfSubmissionCount,
        rawQfSubmissions: qfSubmissions.length,
        sfSubmissions: activeSfSubmissionCount,
        rawSfSubmissions: sfSubmissions.length,
        finalSubmissions: activeFinalSubmissionCount,
        rawFinalSubmissions: finalSubmissions.length,
        totalSubmissions: totalSubmissionCount,
        groupStandings: groupStandingCount,
        r32Matches: r32MatchCount,
        r16Matches: r16MatchCount,
        qfMatches: qfMatchCount,
        sfMatches: sfMatchCount,
        finalMatches: finalMatchCount
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
