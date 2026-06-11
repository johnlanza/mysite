import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
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
        { error: "Mongo is required to create a backup." },
        { status: 503 }
      );
    }

    const [pool, participants, submissions, groupStandings, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).sort({ participantCode: 1 }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug }).sort({ participantCode: 1, stage: 1 }).lean(),
      GroupStandingModel.find({ poolSlug: defaultPoolSlug }).sort({ group: 1, rank: 1 }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug }).sort({ stage: 1, order: 1 }).lean()
    ]);
    const activeRoster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const activeParticipantCodes = new Set(activeRoster.map((participant) => participant.code));
    const activePreTournamentSubmissions = submissions.filter((submission) =>
      submission.stage === "preTournament" && activeParticipantCodes.has(submission.participantCode)
    );

    return NextResponse.json({
      createdAt: new Date().toISOString(),
      poolSlug: defaultPoolSlug,
      pool: buildPoolState(pool),
      rawPool: pool.toObject(),
      activeRoster,
      participants,
      submissions,
      groupStandings,
      matches,
      counts: {
        participants: activeRoster.length,
        rawParticipants: participants.length,
        submissions: submissions.length,
        preTournamentSubmissions: activePreTournamentSubmissions.length,
        rawPreTournamentSubmissions: submissions.filter((submission) => submission.stage === "preTournament").length,
        groupStandings: groupStandings.length,
        matches: matches.length
      }
    });
  } catch (error) {
    console.error("Poolarama /api/admin/backup failed", error);

    return NextResponse.json(
      { error: "Could not create Poolarama backup." },
      { status: 500 }
    );
  }
}
