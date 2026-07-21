import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, mockStandings } from "@/lib/mock-api-data";
import { getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";
import GroupStandingModel from "@/models/GroupStanding";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { getOrCreateDefaultPool } from "@/lib/pool-state";
import { scoreKnockoutPicks, scorePreTournamentPicks, scoreRoundOf32Picks } from "@/lib/scoring";
import type { PoolSubmissionPicks } from "@/lib/poolarama-types";
import { type GroupId } from "@/lib/tournament-data";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

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
  tiebreaker?: GroupStandingInput["tiebreaker"];
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
    rank: row.rank,
    tiebreaker: row.tiebreaker
  };
}

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({ standings: mockStandings, storageMode: "mock" });
    }

    const [pool, participants, submissions, groupStandingRows, r32Matches, r16Matches, qfMatches, sfMatches, finalMatches] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: { $in: ["preTournament", "r32", "r16", "qf", "sf", "final"] } }).lean(),
      GroupStandingModel.find({ poolSlug: defaultPoolSlug }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug, stage: "r32" }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug, stage: "r16" }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug, stage: "qf" }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug, stage: "sf" }).lean(),
      MatchModel.find({ poolSlug: defaultPoolSlug, stage: "final" }).lean()
    ]);

    if (participants.length === 0 && !allowMockFallback()) return poolDataUnavailableResponse();

    if (participants.length === 0) {
      return NextResponse.json({ standings: mockStandings, storageMode: "mongo", seeded: false });
    }

    const groupStandings =
      groupStandingRows.length > 0
        ? reconcileGroupStandings(groupStandingRows.map(rowToStanding))
        : getDefaultGroupStandings();
    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const preTournamentLocked = pool.preTournamentStatus === "locked";
    const tournamentChampion = finalMatches.find((match) => match.winner)?.winner || "";

    return NextResponse.json({
      standings: roster.map((knownParticipant) => {
        const participant =
          participants.find((item) => item.participantCode === knownParticipant.code) || null;
        const preTournamentSubmission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "preTournament") || null;
        const r32Submission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "r32") || null;
        const r16Submission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "r16") || null;
        const qfSubmission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "qf") || null;
        const sfSubmission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "sf") || null;
        const finalSubmission =
          submissions.find((item) => item.participantCode === knownParticipant.code && item.stage === "final") || null;
        const picks = preTournamentSubmission ? normalizePicks(preTournamentSubmission.picks) : null;
        const r32Picks = r32Submission ? normalizePicks(r32Submission.picks) : null;
        const r16Picks = r16Submission ? normalizePicks(r16Submission.picks) : null;
        const qfPicks = qfSubmission ? normalizePicks(qfSubmission.picks) : null;
        const sfPicks = sfSubmission ? normalizePicks(sfSubmission.picks) : null;
        const finalPicks = finalSubmission ? normalizePicks(finalSubmission.picks) : null;
        const score = picks ? scorePreTournamentPicks(picks, groupStandings, pool.scoringRules || {}, tournamentChampion) : null;
        const knockoutScore =
          scoreRoundOf32Picks(r32Picks, r32Matches, pool.scoringRules || {}) +
          (pool.r16Status === "locked" ? scoreKnockoutPicks(r16Picks, r16Matches, "r16", pool.scoringRules || {}) : 0) +
          (pool.qfStatus === "locked" ? scoreKnockoutPicks(qfPicks, qfMatches, "qf", pool.scoringRules || {}) : 0) +
          (pool.sfStatus === "locked" ? scoreKnockoutPicks(sfPicks, sfMatches, "sf", pool.scoringRules || {}) : 0) +
          (pool.finalStatus === "locked" ? scoreKnockoutPicks(finalPicks, finalMatches, "final", pool.scoringRules || {}) : 0);
        const totalScore = (score?.total || 0) + knockoutScore;

        return {
          name: participant?.name || knownParticipant.name,
          nickname: participant?.nickname || knownParticipant.nickname,
          points: totalScore,
          paid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
          champion: preTournamentLocked ? picks?.champion || "" : "",
          picks: {
            champion: preTournamentLocked ? picks?.champion || "" : "",
            goldenBoot: preTournamentLocked ? picks?.goldenBoot || "" : "",
            groups: `${score?.groupAdvancers || 0} advancer pts, ${score?.groupWinnerBonus || 0} winner bonus pts`,
            groupPickScores: preTournamentLocked ? score?.groupPickScores || {} : {},
            knockout: []
          },
          scoring: [
            { label: "Advancers", value: score?.groupAdvancers || 0 },
            { label: "Winner bonus", value: score?.groupWinnerBonus || 0 },
            { label: "Champion", value: score?.champion || 0 },
            { label: "Knockout", value: knockoutScore }
          ]
        };
      }).sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/standings failed", error);

    if (!allowMockFallback()) return poolDataUnavailableResponse();

    return NextResponse.json({
      standings: mockStandings,
      storageMode: "mock",
      warning: "Database unavailable; using mock standings."
    });
  }
}
