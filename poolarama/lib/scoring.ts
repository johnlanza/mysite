import { groups, type GroupId } from "@/lib/tournament-data";
import { rankGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import type { PoolSubmissionPicks } from "@/lib/poolarama-types";

export type ScoringRules = {
  champion: number;
  groupWinner: number;
  groupRunnerUp: number;
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
};

export type ScoreBreakdown = {
  groupAdvancers: number;
  groupWinnerBonus: number;
  champion: number;
  knockout: number;
  total: number;
  groupPickScores: Partial<Record<GroupId, {
    winner: number;
    runnerUp: number;
  }>>;
};

export const defaultScoringRules: ScoringRules = {
  champion: 6,
  groupWinner: 2,
  groupRunnerUp: 1,
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  final: 5
};

function normalizeGroupPicks(picks: PoolSubmissionPicks["groupWinners"] | PoolSubmissionPicks["groupRunnersUp"]) {
  if (!picks) return {};
  if (picks instanceof Map) return Object.fromEntries(picks.entries()) as Partial<Record<GroupId, string>>;
  return picks;
}

function isSeparatedByTableTiebreakers(a: GroupStandingInput | null, b: GroupStandingInput | null) {
  if (a?.tiebreaker === "overall" || a?.tiebreaker === "headToHead") return true;

  return Boolean(
    a &&
      b &&
      (a.points !== b.points ||
        a.goalDifference !== b.goalDifference ||
        a.goalsFor !== b.goalsFor)
  );
}

function getCompletedGroupResults(standings: GroupStandingInput[]) {
  const results = new Map<GroupId, {
    winner: string | null;
    runnerUp: string | null;
    winnerResolved: boolean;
    advancers: Set<string>;
  }>();

  for (const group of groups) {
    const groupRows = rankGroupStandings(standings).filter((standing) => standing.group === group);
    const hasEnteredResults = groupRows.some(
      (standing) =>
        standing.played > 0 ||
        standing.wins > 0 ||
        standing.draws > 0 ||
        standing.losses > 0 ||
        standing.goalsFor > 0 ||
        standing.goalsAgainst > 0 ||
        standing.goalDifference !== 0 ||
        standing.points > 0
    );

    if (!hasEnteredResults) continue;

    const pointTotals = new Set(groupRows.map((standing) => standing.points));
    if (pointTotals.size === 1) continue;

    const winner = groupRows.find((standing) => standing.rank === 1 && standing.points > 0) || null;
    const runnerUp = groupRows.find((standing) => standing.rank === 2 && standing.points > 0) || null;
    const secondPlaceRow = groupRows.find((standing) => standing.rank === 2) || null;

    if (winner?.team || runnerUp?.team) {
      results.set(group, {
        winner: winner?.team || null,
        runnerUp: runnerUp?.team || null,
        winnerResolved: isSeparatedByTableTiebreakers(winner, secondPlaceRow),
        advancers: new Set([winner?.team, runnerUp?.team].filter(Boolean) as string[])
      });
    }
  }

  return results;
}

export function scorePreTournamentPicks(
  picks: PoolSubmissionPicks,
  standings: GroupStandingInput[],
  rules: Partial<ScoringRules> = {}
): ScoreBreakdown {
  const scoringRules = { ...defaultScoringRules, ...rules };
  const groupWinners = normalizeGroupPicks(picks.groupWinners);
  const groupRunnersUp = normalizeGroupPicks(picks.groupRunnersUp);
  const completedResults = getCompletedGroupResults(standings);
  let groupAdvancers = 0;
  let groupWinnerBonus = 0;
  const groupPickScores: ScoreBreakdown["groupPickScores"] = {};

  for (const group of groups) {
    const result = completedResults.get(group);
    if (!result) continue;

    const winnerPick = groupWinners[group];
    const runnerUpPick = groupRunnersUp[group];
    let winnerPoints = 0;
    let runnerUpPoints = 0;

    if (winnerPick && result.advancers.has(winnerPick)) {
      groupAdvancers += scoringRules.groupRunnerUp;
      winnerPoints += scoringRules.groupRunnerUp;
    }

    if (runnerUpPick && result.advancers.has(runnerUpPick)) {
      groupAdvancers += scoringRules.groupRunnerUp;
      runnerUpPoints += scoringRules.groupRunnerUp;
    }

    if (winnerPick && winnerPick === result.winner && result.winnerResolved) {
      groupWinnerBonus += scoringRules.groupWinner - scoringRules.groupRunnerUp;
      winnerPoints += scoringRules.groupWinner - scoringRules.groupRunnerUp;
    }

    groupPickScores[group] = {
      winner: winnerPoints,
      runnerUp: runnerUpPoints
    };
  }

  const champion = 0;
  const knockout = 0;

  return {
    groupAdvancers,
    groupWinnerBonus,
    champion,
    knockout,
    total: groupAdvancers + groupWinnerBonus + champion + knockout,
    groupPickScores
  };
}
