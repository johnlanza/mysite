import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, mockStandings } from "@/lib/mock-api-data";
import { getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";
import GroupStandingModel from "@/models/GroupStanding";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { getOrCreateDefaultPool } from "@/lib/pool-state";
import { scorePreTournamentPicks } from "@/lib/scoring";
import type { PoolSubmissionPicks } from "@/lib/poolarama-types";
import { type GroupId } from "@/lib/tournament-data";

export const dynamic = "force-dynamic";

function normalizeGroupPicks(picks: unknown) {
  if (!picks) return {};
  if (picks instanceof Map) return Object.fromEntries(picks.entries());
  if (typeof picks === "object") return picks as Record<string, string>;
  return {};
}

function normalizePicks(picks: unknown): PoolSubmissionPicks {
  const candidate = picks as Partial<PoolSubmissionPicks> | null;

  return {
    champion: candidate?.champion || "",
    goldenBoot: candidate?.goldenBoot || "",
    groupFilter: candidate?.groupFilter || "All",
    roundOf32Winner: candidate?.roundOf32Winner || "",
    groupWinners: normalizeGroupPicks(candidate?.groupWinners),
    groupRunnersUp: normalizeGroupPicks(candidate?.groupRunnersUp),
    matchWinners: candidate?.matchWinners || {}
  };
}

function rowToStanding(row: {
  group: string;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
}): GroupStandingInput {
  return {
    group: row.group as GroupId,
    team: row.team,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    rank: row.rank
  };
}

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({ standings: mockStandings, storageMode: "mock" });
    }

    const [pool, participants, submissions, groupStandingRows] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean(),
      GroupStandingModel.find({ poolSlug: defaultPoolSlug }).lean()
    ]);

    if (participants.length === 0) {
      return NextResponse.json({ standings: mockStandings, storageMode: "mongo", seeded: false });
    }

    const groupStandings =
      groupStandingRows.length > 0
        ? reconcileGroupStandings(groupStandingRows.map(rowToStanding))
        : getDefaultGroupStandings();
    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));

    return NextResponse.json({
      standings: roster.map((knownParticipant) => {
        const participant =
          participants.find((item) => item.participantCode === knownParticipant.code) || null;
        const submission =
          submissions.find((item) => item.participantCode === knownParticipant.code) || null;
        const picks = submission ? normalizePicks(submission.picks) : null;
        const score = picks ? scorePreTournamentPicks(picks, groupStandings, pool.scoringRules || {}) : null;

        return {
          name: participant?.name || knownParticipant.name,
          nickname: participant?.nickname || knownParticipant.nickname,
          points: score?.total || 0,
          paid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
          champion: picks?.champion || "",
          picks: {
            champion: picks?.champion || "",
            goldenBoot: picks?.goldenBoot || "",
            groups: `${score?.groupAdvancers || 0} advancer pts, ${score?.groupWinnerBonus || 0} winner bonus pts`,
            knockout: []
          },
          scoring: [
            { label: "Advancers", value: score?.groupAdvancers || 0 },
            { label: "Winner bonus", value: score?.groupWinnerBonus || 0 },
            { label: "Champion", value: score?.champion || 0 },
            { label: "Knockout", value: score?.knockout || 0 }
          ]
        };
      }).sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/standings failed", error);

    return NextResponse.json({
      standings: mockStandings,
      storageMode: "mock",
      warning: "Database unavailable; using mock standings."
    });
  }
}
