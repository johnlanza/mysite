import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { knownParticipants, type KnownParticipant } from "@/lib/known-participants";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import { scoreKnockoutPicks, scorePreTournamentPicks, scoreRoundOf32Picks } from "@/lib/scoring";
import type { PoolSubmissionPicks } from "@/lib/poolarama-types";
import { type GroupId } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";
import MatchModel from "@/models/Match";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";

export const dynamic = "force-dynamic";

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

function normalizeGroupPicks(picks: unknown) {
  if (!picks) return {};
  if (picks instanceof Map) return Object.fromEntries(picks.entries());
  if (typeof picks === "object") return picks as Record<string, string>;
  return {};
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

export async function GET(request: NextRequest) {
  const viewerCode = request.nextUrl.searchParams.get("viewerCode") || "";
  let viewer: KnownParticipant | null = null;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        participants: knownParticipants.map((participant) => ({
          code: participant.code,
          name: participant.name,
          nickname: participant.nickname,
          venmoPaid: participant.venmoPaid,
          submitted: false,
          submittedAt: null,
          r32Submitted: false,
          r32SubmittedAt: null,
          r32Picks: null,
          r16Submitted: false,
          r16SubmittedAt: null,
          r16Picks: null,
          qfSubmitted: false,
          qfSubmittedAt: null,
          qfPicks: null,
          sfSubmitted: false,
          sfSubmittedAt: null,
          sfPicks: null,
          finalSubmitted: false,
          finalSubmittedAt: null,
          finalPicks: null,
          points: 0,
          scoring: [],
          visible: false,
          picks: null
        })),
        roundSubmissions: {
          r32: {
            submitted: 0,
            total: knownParticipants.length
          },
          r16: {
            submitted: 0,
            total: knownParticipants.length
          },
          qf: {
            submitted: 0,
            total: knownParticipants.length
          },
          sf: {
            submitted: 0,
            total: knownParticipants.length
          },
          final: {
            submitted: 0,
            total: knownParticipants.length
          }
        },
        pool: buildPoolState(null),
        storageMode: "mock"
      });
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

    const viewerParticipant = participants.find(
      (participant) => participant.inviteCode === viewerCode && participant.inviteCode !== participant.participantCode
    );

    if (viewerParticipant) {
      viewer = {
        code: viewerParticipant.participantCode,
        name: viewerParticipant.name,
        nickname: viewerParticipant.nickname,
        venmoPaid: viewerParticipant.venmoPaid
      };
    }

    const poolState = buildPoolState(pool);
    const isLocked = poolState.preTournament.status === "locked";
    const r32PicksVisible = poolState.r32.status === "locked";
    const r16PicksVisible = poolState.r16.status === "locked";
    const qfPicksVisible = poolState.qf.status === "locked";
    const sfPicksVisible = poolState.sf.status === "locked";
    const finalPicksVisible = poolState.final.status === "locked";
    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const activeParticipantCodes = new Set(roster.map((participant) => participant.code));
    const r32SubmissionCount = submissions.filter((submission) =>
      submission.stage === "r32" && activeParticipantCodes.has(submission.participantCode)
    ).length;
    const r16SubmissionCount = submissions.filter((submission) =>
      submission.stage === "r16" && activeParticipantCodes.has(submission.participantCode)
    ).length;
    const qfSubmissionCount = submissions.filter((submission) =>
      submission.stage === "qf" && activeParticipantCodes.has(submission.participantCode)
    ).length;
    const sfSubmissionCount = submissions.filter((submission) =>
      submission.stage === "sf" && activeParticipantCodes.has(submission.participantCode)
    ).length;
    const finalSubmissionCount = submissions.filter((submission) =>
      submission.stage === "final" && activeParticipantCodes.has(submission.participantCode)
    ).length;
    const groupStandings =
      groupStandingRows.length > 0
        ? reconcileGroupStandings(groupStandingRows.map(rowToStanding))
        : getDefaultGroupStandings();

    return NextResponse.json({
      participants: roster.map((knownParticipant) => {
        const participant =
          participants.find((item) => item.participantCode === knownParticipant.code) || null;
        const submission =
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
        const visible = isLocked || knownParticipant.code === viewer?.code;
        const picks = submission ? normalizePicks(submission.picks) : null;
        const r32Picks = r32Submission ? normalizePicks(r32Submission.picks) : null;
        const r16Picks = r16Submission ? normalizePicks(r16Submission.picks) : null;
        const qfPicks = qfSubmission ? normalizePicks(qfSubmission.picks) : null;
        const sfPicks = sfSubmission ? normalizePicks(sfSubmission.picks) : null;
        const finalPicks = finalSubmission ? normalizePicks(finalSubmission.picks) : null;
        const score = picks ? scorePreTournamentPicks(picks, groupStandings, pool.scoringRules || {}) : null;
        const knockoutScore =
          (r32PicksVisible ? scoreRoundOf32Picks(r32Picks, r32Matches, pool.scoringRules || {}) : 0) +
          (r16PicksVisible ? scoreKnockoutPicks(r16Picks, r16Matches, "r16", pool.scoringRules || {}) : 0) +
          (qfPicksVisible ? scoreKnockoutPicks(qfPicks, qfMatches, "qf", pool.scoringRules || {}) : 0) +
          (sfPicksVisible ? scoreKnockoutPicks(sfPicks, sfMatches, "sf", pool.scoringRules || {}) : 0) +
          (finalPicksVisible ? scoreKnockoutPicks(finalPicks, finalMatches, "final", pool.scoringRules || {}) : 0);
        const totalScore = (score?.total || 0) + knockoutScore;

        return {
          code: knownParticipant.code,
          name: participant?.name || knownParticipant.name,
          nickname: participant?.nickname || knownParticipant.nickname,
          venmoPaid: participant?.venmoPaid ?? knownParticipant.venmoPaid,
          submitted: Boolean(submission),
          submittedAt: submission?.submittedAt?.toISOString() || null,
          r32Submitted: Boolean(r32Submission),
          r32SubmittedAt: r32Submission?.submittedAt?.toISOString() || null,
          r32Picks: r32PicksVisible && r32Picks
            ? {
                matchWinners: r32Picks.matchWinners || {},
                submittedAt: r32Submission?.submittedAt?.toISOString() || null
              }
            : null,
          r16Submitted: Boolean(r16Submission),
          r16SubmittedAt: r16Submission?.submittedAt?.toISOString() || null,
          r16Picks: r16PicksVisible && r16Picks
            ? {
                matchWinners: r16Picks.matchWinners || {},
                submittedAt: r16Submission?.submittedAt?.toISOString() || null
              }
            : null,
          qfSubmitted: Boolean(qfSubmission),
          qfSubmittedAt: qfSubmission?.submittedAt?.toISOString() || null,
          qfPicks: qfPicksVisible && qfPicks
            ? {
                matchWinners: qfPicks.matchWinners || {},
                submittedAt: qfSubmission?.submittedAt?.toISOString() || null
              }
            : null,
          sfSubmitted: Boolean(sfSubmission),
          sfSubmittedAt: sfSubmission?.submittedAt?.toISOString() || null,
          sfPicks: sfPicksVisible && sfPicks
            ? {
                matchWinners: sfPicks.matchWinners || {},
                submittedAt: sfSubmission?.submittedAt?.toISOString() || null
              }
            : null,
          finalSubmitted: Boolean(finalSubmission),
          finalSubmittedAt: finalSubmission?.submittedAt?.toISOString() || null,
          finalPicks: finalPicksVisible && finalPicks
            ? {
                matchWinners: finalPicks.matchWinners || {},
                submittedAt: finalSubmission?.submittedAt?.toISOString() || null
              }
            : null,
          points: totalScore,
          scoring: score || knockoutScore > 0
            ? [
                { label: "Advancers", value: score?.groupAdvancers || 0 },
                { label: "Winner bonus", value: score?.groupWinnerBonus || 0 },
                { label: "Champion", value: score?.champion || 0 },
                { label: "Knockout", value: knockoutScore }
              ]
            : [],
          visible,
          picks: visible && picks ? picks : null,
          groupPickScores: visible && score ? score.groupPickScores : {}
        };
      }).sort((a, b) => b.points - a.points || Number(b.submitted) - Number(a.submitted) || a.nickname.localeCompare(b.nickname)),
      roundSubmissions: {
        r32: {
          submitted: r32SubmissionCount,
          total: roster.length
        },
        r16: {
          submitted: r16SubmissionCount,
          total: roster.length
        },
        qf: {
          submitted: qfSubmissionCount,
          total: roster.length
        },
        sf: {
          submitted: sfSubmissionCount,
          total: roster.length
        },
        final: {
          submitted: finalSubmissionCount,
          total: roster.length
        }
      },
      pool: poolState,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/picks failed", error);

    if (!allowMockFallback()) return poolDataUnavailableResponse();

    return NextResponse.json(
      { error: "Could not load pick visibility." },
      { status: 500 }
    );
  }
}
