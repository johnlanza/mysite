"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { withBasePath } from "@/lib/base-path";
import { normalizeGoldenBootName, type GoldenBootRow } from "@/lib/golden-boot";
import { defaultParticipant, knownParticipants, type KnownParticipant } from "@/lib/known-participants";
import { formatKnockoutSchedule } from "@/lib/knockout-schedule";
import type { AdminParticipantOverview } from "@/lib/poolarama-types";
import { goldenBootCandidates, groups, teams, type GroupId } from "@/lib/tournament-data";

type Tab = "picks" | "standings" | "rules" | "payments" | "pantheon" | "tables" | "admin";
type StatsSortKey = "rank" | "player" | "total" | "group" | "advancers" | "winnerBonus" | "knockout" | "r32" | "r16" | "qf" | "possibleUpside";

type PlayerStatsRow = {
  code: string;
  rank: number;
  player: string;
  name: string;
  total: number;
  group: number;
  advancers: number;
  winnerBonus: number;
  knockout: number;
  r32: number;
  r16: number;
  qf: number;
  champion: string;
  championEliminated: boolean;
  goldenBoot: string;
  goldenBootStatus: string;
  possibleUpside: number;
};

type SavedPicks = {
  champion: string;
  goldenBoot: string;
  groupFilter: GroupId | "All";
  groupWinners: Record<GroupId, string>;
  groupRunnersUp: Record<GroupId, string>;
  savedAt: string;
  storageMode?: "mongo" | "mock" | "browser";
};

type ApiSubmissionResponse = {
  submission: {
    picks: {
      champion: string;
      goldenBoot: string;
      groupFilter?: GroupId | "All";
      groupWinners?: Partial<Record<GroupId, string>>;
      groupRunnersUp?: Partial<Record<GroupId, string>>;
      matchWinners?: Record<string, string>;
    };
    submittedAt: string;
    storageMode: "mongo" | "mock";
  } | null;
  submissions?: {
    preTournament: ApiSubmissionResponse["submission"];
    r32: ApiSubmissionResponse["submission"];
    r16: ApiSubmissionResponse["submission"];
    qf: ApiSubmissionResponse["submission"];
  };
  participant?: {
    code: string;
    inviteCode?: string;
    name: string;
    nickname: string;
    venmoPaid: boolean;
  };
};

type AdminOverviewResponse = {
  participants: AdminParticipantOverview[];
  storageMode: "mongo" | "mock";
  warning?: string;
};

type PoolState = {
  preTournament: {
    status: "open" | "locked";
    lockedAt: string | null;
  };
  r32: {
    status: "setup" | "open" | "locked";
    openedAt: string | null;
    lockedAt: string | null;
  };
  r16: {
    status: "setup" | "open" | "locked";
    openedAt: string | null;
    lockedAt: string | null;
  };
  qf: {
    status: "setup" | "open" | "locked";
    openedAt: string | null;
    lockedAt: string | null;
  };
};

type GroupStandingRow = {
  group: GroupId;
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
  tiebreaker?: "overall" | "headToHead" | "manual" | "unresolved";
};

type R32Match = {
  matchId: string;
  label: string;
  teamA: string;
  teamB: string;
  winner?: string;
  order: number;
};

type PublicPickParticipant = {
  code: string;
  name: string;
  nickname: string;
  venmoPaid: boolean;
  submitted: boolean;
  submittedAt: string | null;
  points: number;
  scoring: {
    label: string;
    value: number;
  }[];
  visible: boolean;
  r32Submitted: boolean;
  r32SubmittedAt: string | null;
  r32Picks: {
    matchWinners: Record<string, string>;
    submittedAt: string | null;
  } | null;
  r16Submitted: boolean;
  r16SubmittedAt: string | null;
  r16Picks: {
    matchWinners: Record<string, string>;
    submittedAt: string | null;
  } | null;
  qfSubmitted: boolean;
  qfSubmittedAt: string | null;
  qfPicks: {
    matchWinners: Record<string, string>;
    submittedAt: string | null;
  } | null;
  groupPickScores?: Partial<Record<GroupId, {
    winner: number;
    runnerUp: number;
  }>>;
  picks: {
    champion: string;
    goldenBoot: string;
    groupWinners?: Partial<Record<GroupId, string>>;
    groupRunnersUp?: Partial<Record<GroupId, string>>;
  } | null;
};

type RoundSubmissionSummary = {
  r32: {
    submitted: number;
    total: number;
  };
  r16: {
    submitted: number;
    total: number;
  };
  qf: {
    submitted: number;
    total: number;
  };
};

type PublicPicksResponse = {
  participants: PublicPickParticipant[];
  roundSubmissions?: RoundSubmissionSummary;
  pool: PoolState;
  storageMode: "mongo" | "mock";
  error?: string;
};

type SyncStandingsResponse = {
  provider: string;
  syncedAt: string;
  rawGameCount: number;
  finishedGroupGameCount: number;
  standings: GroupStandingRow[];
  storageMode: "mongo";
};

type GoldenBootResponse = {
  provider: string;
  syncedAt: string;
  completedMatchCount: number;
  rows: GoldenBootRow[];
  storageMode: "provider";
};

type RoundOf32Response = {
  matches: R32Match[];
  pool: PoolState;
  storageMode?: "mongo" | "mock";
  previewOnly?: boolean;
  backup?: {
    backupId: string;
    backupCreatedAt: string;
    backupReason: string;
  } | null;
  sync?: {
    provider: string;
    syncedAt: string;
    completedGameCount: number;
    winnerCount: number;
    updates: Array<{ matchId: string; label: string; winner: string; score: string }>;
    unchanged: Array<{ matchId: string; label: string; winner: string }>;
    conflicts: Array<{ matchId: string; label: string; storedWinner: string; providerWinner: string }>;
    unmatched: Array<{ teamA: string; teamB: string; winner: string }>;
  };
};

type RoundOf16Response = RoundOf32Response;

type KnockoutPickKey = "r32Picks" | "r16Picks" | "qfPicks";

type KnockoutRoundStage = "r32" | "r16" | "qf";

type KnockoutRoundDisplay = {
  stage: KnockoutRoundStage;
  label: string;
  shortLabel: string;
  titleId: string;
  matches: R32Match[];
  picks: Record<string, string>;
  savedPicks: Record<string, string> | null;
  savedAt: string | null;
  submitted: boolean;
  submittedAt: string | null;
  open: boolean;
  locked: boolean;
  started: boolean;
  pointValue: number;
  totalPoints: number;
  feedback: string;
  onPick: (matchId: string, teamName: string) => void;
  onSave: () => void;
};

type KnockoutMatchSummary = R32Match & {
  teamAPickers: PublicPickParticipant[];
  teamBPickers: PublicPickParticipant[];
  userPick: string;
  poolFavorite: string;
};

type KnockoutScenarioImpact = {
  team: string;
  pickers: PublicPickParticipant[];
  projectedLeaders: string[];
  climbers: {
    nickname: string;
    fromRank: number;
    toRank: number;
    projectedPoints: number;
  }[];
};

type KnockoutStakes = {
  minoritySide: string;
  minorityCount: number;
  mostToGain: string;
  leaderDanger: string;
  consensus: string;
  swingSize: number;
};

type KnockoutOutcomeInsight = {
  winner: string;
  winnerPickers: PublicPickParticipant[];
  losingPickers: PublicPickParticipant[];
  scoringNames: string;
  missNames: string;
  topScorersHelped: string;
  topScorersHurt: string;
  rareHit: string;
};

type DailyReview = {
  headline: string;
  dek: string;
  bullets: string[];
  archiveBullets: string[];
  kicker: string;
  updatedLabel: string;
};

type RootingGuideItem = {
  matchId: string;
  label: string;
  schedule: string;
  team: string;
  opponent: string;
  headline: string;
  detail: string;
  note: string;
  drama: "high" | "medium" | "low";
};

type PathToGlory = {
  rankLabel: string;
  points: number;
  gapLabel: string;
  possibleUpside: number;
  maxPossiblePoints: number;
  champion: string;
  championEliminated: boolean;
  leverage: string;
  status: string;
};

const selectedParticipantKey = "poolarama-selected-participant";
const confirmedParticipantKey = "poolarama-confirmed-participant";
const goldenBootWriteInLabel = "Other / write-in";
const championBonusPoints = 6;
const futureKnockoutUpsideByPickKey: Record<KnockoutPickKey, number> = {
  r32Picks: 16 + 12 + 8 + 5,
  r16Picks: 12 + 8 + 5,
  qfPicks: 8 + 5
};
const defaultPoolState: PoolState = {
  preTournament: {
    status: "open",
    lockedAt: null
  },
  r32: {
    status: "setup",
    openedAt: null,
    lockedAt: null
  },
  r16: {
    status: "setup",
    openedAt: null,
    lockedAt: null
  },
  qf: {
    status: "setup",
    openedAt: null,
    lockedAt: null
  }
};
const defaultRoundSubmissionSummary: RoundSubmissionSummary = {
  r32: {
    submitted: 0,
    total: 0
  },
  r16: {
    submitted: 0,
    total: 0
  },
  qf: {
    submitted: 0,
    total: 0
  }
};

function normalizePoolState(pool: Partial<PoolState> | null | undefined): PoolState {
  return {
    preTournament: {
      ...defaultPoolState.preTournament,
      ...(pool?.preTournament || {})
    },
    r32: {
      ...defaultPoolState.r32,
      ...(pool?.r32 || {})
    },
    r16: {
      ...defaultPoolState.r16,
      ...(pool?.r16 || {})
    },
    qf: {
      ...defaultPoolState.qf,
      ...(pool?.qf || {})
    }
  };
}

function getTeamDisplayName(team: { name: string; code: string }) {
  return team.name.length > 12 ? team.code : team.name;
}

function getTeamMeta(teamName: string) {
  return teams.find((team) => team.name === teamName) || {
    name: teamName,
    code: teamName.slice(0, 3).toUpperCase(),
    flag: "⚽",
    colors: ["#0f9f6e", "#ffffff"]
  };
}

function getRoundOf32PickRows(matchWinners: Record<string, string>, matches: R32Match[], pointValue = 1) {
  if (matches.length > 0) {
    return matches.map((match) => {
      const pick = matchWinners[match.matchId] || "";
      const result = !match.winner ? "pending" : pick === match.winner ? "won" : "lost";

      return {
        id: match.matchId,
        label: match.label,
        schedule: formatKnockoutSchedule(match.label),
        winner: pick,
        actualWinner: match.winner || "",
        result,
        points: result === "won" ? pointValue : 0
      };
    });
  }

  return Object.entries(matchWinners).map(([id, winner]) => ({
    id,
    label: id.toUpperCase(),
    schedule: "",
    winner,
    actualWinner: "",
    result: "pending",
    points: 0
  }));
}

const compactTableTeamNames: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia",
  "Côte d'Ivoire": "CIV",
  "Korea Republic": "Korea",
  "Saudi Arabia": "Saudi",
  "South Africa": "S. Africa",
  "Uzbekistan": "UZB"
};

function getTableTeamDisplayName(team: { name: string; code: string }) {
  return compactTableTeamNames[team.name] || (team.name.length > 10 ? team.code : team.name);
}

function getParticipantFromApi(participant: {
  code: string;
  inviteCode?: string;
  name: string;
  nickname: string;
  venmoPaid: boolean;
}): KnownParticipant {
  return {
    code: participant.code,
    inviteCode: participant.inviteCode,
    name: participant.name,
    nickname: participant.nickname,
    venmoPaid: participant.venmoPaid
  };
}

function buildEmptyGroupPicks() {
  return groups.reduce((picks, group) => {
    picks[group] = "";
    return picks;
  }, {} as Record<GroupId, string>);
}

function completeGroupPicks(partialPicks: Partial<Record<GroupId, string>> | undefined) {
  return {
    ...buildEmptyGroupPicks(),
    ...(partialPicks || {})
  };
}

function buildDefaultGroupStandings(): GroupStandingRow[] {
  return teams.map((team, index) => ({
    group: team.group,
    team: team.name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank: (index % 4) + 1
  }));
}

function getCountryColors(country: string): [string, string] {
  return teams.find((team) => team.name === country)?.colors || ["#5b6676", "#ffffff"];
}

function getGoldenBootStatus(pick: string, rows: GoldenBootRow[]) {
  const normalizedPick = normalizeGoldenBootName(pick);
  const row = rows.find((candidate) => candidate.normalizedPlayer === normalizedPick);

  if (!row) return "0 goals, not ranked";

  return `${row.goals} goal${row.goals === 1 ? "" : "s"}, ${row.placeLabel}`;
}

function formatDailyReviewDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return yesterday.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function getOrdinal(rank: number) {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;

  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

function getDisplayRanks(people: PublicPickParticipant[]) {
  let previousPoints: number | null = null;
  let displayRank = 0;

  return people.map((person, index) => {
    if (index === 0 || person.points !== previousPoints) {
      displayRank += 1;
      previousPoints = person.points;
    }

    return { ...person, displayRank };
  });
}

function getPickScoreValue(person: PublicPickParticipant, label: string) {
  return person.scoring.find((item) => item.label === label)?.value || 0;
}

function getKnockoutRoundPoints(person: PublicPickParticipant, pickKey: KnockoutPickKey, matches: R32Match[], pointValue: number) {
  const picks = person[pickKey]?.matchWinners || {};

  return getRoundOf32PickRows(picks, matches, pointValue).reduce((total, pick) => total + pick.points, 0);
}

function isGroupWinnerSeparated(winner: GroupStandingRow | null, runnerUp: GroupStandingRow | null) {
  if (winner?.tiebreaker === "overall" || winner?.tiebreaker === "headToHead") return true;

  return Boolean(
    winner &&
      runnerUp &&
      (winner.points !== runnerUp.points ||
        winner.goalDifference !== runnerUp.goalDifference ||
        winner.goalsFor !== runnerUp.goalsFor)
  );
}

function hasEnteredGroupResults(rows: GroupStandingRow[]) {
  return rows.some((row) =>
    row.played > 0 ||
    row.wins > 0 ||
    row.draws > 0 ||
    row.losses > 0 ||
    row.goalsFor > 0 ||
    row.goalsAgainst > 0 ||
    row.goalDifference !== 0 ||
    row.points > 0
  );
}

function getGroupPotentialToDate(rows: GroupStandingRow[]) {
  return groups.reduce((totals, group) => {
    const groupRows = rows
      .filter((row) => row.group === group)
      .sort((a, b) => a.rank - b.rank);

    if (!hasEnteredGroupResults(groupRows)) return totals;

    const pointTotals = new Set(groupRows.map((row) => row.points));
    if (pointTotals.size === 1) return totals;

    const winner = groupRows.find((row) => row.rank === 1 && row.points > 0) || null;
    const runnerUp = groupRows.find((row) => row.rank === 2 && row.points > 0) || null;
    const secondPlaceRow = groupRows.find((row) => row.rank === 2) || null;

    if (winner || runnerUp) {
      totals.advancers += 2;
    }

    if (winner && isGroupWinnerSeparated(winner, secondPlaceRow)) {
      totals.winnerBonus += 1;
    }

    return totals;
  }, { advancers: 0, winnerBonus: 0 });
}

function getKnockoutPotentialToDate(r32Matches: R32Match[], r16Matches: R32Match[], qfMatches: R32Match[]) {
  const r32Potential = r32Matches.filter((match) => match.winner).length;
  const r16Potential = r16Matches.filter((match) => match.winner).length * 2;
  const qfPotential = qfMatches.filter((match) => match.winner).length * 3;

  return r32Potential + r16Potential + qfPotential;
}

function formatScoreProgress(points: number, potential: number) {
  if (potential <= 0) return "0 possible so far";

  return `${points}/${potential} possible`;
}

function formatCorrectPercent(points: number, potential: number) {
  if (potential <= 0) return "n/a";

  return `${Math.round((points / potential) * 100)}% correct`;
}

function isChampionEliminated(champion: string, knockoutMatches: R32Match[]) {
  if (!champion || knockoutMatches.length === 0) return false;

  const championMatches = knockoutMatches.filter((match) => match.teamA === champion || match.teamB === champion);
  if (championMatches.length === 0) return true;

  return championMatches.some((match) => match.winner && match.winner !== champion);
}

function countByValue(values: string[]) {
  return values.reduce((counts, value) => {
    if (!value) return counts;
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function joinNames(names: string[], limit = 3) {
  if (names.length <= limit) return names.join(", ");

  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} other${names.length - limit === 1 ? "" : "s"}`;
}

function buildKnockoutScenarioImpacts(
  match: KnockoutMatchSummary,
  people: PublicPickParticipant[],
  pointValue: number
): KnockoutScenarioImpact[] {
  const rankedNow = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const currentRanks = new Map(rankedNow.map((person) => [person.code, person.displayRank]));

  return [
    { team: match.teamA, pickers: match.teamAPickers },
    { team: match.teamB, pickers: match.teamBPickers }
  ].map(({ team, pickers }) => {
    const pickerCodes = new Set(pickers.map((person) => person.code));
    const projectedPeople = people.map((person) => ({
      ...person,
      points: person.points + (pickerCodes.has(person.code) ? pointValue : 0)
    }));
    const projectedRanks = getDisplayRanks(projectedPeople.sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
    const topScore = projectedRanks[0]?.points || 0;
    const projectedLeaders = projectedRanks
      .filter((person) => person.points === topScore)
      .map((person) => person.nickname);
    const projectedRankMap = new Map(projectedRanks.map((person) => [person.code, person.displayRank]));
    const projectedPointsMap = new Map(projectedRanks.map((person) => [person.code, person.points]));
    const climbers = pickers
      .map((person) => {
        const fromRank = currentRanks.get(person.code) || 0;
        const toRank = projectedRankMap.get(person.code) || fromRank;

        return {
          nickname: person.nickname,
          fromRank,
          toRank,
          projectedPoints: projectedPointsMap.get(person.code) || person.points
        };
      })
      .filter((person) => person.fromRank > 0 && person.toRank < person.fromRank)
      .sort((a, b) => a.toRank - b.toRank || b.projectedPoints - a.projectedPoints || a.nickname.localeCompare(b.nickname));

    return {
      team,
      pickers,
      projectedLeaders,
      climbers
    };
  });
}

function buildKnockoutStakes(
  match: KnockoutMatchSummary,
  people: PublicPickParticipant[],
  impacts: KnockoutScenarioImpact[],
  pickKey: KnockoutPickKey,
  pointValue: number
): KnockoutStakes {
  const sides = [
    { team: match.teamA, pickers: match.teamAPickers },
    { team: match.teamB, pickers: match.teamBPickers }
  ].sort((a, b) => a.pickers.length - b.pickers.length || a.team.localeCompare(b.team));
  const minority = sides[0];
  const majority = sides[1];
  const rankedNow = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const currentRanks = new Map(rankedNow.map((person) => [person.code, person.displayRank]));
  const topScore = rankedNow[0]?.points || 0;
  const leaderDangerNames = rankedNow
    .filter((person) => person.points === topScore && person[pickKey]?.matchWinners[match.matchId] === minority.team)
    .map((person) => person.nickname);
  const mostToGainNames = minority.pickers
    .map((person) => ({
      nickname: person.nickname,
      rank: currentRanks.get(person.code) || 99,
      points: person.points
    }))
    .sort((a, b) => a.rank - b.rank || b.points - a.points || a.nickname.localeCompare(b.nickname))
    .slice(0, 2)
    .map((person) => person.nickname);
  const swingSize = impacts.reduce((maxSwing, impact) => {
    const pickerCodes = new Set(impact.pickers.map((person) => person.code));
    const projectedRanks = getDisplayRanks(
      people
        .map((person) => ({
          ...person,
          points: person.points + (pickerCodes.has(person.code) ? pointValue : 0)
        }))
        .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
    );
    const changedCount = projectedRanks.filter((person) => (currentRanks.get(person.code) || 0) !== person.displayRank).length;

    return Math.max(maxSwing, changedCount);
  }, 0);
  const spread = Math.abs(majority.pickers.length - minority.pickers.length);
  const consensus = spread <= 3
    ? "Split"
    : majority.pickers.length >= Math.ceil(people.length * 0.75)
      ? `Heavy ${majority.team}`
      : `Leans ${majority.team}`;

  return {
    minoritySide: minority.team,
    minorityCount: minority.pickers.length,
    mostToGain: mostToGainNames.length > 0 ? joinNames(mostToGainNames, 2) : "No one",
    leaderDanger: leaderDangerNames.length > 0 ? `${joinNames(leaderDangerNames, 2)} on ${minority.team}` : "Leaders avoid minority side",
    consensus,
    swingSize
  };
}

function buildRootingGuide(
  person: PublicPickParticipant | null,
  people: PublicPickParticipant[],
  matches: KnockoutMatchSummary[],
  pickKey: KnockoutPickKey,
  pointValue: number
): RootingGuideItem[] {
  if (!person) return [];

  const pending = matches.filter((match) => !match.winner);
  if (pending.length === 0) return [];

  const rankedNow = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const currentRank = rankedNow.find((candidate) => candidate.code === person.code)?.displayRank || 0;

  return pending
    .map((match) => {
      const pick = person[pickKey]?.matchWinners[match.matchId];
      if (!pick) return null;

      const opponent = pick === match.teamA ? match.teamB : match.teamA;
      const pickers = pick === match.teamA ? match.teamAPickers : match.teamBPickers;
      const opponents = pick === match.teamA ? match.teamBPickers : match.teamAPickers;
      const pickerCodes = new Set(pickers.map((picker) => picker.code));
      const projected = getDisplayRanks(
        people
          .map((candidate) => ({
            ...candidate,
            points: candidate.points + (pickerCodes.has(candidate.code) ? pointValue : 0)
          }))
          .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
      );
      const projectedPerson = projected.find((candidate) => candidate.code === person.code);
      const projectedRank = projectedPerson?.displayRank || currentRank;
      const rankGain = currentRank && projectedRank ? Math.max(0, currentRank - projectedRank) : 0;
      const rankedOpponents = opponents
        .map((opponentPicker) => ({
          ...opponentPicker,
          displayRank: rankedNow.find((candidate) => candidate.code === opponentPicker.code)?.displayRank || 99
        }))
        .sort((a, b) => a.displayRank - b.displayRank || b.points - a.points || a.nickname.localeCompare(b.nickname));
      const dangerousOpponents = rankedOpponents.filter((opponentPicker) => opponentPicker.displayRank <= Math.max(currentRank, 5));
      const splitGap = Math.abs(pickers.length - opponents.length);
      const isMinority = pickers.length < opponents.length;
      const isConsensus = opponents.length === 0 || pickers.length === people.length;
      const drama: RootingGuideItem["drama"] = isConsensus
        ? "low"
        : rankGain > 0 || isMinority || dangerousOpponents.length > 0 || splitGap <= 3
          ? "high"
          : "medium";
      const headline = isConsensus
        ? `No-drama wish: ${pick}`
        : isMinority
          ? `Lonely road: ${pick}`
          : dangerousOpponents.length > 0
            ? `Block ${joinNames(dangerousOpponents.map((opponentPicker) => opponentPicker.nickname), 2)}`
            : `You want ${pick}`;
      const detail = rankGain > 0
        ? `${pick} can move you toward ${getOrdinal(projectedRank)}.`
        : dangerousOpponents.length > 0
          ? `${opponent} gives ${joinNames(dangerousOpponents.map((opponentPicker) => opponentPicker.nickname), 2)} the point instead.`
          : isConsensus
            ? "Almost everyone is on this side, so this is about keeping pace."
            : `${pickers.length}-${opponents.length} pool split.`;
      const note = `${pickers.length} with you, ${opponents.length} against`;

      return {
        matchId: match.matchId,
        label: match.label,
        schedule: formatKnockoutSchedule(match.label),
        team: pick,
        opponent,
        headline,
        detail,
        note,
        drama
      };
    })
    .filter((item): item is RootingGuideItem => Boolean(item))
    .sort((a, b) => {
      const dramaScore = { high: 0, medium: 1, low: 2 };
      return dramaScore[a.drama] - dramaScore[b.drama] || a.label.localeCompare(b.label);
    })
    .slice(0, 3);
}

function buildPathToGlory(
  person: PublicPickParticipant | null,
  people: PublicPickParticipant[],
  matches: KnockoutMatchSummary[],
  pickKey: KnockoutPickKey,
  pointValue: number,
  championMatches: R32Match[]
): PathToGlory | null {
  if (!person || people.length === 0) return null;

  const rankedNow = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const rankedPerson = rankedNow.find((candidate) => candidate.code === person.code);
  const leaderScore = rankedNow[0]?.points || 0;
  const gap = Math.max(0, leaderScore - person.points);
  const pendingPickCount = matches.filter((match) => !match.winner && Boolean(person[pickKey]?.matchWinners[match.matchId])).length;
  const champion = person.picks?.champion || "No champion pick";
  const championEliminated = champion !== "No champion pick" && isChampionEliminated(champion, championMatches);
  const pendingCurrentRoundUpside = pendingPickCount * pointValue;
  const futureKnockoutUpside = futureKnockoutUpsideByPickKey[pickKey] || 0;
  const championUpside = champion !== "No champion pick" && !championEliminated ? championBonusPoints : 0;
  const possibleUpside = pendingCurrentRoundUpside + futureKnockoutUpside + championUpside;
  const rooting = buildRootingGuide(person, people, matches, pickKey, pointValue);
  const bestLeverage = rooting.find((item) => item.drama !== "low") || rooting[0] || null;
  const maxPossiblePoints = person.points + possibleUpside;
  const status = possibleUpside === 0
    ? "No remaining path points are currently available."
    : gap === 0
      ? "Protecting position now, with possible points still on the board."
      : maxPossiblePoints >= leaderScore
        ? "Can still reach the current lead if the remaining path breaks right."
        : championEliminated
          ? "Champion pick is gone, so the path depends on knockout points."
          : bestLeverage?.drama === "high"
            ? "Still dangerous if the swing games break right."
            : "Still has points available, but needs help above the line.";

  return {
    rankLabel: rankedPerson ? getOrdinal(rankedPerson.displayRank) : "Unranked",
    points: person.points,
    gapLabel: gap === 0 ? "At the top" : `${gap} behind lead`,
    possibleUpside,
    maxPossiblePoints,
    champion,
    championEliminated,
    leverage: bestLeverage ? `${bestLeverage.team} in ${bestLeverage.label}` : "No obvious leverage left",
    status
  };
}

function buildKnockoutOutcomeInsight(
  match: KnockoutMatchSummary,
  people: PublicPickParticipant[],
  pickKey: KnockoutPickKey
): KnockoutOutcomeInsight | null {
  if (!match.winner) return null;

  const winnerPickers = match.winner === match.teamA ? match.teamAPickers : match.teamBPickers;
  const losingPickers = people.filter((person) => {
    const pick = person[pickKey]?.matchWinners[match.matchId];
    return pick && pick !== match.winner;
  });
  const rankedNow = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const rankByCode = new Map(rankedNow.map((person) => [person.code, person.displayRank]));
  const byCurrentRank = (a: PublicPickParticipant, b: PublicPickParticipant) =>
    (rankByCode.get(a.code) || 99) - (rankByCode.get(b.code) || 99) ||
    b.points - a.points ||
    a.nickname.localeCompare(b.nickname);
  const rankedWinners = [...winnerPickers].sort(byCurrentRank);
  const rankedMisses = [...losingPickers].sort(byCurrentRank);
  const topScorersHelped = rankedWinners.filter((person) => (rankByCode.get(person.code) || 99) <= 5);
  const topScorersHurt = rankedMisses.filter((person) => (rankByCode.get(person.code) || 99) <= 5);
  const rareThreshold = Math.max(2, Math.floor(people.length * 0.25));
  const rareHit = winnerPickers.length > 0 && winnerPickers.length <= rareThreshold
    ? `${match.winner} was a leverage hit for ${joinNames(rankedWinners.map((person) => person.nickname), 3)}.`
    : winnerPickers.length === 0
      ? `Nobody had ${match.winner}, so this result mostly erased chances rather than creating separation.`
      : `${match.winner} was broadly covered, so the result protected more people than it separated.`;

  return {
    winner: match.winner,
    winnerPickers,
    losingPickers,
    scoringNames: rankedWinners.length > 0 ? joinNames(rankedWinners.map((person) => person.nickname), 3) : "No one",
    missNames: rankedMisses.length > 0 ? joinNames(rankedMisses.map((person) => person.nickname), 3) : "No one",
    topScorersHelped: topScorersHelped.length > 0 ? joinNames(topScorersHelped.map((person) => person.nickname), 3) : "No top-five player",
    topScorersHurt: topScorersHurt.length > 0 ? joinNames(topScorersHurt.map((person) => person.nickname), 3) : "No top-five player",
    rareHit
  };
}

function buildKnockoutReviewBullets(
  people: PublicPickParticipant[],
  matches: KnockoutMatchSummary[],
  pickKey: KnockoutPickKey,
  pointValue: number,
  label: string
) {
  const completed = matches.filter((match) => match.winner);
  const pending = matches.filter((match) => !match.winner);
  const bullets: string[] = [];

  if (completed.length > 0) {
    const roundRuns = people
      .map((person) => {
        const hits = completed.filter((match) => person[pickKey]?.matchWinners[match.matchId] === match.winner).length;
        return { person, hits };
      })
      .sort((a, b) => b.hits - a.hits || b.person.points - a.person.points || a.person.nickname.localeCompare(b.person.nickname));
    const bestHitCount = roundRuns[0]?.hits || 0;
    const bestRuns = roundRuns.filter((item) => item.hits === bestHitCount);
    const secondHitCount = roundRuns.find((item) => item.hits < bestHitCount)?.hits || 0;
    const perfectOrBestRunCreatedSeparation = bestHitCount > 0 && secondHitCount < bestHitCount && bestRuns.length < people.length;

    if (perfectOrBestRunCreatedSeparation) {
      bullets.push(`${label} form: ${joinNames(bestRuns.map((item) => item.person.nickname), 3)} ${bestRuns.length === 1 ? "has" : "have"} hit ${bestHitCount}/${completed.length} completed match${completed.length === 1 ? "" : "es"} so far.`);
    }

    const leverageHit = completed
      .map((match) => {
        const winnerPickers = match.winner === match.teamA ? match.teamAPickers : match.teamBPickers;
        const losingPickers = match.winner === match.teamA ? match.teamBPickers : match.teamAPickers;
        return { match, winnerPickers, losingPickers };
      })
      .filter((item) => item.winnerPickers.length > 0 && item.losingPickers.length > 0)
      .sort((a, b) => a.winnerPickers.length - b.winnerPickers.length || a.match.order - b.match.order)[0];

    if (leverageHit) {
      bullets.push(`Knockout leverage: ${leverageHit.match.winner} over ${leverageHit.match.winner === leverageHit.match.teamA ? leverageHit.match.teamB : leverageHit.match.teamA} paid ${pointValue} point${pointValue === 1 ? "" : "s"} to only ${leverageHit.winnerPickers.length} player${leverageHit.winnerPickers.length === 1 ? "" : "s"}: ${joinNames(leverageHit.winnerPickers.map((person) => person.nickname), 3)}.`);
    }
  }

  if (pending.length > 0) {
    const closestPending = [...pending]
      .filter((match) => match.teamAPickers.length + match.teamBPickers.length > 0)
      .sort((a, b) =>
        Math.abs(a.teamAPickers.length - a.teamBPickers.length) - Math.abs(b.teamAPickers.length - b.teamBPickers.length) ||
        b.teamAPickers.length + b.teamBPickers.length - (a.teamAPickers.length + a.teamBPickers.length) ||
        a.order - b.order
      )[0];

    if (closestPending) {
      bullets.push(`Next swing: ${closestPending.teamA} vs ${closestPending.teamB} is split ${closestPending.teamAPickers.length}-${closestPending.teamBPickers.length}, so that match could move the board more than the obvious chalk games.`);
    }
  }

  return bullets;
}

function buildDailyReview(
  people: PublicPickParticipant[],
  groupRows: GroupStandingRow[],
  goldenBootRows: GoldenBootRow[],
  updatedAt: string | null,
  knockoutContext?: {
    label: string;
    matches: KnockoutMatchSummary[];
    pickKey: KnockoutPickKey;
    pointValue: number;
    locked: boolean;
  }
): DailyReview {
  const rankedPeople = getDisplayRanks([...people].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));
  const submittedPeople = rankedPeople.filter((person) => person.submitted);
  const knockoutBullets = knockoutContext?.locked
    ? buildKnockoutReviewBullets(submittedPeople, knockoutContext.matches, knockoutContext.pickKey, knockoutContext.pointValue, knockoutContext.label)
    : [];
  const leaderScore = submittedPeople[0]?.points || 0;
  const contenders = submittedPeople.filter((person) => leaderScore - person.points <= 3);
  const fragilityPool = contenders.length > 1 ? contenders : submittedPeople.slice(0, 5);
  const topScorer = goldenBootRows[0];
  const goldenBootBackers = topScorer
    ? submittedPeople.filter((person) => normalizeGoldenBootName(person.picks?.goldenBoot || "") === topScorer.normalizedPlayer)
    : [];
  const championPickCounts = countByValue(submittedPeople.map((person) => person.picks?.champion || ""));
  const goldenBootPickCounts = countByValue(submittedPeople.map((person) => normalizeGoldenBootName(person.picks?.goldenBoot || "")));
  const groupRankByTeam = new Map(groupRows.map((row) => [row.team, row]));
  const groupIsComplete = new Map(groups.map((group) => {
    const rows = groupRows.filter((row) => row.group === group);
    return [group, rows.length === 4 && rows.every((row) => row.played >= 3)];
  }));
  const championProfiles = submittedPeople
    .map((person) => {
      const champion = person.picks?.champion || "";
      const row = champion ? groupRankByTeam.get(champion) : null;
      const pickCount = championPickCounts.get(champion) || 0;

      return { person, champion, row, pickCount };
    })
    .filter((item) => item.champion && item.row);
  const championTrouble = submittedPeople
    .map((person) => {
      const champion = person.picks?.champion || "";
      const row = champion ? groupRankByTeam.get(champion) : null;

      return { person, champion, row };
    })
    .filter((item) => item.row && item.row.points > 0 && item.row.rank > 2)
    .sort((a, b) => (b.row?.rank || 0) - (a.row?.rank || 0) || a.person.nickname.localeCompare(b.person.nickname));
  const championWave = submittedPeople
    .map((person) => {
      const champion = person.picks?.champion || "";
      const row = champion ? groupRankByTeam.get(champion) : null;

      return { person, champion, row };
    })
    .filter((item) => item.row && item.row.rank === 1 && item.row.points > 0)
    .sort((a, b) => b.person.points - a.person.points || a.person.nickname.localeCompare(b.person.nickname));
  const uniqueChampionUpside = championProfiles
    .filter((item) => item.pickCount === 1 && item.row && item.row.rank <= 2 && item.row.points > 0)
    .sort((a, b) => a.row!.rank - b.row!.rank || b.person.points - a.person.points);
  const crowdedChampionLane = Array.from(championPickCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .find(([, count]) => count >= Math.max(3, Math.ceil(submittedPeople.length / 4)));
  const goldenBootRowsByNormalized = new Map(goldenBootRows.map((row) => [row.normalizedPlayer, row]));
  const goldenBootLeverage = submittedPeople
    .map((person) => {
      const normalizedPick = normalizeGoldenBootName(person.picks?.goldenBoot || "");
      const row = goldenBootRowsByNormalized.get(normalizedPick);
      const pickCount = goldenBootPickCounts.get(normalizedPick) || 0;

      return { person, row, pickCount };
    })
    .filter((item) => item.row && item.row.rank <= 5 && item.pickCount <= 2)
    .sort((a, b) => a.row!.rank - b.row!.rank || a.pickCount - b.pickCount || b.person.points - a.person.points);
  const goldenBootZeros = submittedPeople.filter((person) => {
    const pick = person.picks?.goldenBoot || "";
    return pick && !goldenBootRows.some((row) => row.normalizedPlayer === normalizeGoldenBootName(pick));
  });
  const biggestAdvancerScore = submittedPeople.reduce((best, person) => {
    const advancers = getPickScoreValue(person, "Advancers");
    return advancers > best.score ? { score: advancers, people: [person.nickname] } :
      advancers === best.score && advancers > 0 ? { ...best, people: [...best.people, person.nickname] } :
      best;
  }, { score: 0, people: [] as string[] });
  const biggestWinnerBonus = submittedPeople.reduce((best, person) => {
    const bonus = getPickScoreValue(person, "Winner bonus");
    return bonus > best.score ? { score: bonus, people: [person.nickname] } :
      bonus === best.score && bonus > 0 ? { ...best, people: [...best.people, person.nickname] } :
      best;
  }, { score: 0, people: [] as string[] });
  const advancerBonusSplits = submittedPeople
    .map((person) => ({
      person,
      advancers: getPickScoreValue(person, "Advancers"),
      bonus: getPickScoreValue(person, "Winner bonus")
    }))
    .sort((a, b) => b.advancers - a.advancers || a.bonus - b.bonus);
  const highVolumeWrongSeats = advancerBonusSplits.find((item) =>
    item.advancers >= Math.max(0, biggestAdvancerScore.score - 1) &&
    item.bonus <= Math.max(0, biggestWinnerBonus.score - 3)
  );
  const secondPlaceExposure = fragilityPool
    .map((person) => {
      const exposure = groups.flatMap((group) => {
        if (groupIsComplete.get(group)) return [];

        const winnerPick = person.picks?.groupWinners?.[group] || "";
        const runnerUpPick = person.picks?.groupRunnersUp?.[group] || "";
        const winnerScore = person.groupPickScores?.[group]?.winner || 0;
        const runnerUpScore = person.groupPickScores?.[group]?.runnerUp || 0;

        return [
          { team: winnerPick, score: winnerScore },
          { team: runnerUpPick, score: runnerUpScore }
        ].filter((pick) => pick.score > 0 && groupRankByTeam.get(pick.team)?.rank === 2);
      });
      const points = exposure.reduce((total, pick) => total + pick.score, 0);
      const exposedTeams = Array.from(new Set(exposure.map((pick) => pick.team)));

      return { person, points, exposedTeams };
    })
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points || b.person.points - a.person.points || a.person.nickname.localeCompare(b.person.nickname));
  const scoreBands = Array.from(
    submittedPeople.reduce((bands, person) => {
      const current = bands.get(person.points) || [];
      current.push(person);
      bands.set(person.points, current);
      return bands;
    }, new Map<number, PublicPickParticipant[]>()).entries()
  ).filter(([, band]) => band.length > 1);
  const hiddenUpsideBand = scoreBands
    .map(([points, band]) => {
      const profiles = band.map((person) => {
        const champion = person.picks?.champion || "";
        const championRow = champion ? groupRankByTeam.get(champion) : null;
        const championPickCount = championPickCounts.get(champion) || 0;
        const goldenBoot = normalizeGoldenBootName(person.picks?.goldenBoot || "");
        const goldenBootRow = goldenBootRowsByNormalized.get(goldenBoot);
        const goldenBootPickCount = goldenBootPickCounts.get(goldenBoot) || 0;
        const upsideScore =
          (championRow?.rank === 1 ? 3 : championRow?.rank === 2 ? 1 : 0) +
          (championPickCount === 1 ? 2 : championPickCount <= 3 ? 1 : 0) +
          (goldenBootRow && goldenBootRow.rank <= 5 ? 2 : 0) +
          (goldenBootPickCount === 1 ? 1 : 0);

        return { person, champion, championRow, goldenBootRow, upsideScore };
      }).sort((a, b) => b.upsideScore - a.upsideScore || b.person.points - a.person.points);
      const best = profiles[0];
      const worst = profiles[profiles.length - 1];

      return { points, best, worst };
    })
    .find((band) => band.best && band.worst && band.best.upsideScore >= band.worst.upsideScore + 3);

  if (submittedPeople.length === 0) {
    return {
      headline: "Pool insights",
      dek: "",
      bullets: ["No submitted picks are on the board yet. Once scoring begins, this section will summarize the most relevant leaderboard, pick, champion, and Golden Boot notes."],
      archiveBullets: [],
      kicker: "",
      updatedLabel: updatedAt ? `Tables updated ${formatAdminTimestamp(updatedAt)}.` : "Tables have not been updated yet."
    };
  }

  const splitLine = highVolumeWrongSeats
    ? `${highVolumeWrongSeats.person.nickname} has one of the more unusual score profiles: ${highVolumeWrongSeats.advancers} advancer points but only ${highVolumeWrongSeats.bonus} winner-bonus points. That may point to strong team selection with several winner/runner-up flips.`
    : `${joinNames(biggestAdvancerScore.people)} ${biggestAdvancerScore.people.length === 1 ? "has" : "have"} the best advancer haul (${biggestAdvancerScore.score}); ${joinNames(biggestWinnerBonus.people)} ${biggestWinnerBonus.people.length === 1 ? "has" : "have"} the most winner-bonus points (${biggestWinnerBonus.score}).`;
  const goldenBootLine = topScorer
    ? `${topScorer.player} leads Golden Boot with ${topScorer.goals} goal${topScorer.goals === 1 ? "" : "s"}. ${goldenBootBackers.length ? `${joinNames(goldenBootBackers.map((person) => person.nickname))} picked him.` : "No active picker selected him."}`
    : "Golden Boot has not produced a meaningful edge yet.";
  const championTroubleLine = championTrouble.length > 0
    ? `${joinNames(championTrouble.map((item) => `${item.person.nickname}: ${item.champion}`))} ${championTrouble.length === 1 ? "has" : "have"} a champion pick currently outside the top two in its group.`
    : championWave.length > 0
      ? `${joinNames(championWave.map((item) => `${item.person.nickname}: ${item.champion}`))} ${championWave.length === 1 ? "has" : "have"} a champion pick currently leading its group.`
      : "Champion-pick impact is still limited because too many groups remain unsettled.";
  const goldenBootZeroLine = goldenBootZeros.length > 0
    ? `${joinNames(goldenBootZeros.map((person) => person.nickname))} ${goldenBootZeros.length === 1 ? "has" : "have"} a Golden Boot pick not currently on the scoring table.`
    : "Every submitted Golden Boot pick is currently represented on the scoring table.";
  const championLeverageLine = uniqueChampionUpside.length > 0
    ? `${uniqueChampionUpside[0].person.nickname} may have the cleanest champion leverage: ${uniqueChampionUpside[0].champion} is currently ${getOrdinal(uniqueChampionUpside[0].row!.rank)} in its group and nobody else picked it.`
    : crowdedChampionLane
      ? `${crowdedChampionLane[1]} players have ${crowdedChampionLane[0]} as champion, so that pick may protect people from falling behind more than it helps them separate.`
      : championTroubleLine;
  const hiddenUpsideLine = hiddenUpsideBand
    ? `Among players tied on ${hiddenUpsideBand.points}, ${hiddenUpsideBand.best.person.nickname} appears to have more remaining leverage than ${hiddenUpsideBand.worst.person.nickname} because of ${hiddenUpsideBand.best.champion}${hiddenUpsideBand.best.goldenBootRow ? ` plus ${hiddenUpsideBand.best.goldenBootRow.player}` : ""}.`
    : championLeverageLine;
  const goldenBootLeverageLine = goldenBootLeverage.length > 0
    ? `${goldenBootLeverage[0].person.nickname} may have the best Golden Boot leverage right now: ${goldenBootLeverage[0].row!.player} is ${goldenBootLeverage[0].row!.placeLabel} and only ${goldenBootLeverage[0].pickCount} ${goldenBootLeverage[0].pickCount === 1 ? "player picked him" : "players picked him"}.`
    : `${goldenBootLine} ${goldenBootZeroLine}`;
  const fragilityLine = secondPlaceExposure.length > 0
    ? `Among current contenders, ${secondPlaceExposure[0].person.nickname} has the most points sitting on 2nd-place teams in unfinished groups: ${secondPlaceExposure[0].points} points tied to ${joinNames(secondPlaceExposure[0].exposedTeams, 4)}. That might make ${secondPlaceExposure[0].person.nickname}'s score more exposed to one group-table swing.`
    : "Among current contenders, no one has meaningful points tied to 2nd-place teams in unfinished groups.";
  const archiveBullets = [
    `Group-stage scoring pattern: ${splitLine}`,
    `Group-stage fragility: ${fragilityLine}`,
    `Longer-tail leverage: ${hiddenUpsideLine}`,
    `Golden Boot/champion watch: ${goldenBootLeverageLine} ${goldenBootZeroLine}`
  ];
  const currentBullets = knockoutBullets.length > 0
    ? knockoutBullets
    : ["No knockout results are scored yet. Once match winners come in, this section will focus on current-round form, leverage hits, and the next swing games."];

  return {
    headline: `${formatDailyReviewDate()} pool insights`,
    dek: "",
    bullets: currentBullets,
    archiveBullets,
    kicker: "",
    updatedLabel: updatedAt ? `Tables updated ${formatAdminTimestamp(updatedAt)}.` : "Tables have not been updated yet."
  };
}

function formatAdminTimestamp(timestamp: string | null) {
  if (!timestamp) return "Not available";

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

const participants = [
  {
    name: "John",
    nickname: "Cheddar",
    points: 18,
    paid: true,
    champion: "Spain",
    picks: {
      champion: "Spain",
      goldenBoot: "Mbappe",
      groups: "7 correct group picks",
      knockout: ["Round of 32: USA, Spain, Japan", "Round of 16: Spain, Brazil", "Quarterfinals: Spain"]
    },
    scoring: [
      { label: "Group winners", value: 8 },
      { label: "Group runners-up", value: 3 },
      { label: "Knockout picks", value: 7 },
      { label: "Champion bonus", value: 0 }
    ]
  },
  {
    name: "Brett",
    nickname: "Smurfette",
    points: 23,
    paid: true,
    champion: "USA",
    picks: {
      champion: "USA",
      goldenBoot: "Sophia Smith",
      groups: "9 correct group picks",
      knockout: ["Round of 32: Mexico, Brazil, Spain", "Round of 16: Brazil, Spain", "Quarterfinals: Brazil", "Final: Spain"]
    },
    scoring: [
      { label: "Group winners", value: 10 },
      { label: "Group runners-up", value: 4 },
      { label: "Knockout picks", value: 9 },
      { label: "Champion bonus", value: 0 }
    ]
  },
  {
    name: "Mike",
    nickname: "Mike",
    points: 21,
    paid: false,
    champion: "Brazil",
    picks: {
      champion: "Brazil",
      goldenBoot: "Vinicius Jr.",
      groups: "8 correct group picks",
      knockout: ["Round of 32: Brazil, Spain, Canada", "Round of 16: Brazil, Spain", "Semifinals: Spain"]
    },
    scoring: [
      { label: "Group winners", value: 8 },
      { label: "Group runners-up", value: 4 },
      { label: "Knockout picks", value: 9 },
      { label: "Champion bonus", value: 0 }
    ]
  },
  {
    name: "Jessie",
    nickname: "Jessie",
    points: 19,
    paid: true,
    champion: "Japan",
    picks: {
      champion: "Japan",
      goldenBoot: "H. Miyazawa",
      groups: "7 correct group picks",
      knockout: ["Round of 32: Japan, Spain, Mexico", "Round of 16: Japan, Spain", "Quarterfinals: Spain"]
    },
    scoring: [
      { label: "Group winners", value: 8 },
      { label: "Group runners-up", value: 2 },
      { label: "Knockout picks", value: 9 },
      { label: "Champion bonus", value: 0 }
    ]
  },
  {
    name: "Eileen",
    nickname: "Irish Eyes",
    points: 17,
    paid: false,
    champion: "England",
    picks: {
      champion: "England",
      goldenBoot: "Kane",
      groups: "6 correct group picks",
      knockout: ["Round of 32: Canada, England, Spain", "Round of 16: England, Spain"]
    },
    scoring: [
      { label: "Group winners", value: 6 },
      { label: "Group runners-up", value: 3 },
      { label: "Knockout picks", value: 8 },
      { label: "Champion bonus", value: 0 }
    ]
  },
  {
    name: "Kellyn",
    nickname: "Que Que",
    points: 16,
    paid: true,
    champion: "USA",
    picks: {
      champion: "USA",
      goldenBoot: "Sophia Smith",
      groups: "6 correct group picks",
      knockout: ["Round of 32: USA, Brazil, Japan", "Round of 16: Brazil"]
    },
    scoring: [
      { label: "Group winners", value: 6 },
      { label: "Group runners-up", value: 4 },
      { label: "Knockout picks", value: 6 },
      { label: "Champion bonus", value: 0 }
    ]
  }
];

const pantheon = [
  { year: "2024", tournament: "Euro Pool", champion: "Jessie", detail: "51 points" },
  { year: "2023", tournament: "Women’s World Cup", champion: "Mike", detail: "Pool champion" },
  { year: "2022", tournament: "Men’s World Cup", champion: "Brett", detail: "23 points" },
  { year: "2021", tournament: "Euro Pool", champion: "Quinn", detail: "21 points" }
];

export function PoolaramaPrototype() {
  const [tab, setTab] = useState<Tab>("picks");
  const [selectedChampion, setSelectedChampion] = useState("");
  const [selectedGoldenBoot, setSelectedGoldenBoot] = useState("");
  const [goldenBootWriteIn, setGoldenBootWriteIn] = useState("");
  const [groupWinners, setGroupWinners] = useState<Record<GroupId, string>>(() => buildEmptyGroupPicks());
  const [groupRunnersUp, setGroupRunnersUp] = useState<Record<GroupId, string>>(() => buildEmptyGroupPicks());
  const [savedPicks, setSavedPicks] = useState<SavedPicks | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<KnownParticipant>(defaultParticipant);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [identityLockedByLink, setIdentityLockedByLink] = useState(false);
  const [incompleteAlertVisible, setIncompleteAlertVisible] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState("Prototype save is ready.");
  const [adminOverview, setAdminOverview] = useState<AdminParticipantOverview[]>(
    knownParticipants.map((participant) => ({
      code: participant.code,
      inviteCode: participant.inviteCode,
      name: participant.name,
      nickname: participant.nickname,
      venmoPaid: participant.venmoPaid,
      submitted: false,
      submittedAt: null,
      r32Submitted: false,
      r32SubmittedAt: null,
      r16Submitted: false,
      r16SubmittedAt: null,
      qfSubmitted: false,
      qfSubmittedAt: null,
      champion: null,
      goldenBoot: null
    }))
  );
  const [adminFeedback, setAdminFeedback] = useState("Admin overview is ready.");
  const [poolDataWarning, setPoolDataWarning] = useState<string | null>(null);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantNickname, setNewParticipantNickname] = useState("");
  const [pendingDeleteCode, setPendingDeleteCode] = useState("");
  const [poolState, setPoolState] = useState<PoolState>(defaultPoolState);
  const [publicPicks, setPublicPicks] = useState<PublicPickParticipant[]>([]);
  const [roundSubmissions, setRoundSubmissions] = useState<RoundSubmissionSummary>(defaultRoundSubmissionSummary);
  const [groupStandingsRows, setGroupStandingsRows] = useState<GroupStandingRow[]>(() => buildDefaultGroupStandings());
  const [r32Matches, setR32Matches] = useState<R32Match[]>([]);
  const [r32Picks, setR32Picks] = useState<Record<string, string>>({});
  const [r32SavedPicks, setR32SavedPicks] = useState<Record<string, string> | null>(null);
  const [r32SavedAt, setR32SavedAt] = useState<string | null>(null);
  const [r32PreviewReady, setR32PreviewReady] = useState(false);
  const [r32Feedback, setR32Feedback] = useState("Round of 32 picks are not open yet.");
  const [r16Matches, setR16Matches] = useState<R32Match[]>([]);
  const [r16Picks, setR16Picks] = useState<Record<string, string>>({});
  const [r16SavedPicks, setR16SavedPicks] = useState<Record<string, string> | null>(null);
  const [r16SavedAt, setR16SavedAt] = useState<string | null>(null);
  const [r16PreviewReady, setR16PreviewReady] = useState(false);
  const [r16Feedback, setR16Feedback] = useState("Round of 16 picks are not open yet.");
  const [qfMatches, setQfMatches] = useState<R32Match[]>([]);
  const [qfPicks, setQfPicks] = useState<Record<string, string>>({});
  const [qfSavedPicks, setQfSavedPicks] = useState<Record<string, string> | null>(null);
  const [qfSavedAt, setQfSavedAt] = useState<string | null>(null);
  const [qfPreviewReady, setQfPreviewReady] = useState(false);
  const [qfFeedback, setQfFeedback] = useState("Quarterfinal picks are not open yet.");
  const [selectedKnockoutMatchId, setSelectedKnockoutMatchId] = useState<string | null>(null);
  const [goldenBootRows, setGoldenBootRows] = useState<GoldenBootRow[]>([]);
  const [goldenBootFeedback, setGoldenBootFeedback] = useState("Golden Boot table is loading.");
  const [groupTablesUpdatedAt, setGroupTablesUpdatedAt] = useState<string | null>(null);
  const [goldenBootUpdatedAt, setGoldenBootUpdatedAt] = useState<string | null>(null);
  const [goldenBootProvider, setGoldenBootProvider] = useState("ESPN scoreboard");
  const [statsSort, setStatsSort] = useState<{ key: StatsSortKey; direction: "asc" | "desc" }>({
    key: "total",
    direction: "desc"
  });

  const visibleRoster = publicPicks.length > 0 ? publicPicks : adminOverview;
  const paidCount = visibleRoster.filter((person) => person.venmoPaid).length;
  const potTotal = paidCount * 10;
  const totalPlayers = visibleRoster.length;
  const championCandidates = useMemo(() => {
    const candidateNames = groups.flatMap((group) => [groupWinners[group], groupRunnersUp[group]]);

    return teams.filter((team) => candidateNames.includes(team.name));
  }, [groupRunnersUp, groupWinners]);
  const selectedGoldenBootIsWriteIn = selectedGoldenBoot === goldenBootWriteInLabel;
  const finalGoldenBootPick = selectedGoldenBootIsWriteIn ? goldenBootWriteIn.trim() : selectedGoldenBoot;
  const currentPicksAreSaved = savedPicks !== null &&
    savedPicks.champion === selectedChampion &&
    savedPicks.goldenBoot === finalGoldenBootPick &&
    groups.every((group) => savedPicks.groupWinners[group] === groupWinners[group]) &&
    groups.every((group) => savedPicks.groupRunnersUp[group] === groupRunnersUp[group]);
  const completedGroupPicks = groups.filter(
    (group) => groupWinners[group] && groupRunnersUp[group] && groupWinners[group] !== groupRunnersUp[group]
  ).length;
  const duplicateGroupPicks = groups.filter(
    (group) => groupWinners[group] && groupWinners[group] === groupRunnersUp[group]
  );
  const missingGroupPicks = groups.filter(
    (group) => !groupWinners[group] || !groupRunnersUp[group] || groupWinners[group] === groupRunnersUp[group]
  );
  const allRequiredPicksComplete =
    completedGroupPicks === groups.length &&
    Boolean(selectedChampion) &&
    Boolean(finalGoldenBootPick);
  const preTournamentLocked = poolState.preTournament.status === "locked";
  const r32Open = poolState.r32.status === "open";
  const r32Locked = poolState.r32.status === "locked";
  const r32Started = r32Open || r32Locked;
  const r32ScoredCount = r32Matches.filter((match) => Boolean(match.winner)).length;
  const r16Open = poolState.r16.status === "open";
  const r16Locked = poolState.r16.status === "locked";
  const r16Started = r16Open || r16Locked;
  const r16ScoredCount = r16Matches.filter((match) => Boolean(match.winner)).length;
  const r16CanPreview = r32ScoredCount === 16;
  const qfOpen = poolState.qf.status === "open";
  const qfLocked = poolState.qf.status === "locked";
  const qfStarted = qfOpen || qfLocked;
  const qfScoredCount = qfMatches.filter((match) => Boolean(match.winner)).length;
  const qfCanPreview = r16ScoredCount === 8;
  const groupPotentialToDate = useMemo(
    () => getGroupPotentialToDate(groupStandingsRows),
    [groupStandingsRows]
  );
  const knockoutPotentialToDate = useMemo(
    () => getKnockoutPotentialToDate(r32Matches, r16Matches, qfMatches),
    [qfMatches, r16Matches, r32Matches]
  );
  const championStatusMatches = useMemo(
    () => [...r32Matches, ...r16Matches, ...qfMatches],
    [qfMatches, r16Matches, r32Matches]
  );
  const preTournamentControlsLocked = preTournamentLocked || r32Open || r32Locked;
  const r32PicksComplete = r32Matches.length > 0 && r32Matches.every((match) => Boolean(r32Picks[match.matchId]));
  const r16PicksComplete = r16Matches.length > 0 && r16Matches.every((match) => Boolean(r16Picks[match.matchId]));
  const qfPicksComplete = qfMatches.length > 0 && qfMatches.every((match) => Boolean(qfPicks[match.matchId]));
  const showLockedHomeNotice = preTournamentLocked && !r32Started && !identityConfirmed && !identityLockedByLink && !adminEnabled;
  const showParticipantLockedHeader = preTournamentLocked && identityConfirmed && !r32Open && !r32Locked;
  const showPersonalR32Pick = identityLockedByLink;
  const completionHint = duplicateGroupPicks.length > 0
    ? `Fix duplicate picks in Group ${duplicateGroupPicks[0]}.`
    : missingGroupPicks.length > 0
      ? `Finish Group ${missingGroupPicks[0]}.`
      : !selectedChampion
        ? "Pick a champion."
      : !finalGoldenBootPick
        ? "Pick a Golden Boot winner."
        : preTournamentControlsLocked
          ? "Pre-tournament picks are locked."
          : "Ready to review.";
  const submittedCount = visibleRoster.filter((participant) => participant.submitted).length;
  const adminSubmittedCount = adminOverview.filter((participant) => participant.submitted).length;
  const adminR32SubmittedCount = adminOverview.filter((participant) => participant.r32Submitted).length;
  const adminR16SubmittedCount = adminOverview.filter((participant) => participant.r16Submitted).length;
  const adminQfSubmittedCount = adminOverview.filter((participant) => participant.qfSubmitted).length;
  const heroKnockoutSubmissionMetric = qfStarted
    ? {
        submitted: adminEnabled ? adminQfSubmittedCount : roundSubmissions.qf.submitted,
        total: adminEnabled ? adminOverview.length : roundSubmissions.qf.total || totalPlayers,
        label: "QF submitted"
      }
    : r16Started
    ? {
        submitted: adminEnabled ? adminR16SubmittedCount : roundSubmissions.r16.submitted,
        total: adminEnabled ? adminOverview.length : roundSubmissions.r16.total || totalPlayers,
        label: "R16 submitted"
      }
    : r32Started
      ? {
          submitted: adminEnabled ? adminR32SubmittedCount : roundSubmissions.r32.submitted,
          total: adminEnabled ? adminOverview.length : roundSubmissions.r32.total || totalPlayers,
          label: "R32 submitted"
        }
      : null;
  const activeKnockoutRoundLabel = qfStarted ? "Quarterfinals" : r16Started ? "Round of 16" : "Round of 32";
  const adminCurrentRound = poolState.qf.status !== "setup"
    ? { label: "Quarterfinals", status: poolState.qf.status, openedAt: poolState.qf.openedAt, lockedAt: poolState.qf.lockedAt }
    : poolState.r16.status !== "setup"
    ? { label: "Round of 16", status: poolState.r16.status, openedAt: poolState.r16.openedAt, lockedAt: poolState.r16.lockedAt }
    : poolState.r32.status !== "setup"
      ? { label: "Round of 32", status: poolState.r32.status, openedAt: poolState.r32.openedAt, lockedAt: poolState.r32.lockedAt }
      : { label: "Pre-tournament", status: poolState.preTournament.status, openedAt: null, lockedAt: poolState.preTournament.lockedAt };
  const adminCurrentRoundAction = adminCurrentRound.label === "Round of 32"
    ? poolState.r32.status === "locked"
      ? "Active task: score R32 winners as matches finish. R16 preview unlocks only after all 16 winners are scored."
      : poolState.r32.status === "open"
        ? "Active task: collect R32 picks, then lock them before any scoring."
        : "Setup task: generate and open R32 picks."
    : adminCurrentRound.label === "Round of 16"
      ? poolState.r16.status === "locked"
        ? "Active task: score R16 winners as matches finish. Quarterfinal preview unlocks only after all 8 winners are scored."
        : poolState.r16.status === "open"
          ? "Active task: collect R16 picks, then lock them before any scoring."
          : "Setup task: generate and open R16 picks."
      : adminCurrentRound.label === "Quarterfinals"
        ? poolState.qf.status === "locked"
          ? "Active task: score Quarterfinal winners as matches finish."
          : poolState.qf.status === "open"
            ? "Active task: collect Quarterfinal picks, then lock them before any scoring."
            : "Setup task: generate and open Quarterfinal picks."
      : "Pre-tournament picks are locked; knockout rounds are the active workflow.";
  const adminCurrentRoundStats = adminCurrentRound.label === "Quarterfinals"
    ? {
        submitted: adminQfSubmittedCount,
        total: adminOverview.length,
        matchCount: qfMatches.length,
        expectedMatches: 4,
        scored: qfScoredCount,
        openedAt: poolState.qf.openedAt,
        lockedAt: poolState.qf.lockedAt
      }
    : adminCurrentRound.label === "Round of 16"
      ? {
          submitted: adminR16SubmittedCount,
          total: adminOverview.length,
          matchCount: r16Matches.length,
          expectedMatches: 8,
          scored: r16ScoredCount,
          openedAt: poolState.r16.openedAt,
          lockedAt: poolState.r16.lockedAt
        }
      : adminCurrentRound.label === "Round of 32"
        ? {
            submitted: adminR32SubmittedCount,
            total: adminOverview.length,
            matchCount: r32Matches.length,
            expectedMatches: 16,
            scored: r32ScoredCount,
            openedAt: poolState.r32.openedAt,
            lockedAt: poolState.r32.lockedAt
          }
        : {
            submitted: adminSubmittedCount,
            total: adminOverview.length,
            matchCount: 0,
            expectedMatches: 0,
            scored: 0,
            openedAt: null,
            lockedAt: poolState.preTournament.lockedAt
          };
  const adminCurrentRoundStatusLabel = adminCurrentRound.status === "open"
    ? "Picks open"
    : adminCurrentRound.status === "locked"
      ? "Locked and ready to score"
      : "Setup";
  const leadingScore = publicPicks.reduce((maxPoints, participant) => Math.max(maxPoints, participant.points), 0);
  const leaders = leadingScore > 0
    ? publicPicks.filter((participant) => participant.points === leadingScore).map((participant) => participant.nickname)
    : [];
  const leaderLabel = submittedCount === 0
    ? "Awaiting initial picks"
    : leaders.length > 0
      ? `${leaders.slice(0, 2).join(", ")}${leaders.length > 2 ? " +" : ""}`
      : "Scoring not started";
  const unpaidCount = adminOverview.filter((participant) => !participant.venmoPaid).length;
  const currentKnockoutRound = qfStarted && qfMatches.length > 0
    ? {
        label: "Quarterfinals",
        shortLabel: "QF",
        matches: qfMatches,
        picks: qfPicks,
        pickKey: "qfPicks" as KnockoutPickKey,
        locked: qfLocked,
        open: qfOpen,
        scoredCount: qfScoredCount,
        totalPoints: 12,
        pointValue: 3
      }
    : r16Started && r16Matches.length > 0
    ? {
        label: "Round of 16",
        shortLabel: "R16",
        matches: r16Matches,
        picks: r16Picks,
        pickKey: "r16Picks" as KnockoutPickKey,
        locked: r16Locked,
        open: r16Open,
        scoredCount: r16ScoredCount,
        totalPoints: 16,
        pointValue: 2
      }
    : {
        label: "Round of 32",
        shortLabel: "R32",
        matches: r32Matches,
        picks: r32Picks,
        pickKey: "r32Picks" as KnockoutPickKey,
        locked: r32Locked,
        open: r32Open,
        scoredCount: r32ScoredCount,
        totalPoints: 16,
        pointValue: 1
      };
  const currentKnockoutStarted = currentKnockoutRound.open || currentKnockoutRound.locked;
  const knockoutRoundDisplays: KnockoutRoundDisplay[] = [
    {
      stage: "qf" as const,
      label: "Quarterfinals",
      shortLabel: "QF",
      titleId: "qf-picks-title",
      matches: qfMatches,
      picks: qfPicks,
      savedPicks: qfSavedPicks,
      savedAt: qfSavedAt,
      submitted: Boolean(qfSavedPicks),
      submittedAt: qfSavedAt,
      open: qfOpen,
      locked: qfLocked,
      started: qfStarted,
      pointValue: 3,
      totalPoints: 12,
      feedback: qfFeedback,
      onPick: (matchId: string, teamName: string) => setQfPicks((current) => ({ ...current, [matchId]: teamName })),
      onSave: handleSaveQuarterfinalPicks
    },
    {
      stage: "r16" as const,
      label: "Round of 16",
      shortLabel: "R16",
      titleId: "r16-picks-title",
      matches: r16Matches,
      picks: r16Picks,
      savedPicks: r16SavedPicks,
      savedAt: r16SavedAt,
      submitted: Boolean(r16SavedPicks),
      submittedAt: r16SavedAt,
      open: r16Open,
      locked: r16Locked,
      started: r16Started,
      pointValue: 2,
      totalPoints: 16,
      feedback: r16Feedback,
      onPick: (matchId: string, teamName: string) => setR16Picks((current) => ({ ...current, [matchId]: teamName })),
      onSave: handleSaveRoundOf16Picks
    },
    {
      stage: "r32" as const,
      label: "Round of 32",
      shortLabel: "R32",
      titleId: "r32-picks-title",
      matches: r32Matches,
      picks: r32Picks,
      savedPicks: r32SavedPicks,
      savedAt: r32SavedAt,
      submitted: Boolean(r32SavedPicks),
      submittedAt: r32SavedAt,
      open: r32Open,
      locked: r32Locked,
      started: r32Started,
      pointValue: 1,
      totalPoints: 16,
      feedback: r32Feedback,
      onPick: (matchId: string, teamName: string) => setR32Picks((current) => ({ ...current, [matchId]: teamName })),
      onSave: handleSaveRoundOf32Picks
    }
  ].filter((round) => round.matches.length > 0)
    .sort((a, b) => {
      const currentLabel = currentKnockoutRound.shortLabel;
      if (a.shortLabel === currentLabel && b.shortLabel !== currentLabel) return -1;
      if (b.shortLabel === currentLabel && a.shortLabel !== currentLabel) return 1;

      return b.pointValue - a.pointValue;
    });
  const currentKnockoutMatchSummaries = useMemo<KnockoutMatchSummary[]>(() => (
    currentKnockoutRound.matches.map((match) => {
      const teamAPickers = publicPicks.filter((person) => person[currentKnockoutRound.pickKey]?.matchWinners[match.matchId] === match.teamA);
      const teamBPickers = publicPicks.filter((person) => person[currentKnockoutRound.pickKey]?.matchWinners[match.matchId] === match.teamB);
      const selectedPublicPick = showPersonalR32Pick
        ? publicPicks.find((person) => person.code === selectedParticipant.code)?.[currentKnockoutRound.pickKey]?.matchWinners[match.matchId] || ""
        : "";
      const userPick = showPersonalR32Pick ? currentKnockoutRound.picks[match.matchId] || selectedPublicPick : "";
      const poolFavorite = teamAPickers.length === teamBPickers.length
        ? "Split"
        : teamAPickers.length > teamBPickers.length
          ? match.teamA
          : match.teamB;

      return {
        ...match,
        teamAPickers,
        teamBPickers,
        userPick,
        poolFavorite
      };
    })
  ), [currentKnockoutRound.matches, currentKnockoutRound.pickKey, currentKnockoutRound.picks, publicPicks, selectedParticipant.code, showPersonalR32Pick]);
  const closestKnockoutMatches = useMemo(
    () => [...currentKnockoutMatchSummaries]
      .filter((match) => match.teamAPickers.length + match.teamBPickers.length > 0)
      .sort((a, b) => (
        Math.abs(a.teamAPickers.length - a.teamBPickers.length) - Math.abs(b.teamAPickers.length - b.teamBPickers.length) ||
        b.teamAPickers.length + b.teamBPickers.length - (a.teamAPickers.length + a.teamBPickers.length) ||
        a.order - b.order
      ))
      .slice(0, 3),
    [currentKnockoutMatchSummaries]
  );
  const selectedKnockoutMatch = currentKnockoutMatchSummaries.find((match) => match.matchId === selectedKnockoutMatchId) || currentKnockoutMatchSummaries[0] || null;
  const selectedKnockoutImpacts = useMemo(
    () => selectedKnockoutMatch ? buildKnockoutScenarioImpacts(selectedKnockoutMatch, publicPicks, currentKnockoutRound.pointValue) : [],
    [currentKnockoutRound.pointValue, publicPicks, selectedKnockoutMatch]
  );
  const selectedKnockoutStakes = useMemo(
    () => selectedKnockoutMatch
      ? buildKnockoutStakes(selectedKnockoutMatch, publicPicks, selectedKnockoutImpacts, currentKnockoutRound.pickKey, currentKnockoutRound.pointValue)
      : null,
    [currentKnockoutRound.pickKey, currentKnockoutRound.pointValue, publicPicks, selectedKnockoutImpacts, selectedKnockoutMatch]
  );
  const selectedKnockoutOutcome = useMemo(
    () => selectedKnockoutMatch
      ? buildKnockoutOutcomeInsight(selectedKnockoutMatch, publicPicks, currentKnockoutRound.pickKey)
      : null,
    [currentKnockoutRound.pickKey, publicPicks, selectedKnockoutMatch]
  );
  const selectedPublicParticipant = useMemo(
    () => publicPicks.find((person) => person.code === selectedParticipant.code) || null,
    [publicPicks, selectedParticipant.code]
  );
  const rootingGuide = useMemo(
    () => currentKnockoutRound.locked && (identityConfirmed || identityLockedByLink)
      ? buildRootingGuide(
          selectedPublicParticipant,
          publicPicks,
          currentKnockoutMatchSummaries,
          currentKnockoutRound.pickKey,
          currentKnockoutRound.pointValue
        )
      : [],
    [
      currentKnockoutMatchSummaries,
      currentKnockoutRound.locked,
      currentKnockoutRound.pickKey,
      currentKnockoutRound.pointValue,
      identityConfirmed,
      identityLockedByLink,
      publicPicks,
      selectedPublicParticipant
    ]
  );
  const selectedPathToGlory = useMemo(
    () => currentKnockoutRound.locked && (identityConfirmed || identityLockedByLink)
      ? buildPathToGlory(
          selectedPublicParticipant,
          publicPicks,
          currentKnockoutMatchSummaries,
          currentKnockoutRound.pickKey,
          currentKnockoutRound.pointValue,
          championStatusMatches
        )
      : null,
    [
      championStatusMatches,
      currentKnockoutMatchSummaries,
      currentKnockoutRound.locked,
      currentKnockoutRound.pickKey,
      currentKnockoutRound.pointValue,
      identityConfirmed,
      identityLockedByLink,
      publicPicks,
      selectedPublicParticipant
    ]
  );
  const playerStatsRows = useMemo<PlayerStatsRow[]>(() => {
    const rankedPeople = getDisplayRanks([...publicPicks].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname)));

    return rankedPeople.map((person) => {
      const advancers = getPickScoreValue(person, "Advancers");
      const winnerBonus = getPickScoreValue(person, "Winner bonus");
      const champion = person.picks?.champion || "No pick";
      const goldenBoot = person.picks?.goldenBoot || "No pick";
      const pathToGlory = currentKnockoutRound.locked
        ? buildPathToGlory(
            person,
            rankedPeople,
            currentKnockoutMatchSummaries,
            currentKnockoutRound.pickKey,
            currentKnockoutRound.pointValue,
            championStatusMatches
          )
        : null;

      return {
        code: person.code,
        rank: person.displayRank,
        player: person.nickname,
        name: person.name,
        total: person.points,
        group: advancers + winnerBonus,
        advancers,
        winnerBonus,
        knockout: getPickScoreValue(person, "Knockout"),
        r32: getKnockoutRoundPoints(person, "r32Picks", r32Matches, 1),
        r16: getKnockoutRoundPoints(person, "r16Picks", r16Matches, 2),
        qf: getKnockoutRoundPoints(person, "qfPicks", qfMatches, 3),
        champion,
        championEliminated: champion !== "No pick" && isChampionEliminated(champion, championStatusMatches),
        goldenBoot,
        goldenBootStatus: getGoldenBootStatus(goldenBoot, goldenBootRows),
        possibleUpside: pathToGlory?.possibleUpside || 0
      };
    });
  }, [
    championStatusMatches,
    currentKnockoutMatchSummaries,
    currentKnockoutRound.locked,
    currentKnockoutRound.pickKey,
    currentKnockoutRound.pointValue,
    goldenBootRows,
    publicPicks,
    qfMatches,
    r16Matches,
    r32Matches
  ]);
  const sortedPlayerStatsRows = useMemo(() => {
    const directionMultiplier = statsSort.direction === "asc" ? 1 : -1;

    return [...playerStatsRows].sort((a, b) => {
      if (statsSort.key === "player") {
        return directionMultiplier * a.player.localeCompare(b.player);
      }

      const first = a[statsSort.key];
      const second = b[statsSort.key];

      if (typeof first === "number" && typeof second === "number" && first !== second) {
        return directionMultiplier * (first - second);
      }

      return a.player.localeCompare(b.player);
    });
  }, [playerStatsRows, statsSort]);
  const dailyReview = useMemo(
    () => buildDailyReview(publicPicks, groupStandingsRows, goldenBootRows, groupTablesUpdatedAt, {
      label: currentKnockoutRound.shortLabel,
      matches: currentKnockoutMatchSummaries,
      pickKey: currentKnockoutRound.pickKey,
      pointValue: currentKnockoutRound.pointValue,
      locked: currentKnockoutRound.locked
    }),
    [
      currentKnockoutMatchSummaries,
      currentKnockoutRound.locked,
      currentKnockoutRound.pickKey,
      currentKnockoutRound.pointValue,
      currentKnockoutRound.shortLabel,
      goldenBootRows,
      groupStandingsRows,
      groupTablesUpdatedAt,
      publicPicks
    ]
  );
  const adminFetchOptions = useMemo<RequestInit>(() => {
    if (!adminToken) return {};

    return {
      headers: { "x-poolarama-admin": adminToken }
    };
  }, [adminToken]);

  function adminJsonHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (adminToken) {
      headers["x-poolarama-admin"] = adminToken;
    }

    return headers;
  }

  function handleStatsSort(key: StatsSortKey) {
    setStatsSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  useEffect(() => {
    if (selectedChampion && !championCandidates.some((team) => team.name === selectedChampion)) {
      setSelectedChampion("");
      setIsReviewing(false);
    }
  }, [championCandidates, selectedChampion]);

  useEffect(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key === "poolarama-test-picks" || key.startsWith("poolarama-test-picks:")) {
        window.localStorage.removeItem(key);
      }
    }
  }, []);

  function applyGoldenBootPick(nextGoldenBoot: string) {
    if (!nextGoldenBoot) {
      setSelectedGoldenBoot("");
      setGoldenBootWriteIn("");
      return;
    }

    const savedCandidate = goldenBootCandidates.find((candidate) => candidate.name === nextGoldenBoot);

    if (savedCandidate) {
      setSelectedGoldenBoot(savedCandidate.name);
      setGoldenBootWriteIn("");
      return;
    }

    setSelectedGoldenBoot(goldenBootWriteInLabel);
    setGoldenBootWriteIn(nextGoldenBoot);
  }

  useEffect(() => {
    function applySavedPicks(nextPicks: SavedPicks) {
      const hydratedPicks = {
        ...nextPicks,
        groupWinners: completeGroupPicks(nextPicks.groupWinners),
        groupRunnersUp: completeGroupPicks(nextPicks.groupRunnersUp)
      };

      if (nextPicks.champion) {
        setSelectedChampion(nextPicks.champion);
      }

      applyGoldenBootPick(nextPicks.goldenBoot);

      setGroupWinners(hydratedPicks.groupWinners);
      setGroupRunnersUp(hydratedPicks.groupRunnersUp);
      const eligibleChampion = [...Object.values(hydratedPicks.groupWinners), ...Object.values(hydratedPicks.groupRunnersUp)];
      const nextChampion = eligibleChampion.includes(nextPicks.champion) ? nextPicks.champion : "";

      setSelectedChampion(nextChampion);
      setSavedPicks({ ...hydratedPicks, champion: nextChampion });
      setSaveFeedback(
        nextPicks.storageMode === "mongo"
          ? "Restored from Mongo."
          : nextPicks.storageMode === "mock"
            ? "Restored from prototype API memory."
            : "Restored from this browser."
      );
    }

    const urlParticipantCode = new URLSearchParams(window.location.search).get("player");
    const adminParam = new URLSearchParams(window.location.search).get("admin") || "";
    const adminAccessRequested = Boolean(adminParam);
    const adminParticipant = adminAccessRequested ? defaultParticipant : null;
    setAdminToken(adminParam);
    setAdminEnabled(adminAccessRequested);
    const storedParticipantCode = window.localStorage.getItem(selectedParticipantKey);
    const confirmedParticipantCode = window.localStorage.getItem(confirmedParticipantKey);
    const initialParticipant =
      adminParticipant ||
      knownParticipants.find((participant) => participant.code === storedParticipantCode) ||
      defaultParticipant;
    const linkLocked = Boolean(urlParticipantCode || adminParticipant);
    const lookupCode = urlParticipantCode || "";

    setSelectedParticipant(initialParticipant);
    setIdentityLockedByLink(linkLocked);
    setIdentityConfirmed(Boolean(adminParticipant) || (!urlParticipantCode && confirmedParticipantCode === initialParticipant.code));

    if (adminParticipant) {
      window.localStorage.setItem(selectedParticipantKey, initialParticipant.code);
      window.localStorage.setItem(confirmedParticipantKey, initialParticipant.code);
    }

    if (adminAccessRequested) {
      setTab("admin");
    }

    async function loadSavedPicks() {
      if (!lookupCode) return;

      try {
        const response = await fetch(withBasePath(`/api/me?code=${lookupCode}`), { cache: "no-store" });

        if (response.ok) {
          const data = (await response.json()) as ApiSubmissionResponse;

          if (data.participant) {
            const knownParticipant = knownParticipants.find((participant) => participant.code === data.participant?.code);
            const matchedParticipant = knownParticipant
              ? { ...knownParticipant, inviteCode: data.participant.inviteCode }
              : getParticipantFromApi(data.participant);

            setSelectedParticipant(matchedParticipant);
            setIdentityConfirmed(true);
            window.localStorage.setItem(selectedParticipantKey, matchedParticipant.code);

            if (linkLocked) {
              window.localStorage.setItem(confirmedParticipantKey, matchedParticipant.code);
            }
          }

          if (data.submission) {
            applySavedPicks({
              champion: data.submission.picks.champion,
              goldenBoot: data.submission.picks.goldenBoot,
              groupFilter: data.submission.picks.groupFilter || "All",
              groupWinners: completeGroupPicks(data.submission.picks.groupWinners),
              groupRunnersUp: completeGroupPicks(data.submission.picks.groupRunnersUp),
              savedAt: data.submission.submittedAt,
              storageMode: data.submission.storageMode
            });
          }

          if (data.submissions?.r32?.picks.matchWinners) {
            setR32Picks(data.submissions.r32.picks.matchWinners);
            setR32SavedPicks(data.submissions.r32.picks.matchWinners);
            setR32SavedAt(data.submissions.r32.submittedAt);
            setR32Feedback("Restored Round of 32 picks.");
          }

          if (data.submissions?.r16?.picks.matchWinners) {
            setR16Picks(data.submissions.r16.picks.matchWinners);
            setR16SavedPicks(data.submissions.r16.picks.matchWinners);
            setR16SavedAt(data.submissions.r16.submittedAt);
            setR16Feedback("Restored Round of 16 picks.");
          }

          if (data.submissions?.qf?.picks.matchWinners) {
            setQfPicks(data.submissions.qf.picks.matchWinners);
            setQfSavedPicks(data.submissions.qf.picks.matchWinners);
            setQfSavedAt(data.submissions.qf.submittedAt);
            setQfFeedback("Restored Quarterfinal picks.");
          }

          if (data.submission || data.submissions?.r32 || data.submissions?.r16 || data.submissions?.qf) {
            return;
          }
        } else if (urlParticipantCode) {
          setIdentityLockedByLink(false);
          setIdentityConfirmed(false);
          setSaveFeedback("This invite link is no longer valid. Ask John for a new private link.");
        }
      } catch {
        setSaveFeedback("Could not check saved picks. Try refreshing.");
      }
    }

    loadSavedPicks();
  }, []);

  useEffect(() => {
    loadGroupStandings();
    loadGoldenBootTable();
  }, []);

  useEffect(() => {
    if (!adminEnabled || !adminToken) return;
    loadAdminOverview();
    loadRoundOf32();
    loadRoundOf16();
    loadQuarterfinals();
  }, [adminEnabled, adminToken]);

  useEffect(() => {
    if (!adminEnabled && tab === "admin") {
      setTab("picks");
    }
  }, [adminEnabled, tab]);

  useEffect(() => {
    loadPublicPicks(selectedParticipant.inviteCode || "");
  }, [selectedParticipant.code, selectedParticipant.inviteCode]);

  useEffect(() => {
    if (adminEnabled) return;

    if (poolState.r32.status === "open" || poolState.r32.status === "locked") {
      loadPublicRoundOf32();
      return;
    }

    setR32Matches([]);
  }, [adminEnabled, poolState.r32.status]);

  useEffect(() => {
    if (adminEnabled) return;

    if (poolState.r16.status === "open" || poolState.r16.status === "locked") {
      loadPublicRoundOf16();
      return;
    }

    setR16Matches([]);
  }, [adminEnabled, poolState.r16.status]);

  useEffect(() => {
    if (adminEnabled) return;

    if (poolState.qf.status === "open" || poolState.qf.status === "locked") {
      loadPublicQuarterfinals();
      return;
    }

    setQfMatches([]);
  }, [adminEnabled, poolState.qf.status]);

  async function loadAdminOverview() {
    try {
      const response = await fetch(withBasePath("/api/admin/overview"), {
        cache: "no-store",
        ...adminFetchOptions
      });

      if (!response.ok) {
        throw new Error("Admin overview failed.");
      }

      const data = (await response.json()) as AdminOverviewResponse;
      setAdminOverview(data.participants);
      setPoolDataWarning(null);
      setAdminFeedback(
        data.storageMode === "mongo"
          ? "Admin overview loaded from Mongo."
          : data.warning || "Database unavailable. Showing fallback data, not live submissions."
      );
    } catch {
      setAdminOverview([]);
      setPoolDataWarning("Pool data is temporarily unavailable. Please refresh in a minute.");
      setAdminFeedback("Admin overview unavailable. Live pool data is not being shown.");
    }
  }

  async function loadPoolState() {
    try {
      const response = await fetch(withBasePath("/api/pool-state"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Pool state failed.");
      }

      const data = (await response.json()) as { pool: PoolState };
      setPoolState(normalizePoolState(data.pool));
      setPoolDataWarning(null);
    } catch {
      setPoolState(normalizePoolState(null));
      setPoolDataWarning("Pool data is temporarily unavailable. Please refresh in a minute.");
    }
  }

  async function loadPublicPicks(viewerCode = selectedParticipant.inviteCode || "") {
    try {
      const response = await fetch(withBasePath(`/api/picks?viewerCode=${viewerCode}`), { cache: "no-store" });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Public picks failed.");
      }

      const data = (await response.json()) as PublicPicksResponse;
      setPoolState(normalizePoolState(data.pool));
      if (data.pool.r32.status === "open") {
        setR32Feedback("Round of 32 picks are open.");
      }
      setPublicPicks(data.participants);
      setRoundSubmissions(data.roundSubmissions || {
        r32: {
          submitted: 0,
          total: data.participants.length
        },
        r16: {
          submitted: 0,
          total: data.participants.length
        },
        qf: {
          submitted: 0,
          total: data.participants.length
        }
      });
      setPoolDataWarning(null);
    } catch (error) {
      setPublicPicks([]);
      setRoundSubmissions(defaultRoundSubmissionSummary);
      setPoolDataWarning("Pool data is temporarily unavailable. Please refresh in a minute.");
      if (adminEnabled) {
        const message = error instanceof Error ? error.message : "Could not load pick visibility.";
        setAdminFeedback(`${message} Database connection may be unavailable.`);
      }
    }
  }

  async function loadGroupStandings() {
    try {
      const response = await fetch(withBasePath("/api/group-standings"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Group standings failed.");
      }

      const data = (await response.json()) as { standings: GroupStandingRow[]; latestUpdatedAt?: string | null };
      setGroupStandingsRows(data.standings);
      setGroupTablesUpdatedAt(data.latestUpdatedAt || null);
    } catch {
      setAdminFeedback("Could not load group standings.");
    }
  }

  async function loadGoldenBootTable() {
    try {
      const response = await fetch(withBasePath("/api/golden-boot"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Golden Boot table failed.");
      }

      const data = (await response.json()) as GoldenBootResponse;
      setGoldenBootRows(data.rows);
      setGoldenBootUpdatedAt(data.syncedAt);
      setGoldenBootProvider(data.provider);
      setGoldenBootFeedback(`Updated from ${data.provider} after ${data.completedMatchCount} completed matches.`);
    } catch {
      setGoldenBootFeedback("Golden Boot table is unavailable.");
    }
  }

  async function loadRoundOf32() {
    try {
      const response = await fetch(withBasePath("/api/admin/r32"), {
        cache: "no-store",
        ...adminFetchOptions
      });

      if (!response.ok) {
        throw new Error("Round of 32 failed.");
      }

      const data = (await response.json()) as RoundOf32Response;
      setR32Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR32PreviewReady(Boolean(data.previewOnly));
    } catch {
      setR32Feedback("Round of 32 unavailable.");
    }
  }

  async function loadRoundOf16() {
    try {
      const response = await fetch(withBasePath("/api/admin/r16"), {
        cache: "no-store",
        ...adminFetchOptions
      });

      if (!response.ok) {
        throw new Error("Round of 16 failed.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setR16Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR16PreviewReady(Boolean(data.previewOnly));
    } catch {
      setAdminFeedback("Round of 16 unavailable.");
    }
  }

  async function loadQuarterfinals() {
    try {
      const response = await fetch(withBasePath("/api/admin/qf"), {
        cache: "no-store",
        ...adminFetchOptions
      });

      if (!response.ok) {
        throw new Error("Quarterfinals failed.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setQfMatches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setQfPreviewReady(Boolean(data.previewOnly));
    } catch {
      setAdminFeedback("Quarterfinals unavailable.");
    }
  }

  async function loadPublicRoundOf32() {
    try {
      const response = await fetch(withBasePath("/api/r32"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Round of 32 failed.");
      }

      const data = (await response.json()) as RoundOf32Response;
      setR32Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR32PreviewReady(false);
      setR32Feedback(
        data.pool.r32.status === "open"
          ? "Round of 32 picks are open."
          : data.pool.r32.status === "locked"
            ? "Round of 32 picks are locked."
            : "Round of 32 picks are not open yet."
      );
    } catch {
      setR32Matches([]);
      setR32PreviewReady(false);
      setR32Feedback("Round of 32 unavailable.");
    }
  }

  async function loadPublicRoundOf16() {
    try {
      const response = await fetch(withBasePath("/api/r16"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Round of 16 failed.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setR16Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR16PreviewReady(false);
      setR16Feedback(
        data.pool.r16.status === "open"
          ? "Round of 16 picks are open."
          : data.pool.r16.status === "locked"
            ? "Round of 16 picks are locked."
            : "Round of 16 picks are not open yet."
      );
    } catch {
      setR16Matches([]);
      setR16PreviewReady(false);
      setR16Feedback("Round of 16 unavailable.");
    }
  }

  async function loadPublicQuarterfinals() {
    try {
      const response = await fetch(withBasePath("/api/qf"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Quarterfinals failed.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setQfMatches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setQfPreviewReady(false);
      setQfFeedback(
        data.pool.qf.status === "open"
          ? "Quarterfinal picks are open."
          : data.pool.qf.status === "locked"
            ? "Quarterfinal picks are locked."
            : "Quarterfinal picks are not open yet."
      );
    } catch {
      setQfMatches([]);
      setQfPreviewReady(false);
      setQfFeedback("Quarterfinals unavailable.");
    }
  }

  function updateGroupStanding(team: string, field: keyof GroupStandingRow, value: string) {
    setGroupStandingsRows((currentRows) =>
      currentRows.map((row) => {
        if (row.team !== team) return row;

        const nextValue = field === "team" || field === "group" ? value : Number(value);
        const nextRow = { ...row, [field]: nextValue } as GroupStandingRow;

        if (field === "goalsFor" || field === "goalsAgainst") {
          return {
            ...nextRow,
            goalDifference: nextRow.goalsFor - nextRow.goalsAgainst
          };
        }

        return nextRow;
      })
    );
  }

  async function handleSaveGroupStandings() {
    setAdminFeedback("Saving group standings...");

    try {
      const response = await fetch(withBasePath("/api/admin/group-standings"), {
        method: "PUT",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ standings: groupStandingsRows })
      });

      if (!response.ok) {
        throw new Error("Could not save group standings.");
      }

      const data = (await response.json()) as { standings: GroupStandingRow[]; r32Preview: R32Match[] };
      setGroupStandingsRows(data.standings);
      setGroupTablesUpdatedAt(new Date().toISOString());
      setR32PreviewReady(false);
      setAdminFeedback("Group standings saved. R32 preview updated.");
    } catch {
      setAdminFeedback("Could not save group standings.");
    }
  }

  async function handleSyncGroupStandings() {
    setAdminFeedback("Syncing live group tables...");

    try {
      const response = await fetch(withBasePath("/api/admin/sync-standings"), {
        method: "POST",
        headers: adminJsonHeaders()
      });

      if (!response.ok) {
        throw new Error("Could not sync live group tables.");
      }

      const data = (await response.json()) as SyncStandingsResponse;
      setGroupStandingsRows(data.standings);
      setGroupTablesUpdatedAt(data.syncedAt);
      setR32PreviewReady(false);
      await loadPublicPicks();
      await loadGoldenBootTable();
      setAdminFeedback(
        `Synced ${data.finishedGroupGameCount} finished group matches from ${data.provider} at ${new Date(data.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
      );
    } catch {
      setAdminFeedback("Could not sync live group tables. Manual tables are unchanged.");
    }
  }

  async function handleTogglePreTournamentLock() {
    const nextStatus = preTournamentLocked ? "open" : "locked";
    setAdminFeedback(`${nextStatus === "locked" ? "Locking" : "Unlocking"} pre-tournament picks...`);

    try {
      const response = await fetch(withBasePath("/api/admin/pool-state"), {
        method: "PATCH",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          preTournamentStatus: nextStatus
        })
      });

      if (!response.ok) {
        throw new Error("Pool lock update failed.");
      }

      const data = (await response.json()) as { pool: PoolState };
      setPoolState(normalizePoolState(data.pool));
      await loadPublicPicks();
      setAdminFeedback(`Pre-tournament picks are ${nextStatus}.`);
    } catch {
      setAdminFeedback("Could not update pre-tournament lock.");
    }
  }

  function formatBackupMessage(data: RoundOf32Response) {
    return data.backup?.backupId ? ` Backup ${data.backup.backupId.slice(-6)} saved.` : "";
  }

  async function handleRoundOf32AdminAction(action: "generate" | "open" | "lock" | "reset") {
    const labels = {
      generate: "Generating private Round of 32 preview...",
      open: "Creating backup and opening Round of 32 picks...",
      lock: "Creating backup and locking Round of 32 picks...",
      reset: "Resetting Round of 32 data..."
    };
    const successMessages = {
      generate: "Private Round of 32 preview generated. Review the matchups, then confirm and open.",
      open: "Round of 32 picks are open.",
      lock: "Round of 32 picks are locked.",
      reset: "Round of 32 reset to setup. Group-stage picks were not changed."
    };

    if (action === "open" && r32Matches.length !== 16) {
      setAdminFeedback("Generate and verify 16 Round of 32 matches before opening picks.");
      return;
    }

    if (action === "open" && !r32PreviewReady) {
      setAdminFeedback("Generate a fresh private preview before opening Round of 32 picks.");
      return;
    }

    if (action === "open" && !window.confirm("Open Round of 32 picks from this preview? A backup will be saved first.")) {
      setAdminFeedback("Round of 32 open cancelled.");
      return;
    }

    if (action === "lock" && !window.confirm("Lock Round of 32 picks? A backup will be saved first.")) {
      setAdminFeedback("Round of 32 lock cancelled.");
      return;
    }

    if (action === "reset") {
      const confirmation = window.prompt("Type RESET R32 to delete Round of 32 matchups and R32 submissions. Group-stage picks will not be changed.");

      if (confirmation !== "RESET R32") {
        setAdminFeedback("Round of 32 reset cancelled.");
        return;
      }
    }

    setAdminFeedback(labels[action]);

    try {
      const response = await fetch(withBasePath("/api/admin/r32"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action,
          confirmation: action === "reset" ? "RESET R32" : action === "open" ? "OPEN" : undefined,
          previewMatches: action === "open" ? r32Matches : undefined
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not update Round of 32.");
      }

      const data = (await response.json()) as RoundOf32Response;
      setR32Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR32PreviewReady(Boolean(data.previewOnly));
      if (action === "reset") {
        setR32Picks({});
        setR32SavedPicks(null);
        setR32SavedAt(null);
      }
      await loadPublicPicks();
      setAdminFeedback(`${successMessages[action]}${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update Round of 32.";
      setAdminFeedback(message);
    }
  }

  async function handleRoundOf32Winner(matchId: string, winner: string) {
    setAdminFeedback("Creating backup and saving Round of 32 winner...");

    try {
      const response = await fetch(withBasePath("/api/admin/r32"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action: "score",
          matchId,
          winner
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not save Round of 32 winner.");
      }

      const data = (await response.json()) as RoundOf32Response;
      setR32Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR32PreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(`Round of 32 winner saved.${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save Round of 32 winner.";
      setAdminFeedback(message);
    }
  }

  async function handleSyncRoundOf32Winners() {
    setAdminFeedback("Checking completed Round of 32 matches...");

    try {
      const response = await fetch(withBasePath("/api/admin/r32"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ action: "sync-winners" })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not sync Round of 32 winners.");
      }

      const data = (await response.json()) as RoundOf32Response;
      const updates = data.sync?.updates.length || 0;
      const unchanged = data.sync?.unchanged.length || 0;
      const conflicts = data.sync?.conflicts.length || 0;
      setR32Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR32PreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(
        conflicts > 0
          ? `Synced ${updates} R32 winner${updates === 1 ? "" : "s"}; ${conflicts} conflict${conflicts === 1 ? "" : "s"} need manual review.`
          : `Synced ${updates} R32 winner${updates === 1 ? "" : "s"} from ${data.sync?.provider || "the provider"}. ${unchanged} already current.${formatBackupMessage(data)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync Round of 32 winners.";
      setAdminFeedback(message);
    }
  }

  async function handleRoundOf16AdminAction(action: "generate" | "open" | "lock") {
    const labels = {
      generate: "Generating private Round of 16 preview...",
      open: "Creating backup and opening Round of 16 picks...",
      lock: "Creating backup and locking Round of 16 picks..."
    };
    const successMessages = {
      generate: "Private Round of 16 preview generated. Review the matchups, then confirm and open.",
      open: "Round of 16 picks are open.",
      lock: "Round of 16 picks are locked."
    };

    if (action === "generate" && !r16CanPreview) {
      setAdminFeedback("Score all 16 Round of 32 winners before generating Round of 16.");
      return;
    }

    if (action === "open" && r16Matches.length !== 8) {
      setAdminFeedback("Generate and verify 8 Round of 16 matches before opening picks.");
      return;
    }

    if (action === "open" && !r16PreviewReady) {
      setAdminFeedback("Generate a fresh private preview before opening Round of 16 picks.");
      return;
    }

    if (action === "open" && !window.confirm("Open Round of 16 picks from this preview? A backup will be saved first.")) {
      setAdminFeedback("Round of 16 open cancelled.");
      return;
    }

    if (action === "lock" && !window.confirm("Lock Round of 16 picks? A backup will be saved first.")) {
      setAdminFeedback("Round of 16 lock cancelled.");
      return;
    }

    setAdminFeedback(labels[action]);

    try {
      const response = await fetch(withBasePath("/api/admin/r16"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action,
          confirmation: action === "open" ? "OPEN" : undefined,
          previewMatches: action === "open" ? r16Matches : undefined
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not update Round of 16.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setR16Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR16PreviewReady(Boolean(data.previewOnly));
      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback(`${successMessages[action]}${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update Round of 16.";
      setAdminFeedback(message);
    }
  }

  async function handleRoundOf16Winner(matchId: string, winner: string) {
    setAdminFeedback("Creating backup and saving Round of 16 winner...");

    try {
      const response = await fetch(withBasePath("/api/admin/r16"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action: "score",
          matchId,
          winner
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not save Round of 16 winner.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setR16Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR16PreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(`Round of 16 winner saved.${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save Round of 16 winner.";
      setAdminFeedback(message);
    }
  }

  async function handleSyncRoundOf16Winners() {
    setAdminFeedback("Checking completed Round of 16 matches...");

    try {
      const response = await fetch(withBasePath("/api/admin/r16"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ action: "sync-winners" })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not sync Round of 16 winners.");
      }

      const data = (await response.json()) as RoundOf16Response;
      const updates = data.sync?.updates.length || 0;
      const unchanged = data.sync?.unchanged.length || 0;
      const conflicts = data.sync?.conflicts.length || 0;
      setR16Matches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setR16PreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(
        conflicts > 0
          ? `Synced ${updates} R16 winner${updates === 1 ? "" : "s"}; ${conflicts} conflict${conflicts === 1 ? "" : "s"} need manual review.`
          : `Synced ${updates} R16 winner${updates === 1 ? "" : "s"} from ${data.sync?.provider || "the provider"}. ${unchanged} already current.${formatBackupMessage(data)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync Round of 16 winners.";
      setAdminFeedback(message);
    }
  }

  async function handleQuarterfinalAdminAction(action: "generate" | "open" | "lock") {
    const labels = {
      generate: "Generating private Quarterfinal preview...",
      open: "Creating backup and opening Quarterfinal picks...",
      lock: "Creating backup and locking Quarterfinal picks..."
    };
    const successMessages = {
      generate: "Private Quarterfinal preview generated. Review the matchups, then confirm and open.",
      open: "Quarterfinal picks are open.",
      lock: "Quarterfinal picks are locked."
    };

    if (action === "generate" && !qfCanPreview) {
      setAdminFeedback("Score all 8 Round of 16 winners before generating Quarterfinals.");
      return;
    }

    if (action === "open" && qfMatches.length !== 4) {
      setAdminFeedback("Generate and verify 4 Quarterfinal matches before opening picks.");
      return;
    }

    if (action === "open" && !qfPreviewReady) {
      setAdminFeedback("Generate a fresh private preview before opening Quarterfinal picks.");
      return;
    }

    if (action === "open" && !window.confirm("Open Quarterfinal picks from this preview? A backup will be saved first.")) {
      setAdminFeedback("Quarterfinal open cancelled.");
      return;
    }

    if (action === "lock" && !window.confirm("Lock Quarterfinal picks? A backup will be saved first.")) {
      setAdminFeedback("Quarterfinal lock cancelled.");
      return;
    }

    setAdminFeedback(labels[action]);

    try {
      const response = await fetch(withBasePath("/api/admin/qf"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action,
          confirmation: action === "open" ? "OPEN" : undefined,
          previewMatches: action === "open" ? qfMatches : undefined
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not update Quarterfinals.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setQfMatches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setQfPreviewReady(Boolean(data.previewOnly));
      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback(`${successMessages[action]}${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update Quarterfinals.";
      setAdminFeedback(message);
    }
  }

  async function handleQuarterfinalWinner(matchId: string, winner: string) {
    setAdminFeedback("Creating backup and saving Quarterfinal winner...");

    try {
      const response = await fetch(withBasePath("/api/admin/qf"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          action: "score",
          matchId,
          winner
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not save Quarterfinal winner.");
      }

      const data = (await response.json()) as RoundOf16Response;
      setQfMatches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setQfPreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(`Quarterfinal winner saved.${formatBackupMessage(data)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save Quarterfinal winner.";
      setAdminFeedback(message);
    }
  }

  async function handleSyncQuarterfinalWinners() {
    setAdminFeedback("Checking completed Quarterfinal matches...");

    try {
      const response = await fetch(withBasePath("/api/admin/qf"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ action: "sync-winners" })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not sync Quarterfinal winners.");
      }

      const data = (await response.json()) as RoundOf16Response;
      const updates = data.sync?.updates.length || 0;
      const unchanged = data.sync?.unchanged.length || 0;
      const conflicts = data.sync?.conflicts.length || 0;
      setQfMatches(data.matches);
      setPoolState(normalizePoolState(data.pool));
      setQfPreviewReady(false);
      await loadPublicPicks();
      setAdminFeedback(
        conflicts > 0
          ? `Synced ${updates} QF winner${updates === 1 ? "" : "s"}; ${conflicts} conflict${conflicts === 1 ? "" : "s"} need manual review.`
          : `Synced ${updates} QF winner${updates === 1 ? "" : "s"} from ${data.sync?.provider || "the provider"}. ${unchanged} already current.${formatBackupMessage(data)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync Quarterfinal winners.";
      setAdminFeedback(message);
    }
  }

  async function handleSeedParticipants() {
    setAdminFeedback("Seeding participants...");

    try {
      const response = await fetch(withBasePath("/api/admin/seed-participants"), {
        method: "POST",
        ...adminFetchOptions
      });

      if (!response.ok) {
        throw new Error("Seed failed.");
      }

      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback("Known participants seeded.");
    } catch {
      setAdminFeedback("Could not seed participants.");
    }
  }

  function getInviteUrl(participant: Pick<AdminParticipantOverview, "code" | "inviteCode">) {
    if (typeof window === "undefined") return "";

    return `${window.location.origin}${withBasePath("")}?player=${participant.inviteCode || participant.code}`;
  }

  async function copyToClipboard(text: string, feedback: string) {
    try {
      await window.navigator.clipboard.writeText(text);
      setAdminFeedback(feedback);
    } catch {
      setAdminFeedback(text);
    }
  }

  async function handleCopyInvite(participant: AdminParticipantOverview) {
    await copyToClipboard(getInviteUrl(participant), `Invite link copied for ${participant.nickname}.`);
  }

  async function handleCopyReminder(participant: AdminParticipantOverview) {
    const inviteUrl = getInviteUrl(participant);
    await copyToClipboard(
      `Poolarama picks are open. Use your private link to submit: ${inviteUrl}`,
      `Reminder copied for ${participant.nickname}.`
    );
  }

  async function handleAddParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newParticipantName.trim();
    const nickname = newParticipantNickname.trim() || name;

    if (!name || !nickname) {
      setAdminFeedback("Name and nickname are required.");
      return;
    }

    setAdminFeedback(`Adding ${nickname}...`);

    try {
      const response = await fetch(withBasePath("/api/admin/participants"), {
        method: "POST",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ name, nickname })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not add participant.");
      }

      const data = (await response.json()) as { participant: KnownParticipant };

      setNewParticipantName("");
      setNewParticipantNickname("");
      await loadAdminOverview();
      setAdminFeedback(`${data.participant.nickname} added. Copy their invite link below.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add participant.";
      setAdminFeedback(message);
    }
  }

  async function handleDeleteParticipant(participant: AdminParticipantOverview) {
    if (pendingDeleteCode !== participant.code) {
      setPendingDeleteCode(participant.code);
      setAdminFeedback(`Tap Confirm delete for ${participant.nickname} to remove this test player.`);
      return;
    }

    setAdminFeedback(`Deleting ${participant.nickname}...`);

    try {
      const response = await fetch(withBasePath(`/api/admin/participants?code=${participant.code}`), {
        method: "DELETE",
        ...adminFetchOptions
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not delete participant.");
      }

      await loadAdminOverview();
      await loadPublicPicks();
      setPendingDeleteCode("");
      setAdminFeedback(`${participant.nickname} deleted.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete participant.";
      setAdminFeedback(message);
    }
  }

  async function handleClearSubmissions() {
    const confirmation = window.prompt("Type RESET GROUP PICKS to clear pre-tournament submissions. This affects player picks.");

    if (confirmation !== "RESET GROUP PICKS") {
      setAdminFeedback("Clear test submissions cancelled.");
      return;
    }

    setAdminFeedback("Clearing test submissions...");

    try {
      const response = await fetch(withBasePath("/api/admin/clear-submissions"), {
        method: "DELETE",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ confirmation: "RESET GROUP PICKS" })
      });

      if (!response.ok) {
        throw new Error("Clear submissions failed.");
      }

      const data = (await response.json()) as { deleted: number };
      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback(`Cleared ${data.deleted} test submission${data.deleted === 1 ? "" : "s"}.`);
    } catch {
      setAdminFeedback("Could not clear test submissions.");
    }
  }

  async function handleTogglePayment(participant: AdminParticipantOverview) {
    const nextPaid = !participant.venmoPaid;
    setAdminFeedback(`${nextPaid ? "Marking" : "Clearing"} ${participant.nickname}'s payment...`);

    try {
      const response = await fetch(withBasePath("/api/admin/payment"), {
        method: "PATCH",
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          participantCode: participant.code,
          venmoPaid: nextPaid
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Payment update failed.");
      }

      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback(`${participant.nickname} marked ${nextPaid ? "paid" : "unpaid"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update payment status.";
      setAdminFeedback(`${message} ${participant.nickname}'s payment was not saved.`);
    }
  }

  function handleExportPicks() {
    if (!adminToken) {
      setAdminFeedback("Admin token is missing.");
      return;
    }

    window.location.href = withBasePath(`/api/admin/export?adminToken=${encodeURIComponent(adminToken)}`);
  }

  async function handleSelectParticipant(participant: KnownParticipant) {
    if (identityLockedByLink) return;

    setSelectedParticipant(participant);
    setIdentityConfirmed(false);
    setSelectedChampion("");
    setSelectedGoldenBoot("");
    setGoldenBootWriteIn("");
    setGroupWinners(buildEmptyGroupPicks());
    setGroupRunnersUp(buildEmptyGroupPicks());
    setSavedPicks(null);
    setR32Picks({});
    setR32SavedPicks(null);
    setR32SavedAt(null);
    setIsReviewing(false);
    setIncompleteAlertVisible(false);
    setSaveFeedback(`Ready for ${participant.nickname}.`);
    window.localStorage.setItem(selectedParticipantKey, participant.code);
    window.localStorage.removeItem(confirmedParticipantKey);

    try {
      const response = await fetch(withBasePath(`/api/me?code=${participant.code}`), { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as ApiSubmissionResponse;

      if (data.participant) {
        setSelectedParticipant(getParticipantFromApi(data.participant));
      }

      if (data.submission) {
        setSelectedChampion(data.submission.picks.champion);
        applyGoldenBootPick(data.submission.picks.goldenBoot);
        setGroupWinners(completeGroupPicks(data.submission.picks.groupWinners));
        setGroupRunnersUp(completeGroupPicks(data.submission.picks.groupRunnersUp));
        setSavedPicks({
          champion: data.submission.picks.champion,
          goldenBoot: data.submission.picks.goldenBoot,
          groupFilter: data.submission.picks.groupFilter || "All",
          groupWinners: completeGroupPicks(data.submission.picks.groupWinners),
          groupRunnersUp: completeGroupPicks(data.submission.picks.groupRunnersUp),
          savedAt: data.submission.submittedAt,
          storageMode: data.submission.storageMode
        });
        setSaveFeedback(
          data.submission.storageMode === "mongo"
            ? `Loaded ${participant.nickname}'s saved picks from Mongo.`
            : `Loaded ${participant.nickname}'s saved picks from prototype API memory.`
        );
      }

      if (data.submissions?.r32?.picks.matchWinners) {
        setR32Picks(data.submissions.r32.picks.matchWinners);
        setR32SavedPicks(data.submissions.r32.picks.matchWinners);
        setR32SavedAt(data.submissions.r32.submittedAt);
      }

      if (data.submissions?.r16?.picks.matchWinners) {
        setR16Picks(data.submissions.r16.picks.matchWinners);
        setR16SavedPicks(data.submissions.r16.picks.matchWinners);
        setR16SavedAt(data.submissions.r16.submittedAt);
      }
    } catch {
      setSaveFeedback(`Ready for ${participant.nickname}. API lookup unavailable.`);
    }
  }

  function handleConfirmIdentity() {
    setIdentityConfirmed(true);
    window.localStorage.setItem(selectedParticipantKey, selectedParticipant.code);
    window.localStorage.setItem(confirmedParticipantKey, selectedParticipant.code);
    setSaveFeedback(`Confirmed as ${selectedParticipant.nickname}.`);
  }

  async function handleSavePicks() {
    if (!allRequiredPicksComplete) {
      setIsReviewing(false);
      setSaveFeedback(completionHint);
      return;
    }

    if (preTournamentControlsLocked) {
      setIsReviewing(false);
      setSaveFeedback("Pre-tournament picks are locked.");
      return;
    }

    setIsSaving(true);
    setSaveFeedback("Submitting picks...");

    try {
      const response = await fetch(withBasePath("/api/submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stage: "preTournament",
          participantCode: selectedParticipant.code,
          picks: {
            champion: selectedChampion,
            goldenBoot: finalGoldenBootPick,
            groupFilter: "All",
            groupWinners,
            groupRunnersUp
          }
        })
      });

      if (!response.ok) {
        throw new Error("API save failed.");
      }

      const data = (await response.json()) as ApiSubmissionResponse;

      if (!data.submission) {
        throw new Error("API did not return saved picks.");
      }

      const apiSavedPicks: SavedPicks = {
        champion: data.submission.picks.champion,
        goldenBoot: data.submission.picks.goldenBoot,
        groupFilter: data.submission.picks.groupFilter || "All",
        groupWinners: completeGroupPicks(data.submission.picks.groupWinners),
        groupRunnersUp: completeGroupPicks(data.submission.picks.groupRunnersUp),
        savedAt: data.submission.submittedAt,
        storageMode: data.submission.storageMode
      };

      setSavedPicks(apiSavedPicks);
      setIsReviewing(false);
      loadAdminOverview();
      loadPublicPicks();
      setSaveFeedback(
        data.submission.storageMode === "mongo"
          ? "Picks submitted."
          : "Picks submitted. Prototype API memory updated."
      );
    } catch {
      setIsReviewing(false);
      loadAdminOverview();
      loadPublicPicks();
      setSaveFeedback("Could not submit picks. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveRoundOf32Picks() {
    if (!r32PicksComplete) {
      setR32Feedback("Pick every Round of 32 winner before submitting.");
      return;
    }

    if (!r32Open) {
      setR32Feedback(r32Locked ? "Round of 32 picks are locked." : "Round of 32 picks are not open yet.");
      return;
    }

    setIsSaving(true);
    setR32Feedback("Submitting Round of 32 picks...");

    try {
      const response = await fetch(withBasePath("/api/submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stage: "r32",
          participantCode: selectedParticipant.code,
          picks: {
            matchWinners: r32Picks
          }
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not submit Round of 32 picks.");
      }

      const data = (await response.json()) as ApiSubmissionResponse;
      setR32SavedPicks(r32Picks);
      setR32SavedAt(data.submission?.submittedAt || new Date().toISOString());
      await loadPublicPicks();
      setR32Feedback("Round of 32 picks submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit Round of 32 picks.";
      setR32Feedback(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveRoundOf16Picks() {
    if (!r16PicksComplete) {
      setR16Feedback("Pick every Round of 16 winner before submitting.");
      return;
    }

    if (!r16Open) {
      setR16Feedback(r16Locked ? "Round of 16 picks are locked." : "Round of 16 picks are not open yet.");
      return;
    }

    setIsSaving(true);
    setR16Feedback("Submitting Round of 16 picks...");

    try {
      const response = await fetch(withBasePath("/api/submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stage: "r16",
          participantCode: selectedParticipant.code,
          picks: {
            matchWinners: r16Picks
          }
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not submit Round of 16 picks.");
      }

      const data = (await response.json()) as ApiSubmissionResponse;
      setR16SavedPicks(r16Picks);
      setR16SavedAt(data.submission?.submittedAt || new Date().toISOString());
      await loadPublicPicks();
      setR16Feedback("Round of 16 picks submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit Round of 16 picks.";
      setR16Feedback(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveQuarterfinalPicks() {
    if (!qfPicksComplete) {
      setQfFeedback("Pick every Quarterfinal winner before submitting.");
      return;
    }

    if (!qfOpen) {
      setQfFeedback(qfLocked ? "Quarterfinal picks are locked." : "Quarterfinal picks are not open yet.");
      return;
    }

    setIsSaving(true);
    setQfFeedback("Submitting Quarterfinal picks...");

    try {
      const response = await fetch(withBasePath("/api/submissions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stage: "qf",
          participantCode: selectedParticipant.code,
          picks: {
            matchWinners: qfPicks
          }
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || "Could not submit Quarterfinal picks.");
      }

      const data = (await response.json()) as ApiSubmissionResponse;
      setQfSavedPicks(qfPicks);
      setQfSavedAt(data.submission?.submittedAt || new Date().toISOString());
      await loadPublicPicks();
      setQfFeedback("Quarterfinal picks submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit Quarterfinal picks.";
      setQfFeedback(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="poolarama-title">
        <div className="logo-row logo-row-image">
          <img
            className="poolarama-logo"
            src={withBasePath("/poolarama-logo-concept.png")}
            alt="Poolarama"
          />
          <h1 id="poolarama-title" className="sr-only">Poolarama</h1>
        </div>
        <p className="eyebrow hero-eyebrow">Men&apos;s World Cup 2026 Edition</p>
        <div className="hero-metrics" aria-label="Pool summary">
          <div>
            <strong>{totalPlayers}</strong>
            <span>players</span>
          </div>
          <div>
            <strong>${potTotal}</strong>
            <span>paid pot</span>
          </div>
          <div>
            <strong>{leaderLabel}</strong>
            <span>leader</span>
          </div>
          {heroKnockoutSubmissionMetric && (
            <div>
              <strong>{heroKnockoutSubmissionMetric.submitted}/{heroKnockoutSubmissionMetric.total}</strong>
              <span>{heroKnockoutSubmissionMetric.label}</span>
            </div>
          )}
        </div>
      </section>

      <nav className="tabbar" aria-label="Poolarama sections">
        <TabButton label={r32Started ? "Current" : "Picks"} tabName="picks" activeTab={tab} onSelect={setTab} />
        <TabButton label="Standings" tabName="standings" activeTab={tab} onSelect={setTab} />
        {adminEnabled ? (
          <TabButton label="Admin" tabName="admin" activeTab={tab} onSelect={setTab} />
        ) : (
          <TabButton label="Stats" tabName="tables" activeTab={tab} onSelect={setTab} />
        )}
        <TabButton label="Rules" tabName="rules" activeTab={tab} onSelect={setTab} />
        <TabButton label="Pay" tabName="payments" activeTab={tab} onSelect={setTab} />
        <TabButton label="Pantheon" tabName="pantheon" activeTab={tab} onSelect={setTab} />
      </nav>

      {tab === "picks" && (
        <section className="screen stack" aria-labelledby="picks-title">
          <ScreenHeader
            kicker={qfOpen ? "Quarterfinal picks open" : qfLocked ? "Current round locked" : r16Open ? "Round of 16 picks open" : r16Locked ? "Current round locked" : r32Open ? "Round of 32 picks open" : r32Locked || showLockedHomeNotice || showParticipantLockedHeader ? "Current round locked" : identityConfirmed ? "Picks open" : "Player access"}
            title={qfOpen ? "Quarterfinals are now open" : qfLocked ? "Quarterfinals are locked" : r16Open ? "Round of 16 is now open" : r16Locked ? "Round of 16 is locked" : r32Open ? "Make your Round of 32 picks" : r32Locked ? "Round of 32 is locked" : showLockedHomeNotice ? "All picks are in" : showParticipantLockedHeader ? "Review your locked picks" : identityConfirmed ? "Make your group picks" : "Open your player link"}
            note={showLockedHomeNotice
              ? "The group-stage picks are locked and visible in the standings."
              : qfLocked
              ? "Quarterfinal picks are locked and visible. Scoring updates as winners are entered."
              : qfOpen
              ? `This link is assigned to ${selectedParticipant.nickname}. Confirm your name, then pick every Quarterfinal match winner.`
              : r16Open
              ? `This link is assigned to ${selectedParticipant.nickname}. Confirm your name, then pick every Round of 16 match winner.`
              : r16Locked
              ? "Round of 16 picks are locked and visible. Scoring updates as winners are entered."
              : r32Open
              ? `This link is assigned to ${selectedParticipant.nickname}. Scroll to the Round of 32 card and pick every match winner.`
              : r32Locked
              ? "Round of 32 picks are locked and visible. Scoring updates as winners are entered."
              : showParticipantLockedHeader
              ? "Your group-stage, champion, and Golden Boot picks are locked. Knockout picks will appear here when John opens them."
              : identityLockedByLink
              ? `This test link is assigned to ${selectedParticipant.nickname}.`
              : identityConfirmed
                ? `Making picks as ${selectedParticipant.nickname}. Start with group winners and runners-up.`
                : "Use your private player link to view or edit picks when a round is open."}
          />
          {poolDataWarning && (
            <div className="inline-alert" role="alert">
              <strong>{poolDataWarning}</strong>
            </div>
          )}
          {currentKnockoutStarted && currentKnockoutRound.locked && currentKnockoutRound.matches.length > 0 && (
            <section className="round-clarity-card" aria-label="Current round status">
              <div>
                <span>Current round</span>
                <strong>{currentKnockoutRound.label}</strong>
              </div>
              <div>
                <span>Picks</span>
                <strong>{currentKnockoutRound.locked ? "Locked and visible" : "Open now"}</strong>
              </div>
              <div>
                <span>Scoring</span>
                <strong>{currentKnockoutRound.scoredCount}/{currentKnockoutRound.matches.length} entered</strong>
              </div>
	              <p>{currentKnockoutRound.locked ? "Everyone can compare picks for this round. Point totals update after winners are entered." : "Picks stay private until John locks the round."}</p>
	            </section>
	          )}
          {selectedPathToGlory && (
            <section className="path-card" aria-labelledby="path-title">
              <div className="path-heading">
                <div>
                  <p className="eyebrow">Path to Glory</p>
                  <h3 id="path-title">
                    {selectedParticipant.nickname}
                    <span>{selectedPathToGlory.rankLabel}</span>
                  </h3>
                  <p>{selectedPathToGlory.status}</p>
                </div>
              </div>
              <div className="path-grid">
                <div>
                  <span>Now</span>
                  <strong>{selectedPathToGlory.points} pts</strong>
                  <em>{selectedPathToGlory.gapLabel}</em>
                </div>
                <div>
                  <span>Possible upside</span>
                  <strong>+{selectedPathToGlory.possibleUpside}</strong>
                  <em>ceiling {selectedPathToGlory.maxPossiblePoints}</em>
                </div>
                <div>
                  <span>Champion</span>
                  <strong className={selectedPathToGlory.championEliminated ? "champion-pick eliminated" : "champion-pick"}>
                    {selectedPathToGlory.champion}
                  </strong>
                  <em>{selectedPathToGlory.championEliminated ? "eliminated" : "alive"}</em>
                </div>
                <div>
                  <span>Leverage</span>
                  <strong>{selectedPathToGlory.leverage}</strong>
                  <em>best remaining angle</em>
                </div>
              </div>
            </section>
          )}
          {rootingGuide.length > 0 && (
            <section className="rooting-guide-card" aria-labelledby="rooting-guide-title">
              <div className="rooting-guide-heading">
                <div>
                  <p className="eyebrow">For {selectedParticipant.nickname}</p>
                  <h3 id="rooting-guide-title">Rooting guide</h3>
                </div>
                <span>{currentKnockoutRound.shortLabel}</span>
              </div>
              <div className="rooting-guide-grid">
                {rootingGuide.map((item) => {
                  const team = getTeamMeta(item.team);

                  return (
                    <article
                      className={`rooting-guide-item drama-${item.drama}`}
                      key={`rooting-${item.matchId}`}
                      style={{
                        "--team-a": team.colors[0],
                        "--team-b": team.colors[1]
                      } as React.CSSProperties}
                    >
                      <span>{item.label}{item.schedule ? ` · ${item.schedule}` : ""}</span>
                      <strong>{team.flag} {item.headline}</strong>
                      <p>{item.detail}</p>
                      <em>{item.note}</em>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
	          {currentKnockoutStarted && currentKnockoutRound.locked && dailyReview.bullets.length > 0 && (
	            <section className="pool-pulse-card" aria-labelledby="pool-pulse-title">
              <div className="pool-pulse-heading">
                <div>
                  <p className="eyebrow">Pool Pulse</p>
                  <h3 id="pool-pulse-title">What matters now</h3>
                </div>
                <span>Powered by Compararama</span>
              </div>
              <div className="pool-pulse-list">
                {dailyReview.bullets.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </section>
          )}
          {currentKnockoutStarted && currentKnockoutRound.locked && currentKnockoutRound.matches.length > 0 && (
            <section className="current-round-card" aria-labelledby="current-round-title">
              <div className="current-round-heading">
                <div>
                  <p className="eyebrow">{currentKnockoutRound.locked ? "Current round locked" : "Current round open"}</p>
                  <h3 id="current-round-title">{currentKnockoutRound.label}</h3>
                  <p>
                    {currentKnockoutRound.locked
                      ? `${currentKnockoutRound.scoredCount}/${currentKnockoutRound.matches.length} matches scored. Tap a match to compare picks and spot the swing games.`
                      : "Make your picks below. Match-by-match pool splits appear after John locks the round."}
                  </p>
                </div>
                <div className="round-progress-pill">
                  <strong>{currentKnockoutRound.scoredCount}/{currentKnockoutRound.matches.length}</strong>
                  <span>scored</span>
                </div>
              </div>
              <div className="current-match-grid">
                {currentKnockoutMatchSummaries.map((match) => {
                  const teamA = getTeamMeta(match.teamA);
                  const teamB = getTeamMeta(match.teamB);
                  const scheduleLabel = formatKnockoutSchedule(match.label);
                  const userResult = match.winner && match.userPick
                    ? match.userPick === match.winner ? `Right +${currentKnockoutRound.pointValue}` : "Missed"
                    : match.userPick ? `You: ${getTeamDisplayName(getTeamMeta(match.userPick))}` : match.poolFavorite === "Split" ? "Pool split" : `Pool likes ${getTeamDisplayName(getTeamMeta(match.poolFavorite))}`;

                  return (
                    <button
                      className={`match-summary-card ${selectedKnockoutMatch?.matchId === match.matchId ? "selected" : ""} ${match.winner ? "scored" : ""}`}
                      key={`summary-${match.matchId}`}
                      type="button"
                      onClick={() => setSelectedKnockoutMatchId(match.matchId)}
                    >
                      <span className="match-summary-label">{match.label}</span>
                      {scheduleLabel && <span className="match-schedule">{scheduleLabel}</span>}
                      <span className="match-summary-teams">
                        <b title={match.teamA}>{teamA.flag} {getTeamDisplayName(teamA)}</b>
                        <em>vs</em>
                        <b title={match.teamB}>{teamB.flag} {getTeamDisplayName(teamB)}</b>
                      </span>
                      <span className="match-summary-meta">
                        <strong>{match.winner ? `Winner: ${match.winner}` : userResult}</strong>
                        {currentKnockoutRound.locked && (
                          <small>{match.teamAPickers.length}-{match.teamBPickers.length} pool split</small>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {currentKnockoutRound.locked && closestKnockoutMatches.length > 0 && (
                <div className="close-call-strip" aria-label="Closest pool splits">
                  <span>Closest calls</span>
                  {closestKnockoutMatches.map((match) => (
                    <button
                      type="button"
                      key={`close-call-${match.matchId}`}
                      className={selectedKnockoutMatch?.matchId === match.matchId ? "selected" : ""}
                      onClick={() => setSelectedKnockoutMatchId(match.matchId)}
                    >
                      <strong>{getTeamMeta(match.teamA).flag} {getTeamDisplayName(getTeamMeta(match.teamA))} vs {getTeamMeta(match.teamB).flag} {getTeamDisplayName(getTeamMeta(match.teamB))}</strong>
                      <small>{formatKnockoutSchedule(match.label)}</small>
                      <em>{match.teamAPickers.length}-{match.teamBPickers.length}</em>
                    </button>
                  ))}
                </div>
              )}
              {selectedKnockoutMatch && (
                <div className="match-comparison-panel" aria-live="polite">
                  <div className="match-comparison-header">
                    <div>
                      <span>{selectedKnockoutMatch.label}</span>
                      {formatKnockoutSchedule(selectedKnockoutMatch.label) && (
                        <p className="match-detail-schedule">{formatKnockoutSchedule(selectedKnockoutMatch.label)}</p>
                      )}
                      <h4>
                        {getTeamMeta(selectedKnockoutMatch.teamA).flag} {selectedKnockoutMatch.teamA}
                        <em> vs </em>
                        {getTeamMeta(selectedKnockoutMatch.teamB).flag} {selectedKnockoutMatch.teamB}
                      </h4>
                    </div>
                    <strong>
                      {selectedKnockoutMatch.winner
                        ? `Scored: ${selectedKnockoutMatch.winner}`
                        : selectedKnockoutMatch.poolFavorite === "Split"
                          ? "Pool split"
                          : `Pool likes ${selectedKnockoutMatch.poolFavorite}`}
                    </strong>
                  </div>
                  {currentKnockoutRound.locked ? (
                    <>
                    {selectedKnockoutOutcome ? (
                      <div className="stakes-strip outcome-strip" aria-label="Match result impact">
                        <div>
                          <span>Result</span>
                          <strong>{selectedKnockoutOutcome.winner}</strong>
                          <em>{selectedKnockoutOutcome.winnerPickers.length} got it right</em>
                        </div>
                        <div>
                          <span>Point earners</span>
                          <strong>{selectedKnockoutOutcome.scoringNames}</strong>
                        </div>
                        <div>
                          <span>Missed chance</span>
                          <strong>{selectedKnockoutOutcome.missNames}</strong>
                        </div>
                        <div>
                          <span>Top-board effect</span>
                          <strong>{selectedKnockoutOutcome.topScorersHelped}</strong>
                          <em>helped near the lead</em>
                        </div>
                      </div>
                    ) : selectedKnockoutStakes && (
                      <div className="stakes-strip" aria-label="Match stakes">
                        <div>
                          <span>Minority side</span>
                          <strong>{selectedKnockoutStakes.minoritySide}</strong>
                          <em>{selectedKnockoutStakes.minorityCount} pick{selectedKnockoutStakes.minorityCount === 1 ? "" : "s"}</em>
                        </div>
                        <div>
                          <span>Most to gain</span>
                          <strong>{selectedKnockoutStakes.mostToGain}</strong>
                        </div>
                        <div>
                          <span>Leader danger</span>
                          <strong>{selectedKnockoutStakes.leaderDanger}</strong>
                        </div>
                        <div>
                          <span>Consensus</span>
                          <strong>{selectedKnockoutStakes.consensus}</strong>
                          <em>{selectedKnockoutStakes.swingSize} rank change{selectedKnockoutStakes.swingSize === 1 ? "" : "s"} possible</em>
                        </div>
                      </div>
                    )}
                    <div className="pick-comparison-grid">
                      {selectedKnockoutImpacts.map(({ team, pickers }) => {
                        const teamMeta = getTeamMeta(team);

                        return (
                          <div
                            className={`pick-comparison-column ${selectedKnockoutMatch.winner === team ? "winner" : ""}`}
                            key={`compare-${selectedKnockoutMatch.matchId}-${team}`}
                            style={{
                              "--team-a": teamMeta.colors[0],
                              "--team-b": teamMeta.colors[1]
                            } as React.CSSProperties}
                          >
                            <div>
                              <strong>{teamMeta.flag} {team}</strong>
                              <span>{pickers.length} pick{pickers.length === 1 ? "" : "s"}</span>
                            </div>
                            {pickers.length > 0 ? (
                              <ul>
                                {pickers.map((person) => (
                                  <li key={`${selectedKnockoutMatch.matchId}-${team}-${person.code}`} className={showPersonalR32Pick && person.code === selectedParticipant.code ? "you" : ""}>
                                    <span>{person.nickname}</span>
                                    <small>{person.points} pts</small>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>No one took this side.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selectedKnockoutOutcome ? (
                      <div className="compararama-panel outcome-panel" aria-label="Compararama result impact">
                        <div>
                          <p className="eyebrow">Compararama</p>
                          <h5>What this result did</h5>
                        </div>
                        <div className="compararama-grid">
                          <article className="compararama-card">
                            <strong>{selectedKnockoutOutcome.winner} paid off</strong>
                            <p>{selectedKnockoutOutcome.winnerPickers.length} player{selectedKnockoutOutcome.winnerPickers.length === 1 ? "" : "s"} earned {currentKnockoutRound.pointValue} point{currentKnockoutRound.pointValue === 1 ? "" : "s"} here.</p>
                            <ul>
                              <li>
                                <span>Best positioned</span>
                                <b>{selectedKnockoutOutcome.topScorersHelped}</b>
                              </li>
                              <li>
                                <span>Read</span>
                                <b>{selectedKnockoutOutcome.rareHit}</b>
                              </li>
                            </ul>
                          </article>
                          <article className="compararama-card">
                            <strong>Who got clipped</strong>
                            <p>{selectedKnockoutOutcome.losingPickers.length} player{selectedKnockoutOutcome.losingPickers.length === 1 ? "" : "s"} missed the point on this game.</p>
                            <ul>
                              <li>
                                <span>Top-board misses</span>
                                <b>{selectedKnockoutOutcome.topScorersHurt}</b>
                              </li>
                              <li>
                                <span>Miss list</span>
                                <b>{selectedKnockoutOutcome.missNames}</b>
                              </li>
                            </ul>
                          </article>
                        </div>
                      </div>
                    ) : (
                      <div className="compararama-panel" aria-label="Compararama match impact">
                        <div>
                          <p className="eyebrow">Compararama</p>
                          <h5>What this result could change</h5>
                        </div>
                        <div className="compararama-grid">
                          {selectedKnockoutImpacts.map((impact) => {
                            const teamMeta = getTeamMeta(impact.team);

                            return (
                              <article
                                className="compararama-card"
                                key={`impact-${selectedKnockoutMatch.matchId}-${impact.team}`}
                                style={{
                                  "--team-a": teamMeta.colors[0],
                                  "--team-b": teamMeta.colors[1]
                                } as React.CSSProperties}
                              >
                                <strong>{teamMeta.flag} If {impact.team} wins</strong>
                                <p>{impact.pickers.length} player{impact.pickers.length === 1 ? "" : "s"} score {currentKnockoutRound.pointValue} point{currentKnockoutRound.pointValue === 1 ? "" : "s"}.</p>
                                <ul>
                                  <li>
                                    <span>Projected leader</span>
                                    <b>{joinNames(impact.projectedLeaders, 2)}</b>
                                  </li>
                                  <li>
                                    <span>Possible climbers</span>
                                    <b>
                                      {impact.climbers.length > 0
                                        ? joinNames(impact.climbers.slice(0, 3).map((person) => `${person.nickname} to ${getOrdinal(person.toRank)}`), 2)
                                        : "No rank changes"}
                                    </b>
                                  </li>
                                </ul>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </>
                  ) : (
                    <div className="round-status-note">
                      <strong>Pick comparison unlocks after the round is locked.</strong>
                      <p>Your pick is saved privately until then.</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          {showLockedHomeNotice && (
            <section className="locked-round-card" aria-labelledby="locked-round-title">
              <div>
                <p className="eyebrow">Group stage</p>
                <h3 id="locked-round-title">Picks locked</h3>
                <p>Everyone&apos;s picks are submitted. Follow the live standings, group tables, and Golden Boot race as the tournament unfolds.</p>
              </div>
              <div className="locked-round-actions">
                <button className="primary-action inline-action" type="button" onClick={() => setTab("standings")}>
                  View standings
                </button>
                <button className="admin-action compact" type="button" onClick={() => setTab("tables")}>
                  View tables
                </button>
              </div>
            </section>
          )}
          {!showLockedHomeNotice && (!r32Locked || identityConfirmed || identityLockedByLink) && (
          <section className="identity-card" aria-labelledby="identity-title">
            <div>
              <p className="eyebrow">Step 1 of 5</p>
              <h3 id="identity-title">{identityConfirmed ? `Confirmed: ${selectedParticipant.nickname}` : "Claim your name"}</h3>
            </div>
            {identityLockedByLink ? (
              <div className="identity-locked">
                <strong>{selectedParticipant.nickname}</strong>
                <span>{selectedParticipant.name}</span>
              </div>
            ) : (
              <div className="identity-grid">
                {knownParticipants.map((participant) => (
                  <button
                    className={`identity-option ${selectedParticipant.code === participant.code ? "selected" : ""}`}
                    key={participant.code}
                    type="button"
                    onClick={() => handleSelectParticipant(participant)}
                  >
                    <strong>{participant.nickname}</strong>
                    <span>{participant.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!identityLockedByLink && (
              <button
                className="primary-action inline-action"
                type="button"
                onClick={handleConfirmIdentity}
                disabled={identityConfirmed}
              >
                {identityConfirmed ? `Name confirmed: ${selectedParticipant.nickname}` : `Confirm ${selectedParticipant.nickname}`}
              </button>
            )}
          </section>
          )}
          {identityConfirmed && (
            <>
          {knockoutRoundDisplays.map((round, index) => {
            const isCurrentRound = index === 0;
            const savedRoundPicks = round.savedPicks || round.picks;

            if (!isCurrentRound && round.started) {
              return (
                <details className="group-stage-details round-history-details" key={`current-history-${round.stage}`}>
                  <summary>
                    <span>{round.label}</span>
                    <strong>{round.locked ? "Locked" : round.open ? "Open" : "Saved"}</strong>
                  </summary>
                  <div className="saved-pick-list round-result-list">
                    {getRoundOf32PickRows(savedRoundPicks, round.matches, round.pointValue).map((pick) => (
                      <div
                        className={`round-result-row result-${pick.result}`}
                        key={`current-history-${round.stage}-${pick.id}`}
                      >
                        <span>{pick.label}{pick.schedule ? ` - ${pick.schedule}` : ""}</span>
                        <strong>{pick.winner || "No pick"}</strong>
                        <em>
                          {pick.result === "pending"
                            ? "Result pending"
                            : pick.result === "won"
                              ? `Won +${pick.points} point${pick.points === 1 ? "" : "s"}`
                              : `Lost 0 points${pick.actualWinner ? ` · winner: ${pick.actualWinner}` : ""}`}
                        </em>
                      </div>
                    ))}
                  </div>
                  {round.savedAt && (
                    <p className="saved-pick-note">
                      {round.label} submitted {new Date(round.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
                    </p>
                  )}
                </details>
              );
            }

            return (
              <section className="knockout-card" aria-labelledby={round.titleId} key={`current-${round.stage}`}>
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">{round.label}</p>
                    <h3 id={round.titleId}>Pick the winner of each match</h3>
                    <p>
                      {round.open
                        ? `${Object.keys(round.picks).length}/${round.matches.length} winners picked`
                        : round.locked
                          ? `${round.label} picks are locked.`
                          : `${round.label} picks are not open yet.`}
                    </p>
                  </div>
                  <div className="points-pill">
                    <strong>{round.totalPoints} pts</strong>
                    <span>{round.pointValue} per match</span>
                  </div>
                </div>
                <div className="knockout-match-grid">
                  {round.matches.map((match) => (
                    <article className="knockout-match-card" key={match.matchId}>
                      <span>{match.label}</span>
                      {formatKnockoutSchedule(match.label) && (
                        <small className="match-schedule">{formatKnockoutSchedule(match.label)}</small>
                      )}
                      <div>
                        {[match.teamA, match.teamB].map((teamName) => {
                          const team = teams.find((candidate) => candidate.name === teamName);

                          return (
                            <button
                              className={round.picks[match.matchId] === teamName ? "selected" : ""}
                              key={`${round.stage}-${match.matchId}-${teamName}`}
                              type="button"
                              disabled={!round.open || isSaving}
                              onClick={() => round.onPick(match.matchId, teamName)}
                              style={{
                                "--team-a": team?.colors[0] || "#0f9f6e",
                                "--team-b": team?.colors[1] || "#ffffff"
                              } as React.CSSProperties}
                            >
                              <span aria-hidden="true">{team?.flag || "⚽"}</span>
                              <strong>{teamName}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  className="primary-action inline-action submit-action"
                  type="button"
                  onClick={round.onSave}
                  disabled={!round.open || isSaving}
                >
                  {round.savedPicks && JSON.stringify(round.savedPicks) === JSON.stringify(round.picks)
                    ? `${round.label} submitted`
                    : round.open
                      ? `Submit ${round.label} picks`
                      : round.locked
                        ? `${round.label} locked`
                        : `${round.label} not open`}
                </button>
	                <p className="pick-status" aria-live="polite">{round.feedback}</p>
	              </section>
	            );
	          })}
          {preTournamentControlsLocked && savedPicks && (
            <details className="group-stage-details pick-archive-details">
              <summary>
                <span>Pick archive</span>
                <strong>Pre-tournament picks</strong>
              </summary>
              <div className="saved-grid">
                <div>
                  <span>Champion</span>
                  <strong>{savedPicks.champion}</strong>
                </div>
                <div>
                  <span>Golden Boot</span>
                  <strong>{savedPicks.goldenBoot}</strong>
                </div>
                <div>
                  <span>Groups</span>
                  <strong>{completedGroupPicks}/12</strong>
                </div>
                <div>
                  <span>Saved</span>
                  <strong>{new Date(savedPicks.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                </div>
              </div>
              <details className="group-stage-details round-history-details">
                <summary>
                  <span>Group stage</span>
                  <strong>All picks</strong>
                </summary>
                <div className="saved-pick-list">
                  {groups.map((group) => (
                    <div key={`locked-saved-group-${group}`}>
                      <span>Group {group}</span>
                      <strong>{savedPicks.groupWinners[group] || "No winner"} / {savedPicks.groupRunnersUp[group] || "No runner-up"}</strong>
                    </div>
                  ))}
                </div>
              </details>
            </details>
          )}
          {!preTournamentControlsLocked && (
            <>
	          <section className="group-picks-card" aria-labelledby="group-picks-title">
	            <div className="section-title-row">
	              <div>
                <p className="eyebrow">Step 2 of 5</p>
                <h3 id="group-picks-title">Pick winners and runners-up</h3>
                <p>{completedGroupPicks}/12 groups complete</p>
              </div>
              <div className="points-pill">
                <strong>36 pts</strong>
                <span>2 winner · 1 runner-up</span>
              </div>
            </div>
            <div className="group-picks-grid">
              {groups.map((group) => {
                const groupTeams = teams.filter((team) => team.group === group);

                return (
                  <article className="group-pick-panel" key={group}>
                    <div className="group-pick-heading">
                      <strong>Group {group}</strong>
                      <span>
                        {groupWinners[group] || "Pick winner"} / {groupRunnersUp[group] || "Pick runner-up"}
                      </span>
                    </div>
                    <div className="group-pick-set" aria-label={`Pick Group ${group} winner`}>
                      <span>Winner</span>
                      <div>
                        {groupTeams.map((team) => (
                          <button
                            className={groupWinners[group] === team.name ? "selected" : ""}
                            key={`${group}-winner-${team.code}`}
                            type="button"
                            disabled={preTournamentControlsLocked || isSaving}
                            style={{
                              "--team-a": team.colors[0],
                              "--team-b": team.colors[1]
                            } as React.CSSProperties}
                            onClick={() => {
                              if (preTournamentControlsLocked) return;

                              setGroupWinners((current) => ({ ...current, [group]: team.name }));
                              setGroupRunnersUp((current) => (
                                current[group] === team.name ? { ...current, [group]: "" } : current
                              ));
                              setIsReviewing(false);
                            }}
                          >
                            <span aria-hidden="true">{team.flag}</span>
                            <span className="country-label" title={team.name}>{getTeamDisplayName(team)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="group-pick-set" aria-label={`Pick Group ${group} runner-up`}>
                      <span>Runner-up</span>
                      <div>
                        {groupTeams.map((team) => (
                          <button
                            className={groupRunnersUp[group] === team.name ? "selected" : ""}
                            key={`${group}-runner-up-${team.code}`}
                            type="button"
                            disabled={preTournamentControlsLocked || isSaving}
                            style={{
                              "--team-a": team.colors[0],
                              "--team-b": team.colors[1]
                            } as React.CSSProperties}
                            onClick={() => {
                              if (preTournamentControlsLocked) return;

                              setGroupRunnersUp((current) => ({ ...current, [group]: team.name }));
                              setGroupWinners((current) => (
                                current[group] === team.name ? { ...current, [group]: "" } : current
                              ));
                              setIsReviewing(false);
                            }}
                          >
                            <span aria-hidden="true">{team.flag}</span>
                            <span className="country-label" title={team.name}>{getTeamDisplayName(team)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="champion-card" aria-labelledby="champion-title">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Step 3 of 5</p>
                <h3 id="champion-title">Pick a champion</h3>
                <p>Only teams you picked to advance from the group stage appear here, and they will populate here.</p>
              </div>
              <div className="points-pill champion-points">
                <strong>6 pts</strong>
                <span>before the tournament</span>
              </div>
            </div>
            <div className="team-grid champion-grid">
              {championCandidates.length > 0 ? (
                championCandidates.map((team) => (
                  <button
                    className={`team-card ${selectedChampion === team.name ? "selected" : ""}`}
                    key={team.name}
                    type="button"
                    disabled={preTournamentControlsLocked || isSaving}
                    onClick={() => {
                      if (preTournamentControlsLocked) return;

                      setSelectedChampion(team.name);
                    }}
                    style={{
                      "--team-a": team.colors[0],
                      "--team-b": team.colors[1]
                    } as React.CSSProperties}
                  >
                    <span className="flag" aria-hidden="true">{team.flag}</span>
                    <span className="team-name" title={team.name}>{getTeamDisplayName(team)}</span>
                    <span className="team-code">Group {team.group} · {team.code}</span>
                  </button>
                ))
              ) : (
                <p className="empty-selection-note">Pick group winners and runners-up first, and they will populate here.</p>
              )}
            </div>
          </section>
          <div className="candidate-card">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Step 4 of 5</p>
                <h3>Pick Golden Boot winner</h3>
              </div>
              <div className="points-pill tiebreaker-points">
                <strong>Tiebreaker</strong>
                <span>no points</span>
              </div>
            </div>
            <div className="candidate-grid">
              {goldenBootCandidates.map((candidate) => {
                const candidateColors = getCountryColors(candidate.country);

                return (
                  <button
                    className={`candidate-option ${selectedGoldenBoot === candidate.name ? "selected" : ""}`}
                    key={candidate.name}
                    type="button"
                    disabled={preTournamentControlsLocked || isSaving}
                    onClick={() => {
                      if (preTournamentControlsLocked) return;

                      setSelectedGoldenBoot(candidate.name);

                      if (candidate.name !== goldenBootWriteInLabel) {
                        setGoldenBootWriteIn("");
                      }
                    }}
                    style={{
                      "--team-a": candidateColors[0],
                      "--team-b": candidateColors[1]
                    } as React.CSSProperties}
                  >
                    <span aria-hidden="true">{candidate.flag}</span>
                    <strong>{candidate.name}</strong>
                    <em>{candidate.country}</em>
                  </button>
                );
              })}
            </div>
            {selectedGoldenBootIsWriteIn && (
              <label className="write-in-field">
                <span>Golden Boot write-in</span>
                <input
                  type="text"
                  value={goldenBootWriteIn}
                  onChange={(event) => setGoldenBootWriteIn(event.target.value)}
                  placeholder="Enter player name"
                  maxLength={80}
                  disabled={preTournamentControlsLocked || isSaving}
                  autoFocus
                />
              </label>
            )}
          </div>
          <section className={`review-card ${isReviewing ? "active" : ""}`} aria-labelledby="review-title">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Step 5 of 5</p>
                <h3 id="review-title">{isReviewing ? "Ready to submit?" : "Check your picks"}</h3>
                <p>{isReviewing ? "Look these over, then submit when they are right." : completionHint}</p>
              </div>
              <div className="points-pill submit-points">
                <strong>42 pts</strong>
                <span>at stake plus tiebreaker</span>
              </div>
            </div>
            <div className="review-grid">
              <div>
                <span>Player</span>
                <strong>{selectedParticipant.nickname}</strong>
              </div>
              <div>
                <span>Groups</span>
                <strong>{completedGroupPicks}/12 complete</strong>
              </div>
              <div>
                <span>Champion</span>
                <strong>{selectedChampion || "Not picked yet"}</strong>
              </div>
              <div>
                <span>Golden Boot</span>
                <strong>{finalGoldenBootPick || "Not picked yet"}</strong>
              </div>
            </div>
            {isReviewing && (
              <div className="review-groups" aria-label="Group pick review">
                {groups.map((group) => (
                  <div key={`review-${group}`}>
                    <span>Group {group}</span>
                    <strong>{groupWinners[group] || "No winner"} / {groupRunnersUp[group] || "No runner-up"}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
          <button
            className={`primary-action ${isReviewing ? "submit-action" : ""}`}
            type="button"
            onClick={() => {
              if (!allRequiredPicksComplete) {
                setIsReviewing(false);
                setSaveFeedback(completionHint);
                setIncompleteAlertVisible(true);
                window.alert("Please finish your picks before submitting.");
                return;
              }

              if (preTournamentControlsLocked) {
                setIsReviewing(false);
                setSaveFeedback("Pre-tournament picks are locked.");
                return;
              }

              if (isReviewing) {
                handleSavePicks();
                return;
              }

              setIsReviewing(true);
            }}
            disabled={isSaving || preTournamentControlsLocked}
            aria-disabled={isSaving || preTournamentControlsLocked || !allRequiredPicksComplete}
          >
            {isSaving
              ? "Submitting picks..."
              : isReviewing
                ? `Submit Picks: ${selectedParticipant.nickname}`
                : preTournamentControlsLocked
                  ? "Picks Locked"
                : !allRequiredPicksComplete
                  ? `Finish Picks: ${selectedParticipant.nickname}`
                  : currentPicksAreSaved
                  ? "Picks submitted"
                  : `Review Picks: ${selectedParticipant.nickname}`}
          </button>
          <p className="pick-status" aria-live="polite">
            {allRequiredPicksComplete ? saveFeedback : completionHint}
          </p>
	          {incompleteAlertVisible && (
	            <div className="inline-alert" role="alertdialog" aria-modal="false" aria-label="Incomplete picks">
	              <strong>Please finish your picks before submitting.</strong>
	              <button type="button" onClick={() => setIncompleteAlertVisible(false)}>
	                OK
	              </button>
	            </div>
	          )}
            </>
          )}
	          {savedPicks && !preTournamentControlsLocked && (
	            <section className="save-confirmation" aria-live="polite" aria-label="Saved picks">
              <div>
                <p className="eyebrow">Saved picks</p>
                <h3>{selectedParticipant.nickname}&apos;s picks are saved</h3>
                <p>Group-stage, champion, Golden Boot, and knockout picks will appear here as they are submitted.</p>
              </div>
              <div className="saved-grid">
                <div>
                  <span>Champion</span>
                  <strong>{savedPicks.champion}</strong>
                </div>
                <div>
                  <span>Golden Boot</span>
                  <strong>{savedPicks.goldenBoot}</strong>
                </div>
                <div>
                  <span>Groups</span>
                  <strong>{completedGroupPicks}/12</strong>
                </div>
                <div>
                  <span>Saved</span>
                  <strong>{new Date(savedPicks.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                </div>
              </div>
              <div className="saved-pick-section">
                <h4>Group stage</h4>
                <div className="saved-pick-list">
                  {groups.map((group) => (
                    <div key={`saved-group-${group}`}>
                      <span>Group {group}</span>
                      <strong>{savedPicks.groupWinners[group] || "No winner"} / {savedPicks.groupRunnersUp[group] || "No runner-up"}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {knockoutRoundDisplays.map((round, index) => {
                const roundPicks = round.savedPicks;
                const roundContent = roundPicks && Object.keys(roundPicks).length > 0 ? (
                  <>
                    <div className="saved-pick-list">
                      {(round.matches.length > 0
                        ? round.matches.map((match) => ({
                            id: match.matchId,
                            label: match.label,
                            schedule: formatKnockoutSchedule(match.label),
                            winner: roundPicks[match.matchId]
                          }))
                        : Object.entries(roundPicks).map(([id, winner]) => ({
                            id,
                            label: id.toUpperCase(),
                            schedule: "",
                            winner
                          }))
                      ).map((pick) => (
                        <div key={`saved-${round.stage}-${pick.id}`}>
                          <span>{pick.label}{pick.schedule ? ` - ${pick.schedule}` : ""}</span>
                          <strong>{pick.winner || "No pick"}</strong>
                        </div>
                      ))}
                    </div>
                    {round.savedAt && (
                      <p className="saved-pick-note">{round.label} submitted {new Date(round.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</p>
                    )}
                  </>
                ) : (
                  <p className="saved-pick-note">No {round.label} picks submitted yet.</p>
                );

                if (index > 0) {
                  return (
                    <details className="group-stage-details round-history-details" key={`saved-${round.stage}`}>
                      <summary>
                        <span>{round.label}</span>
                        <strong>{round.savedPicks ? "Saved" : "No picks"}</strong>
                      </summary>
                      {roundContent}
                    </details>
                  );
                }

                return (
                  <div className="saved-pick-section" key={`saved-${round.stage}`}>
                    <h4>{round.label}</h4>
                    {roundContent}
                  </div>
                );
              })}
            </section>
          )}
            </>
          )}
        </section>
      )}

      {tab === "standings" && (
        <section className="screen stack" aria-labelledby="standings-title">
          <ScreenHeader
            kicker="Live board"
            title="Standings"
            note={
              currentKnockoutStarted
                ? currentKnockoutRound.locked
                  ? `${currentKnockoutRound.label} picks are locked and visible. Scoring updates as winners are entered.`
                  : `${currentKnockoutRound.label} picks stay hidden until John locks this round.`
                : preTournamentLocked
                  ? "Pre-tournament picks are locked and visible."
                  : "Picks stay hidden until John locks the round."
            }
          />
          {poolDataWarning && (
            <div className="inline-alert" role="alert">
              <strong>{poolDataWarning}</strong>
            </div>
          )}
          {currentKnockoutStarted && currentKnockoutRound.matches.length > 0 && (
            <section className="round-clarity-card compact" aria-label="Standings round status">
              <div>
                <span>Current round</span>
                <strong>{currentKnockoutRound.label}</strong>
              </div>
              <div>
                <span>Picks</span>
                <strong>{currentKnockoutRound.locked ? "Visible" : "Hidden until locked"}</strong>
              </div>
              <div>
                <span>Scoring</span>
                <strong>{currentKnockoutRound.scoredCount}/{currentKnockoutRound.matches.length}</strong>
              </div>
              <p>{currentKnockoutRound.locked ? "Round points are included here after each winner is entered." : "This round is not included in standings yet."}</p>
            </section>
          )}
          <div className="standings-list">
            {(() => {
              const standingsPeople: PublicPickParticipant[] = publicPicks.length > 0
                ? publicPicks
                : adminOverview.map((participant) => ({
                    code: participant.code,
                    name: participant.name,
                    nickname: participant.nickname,
                    venmoPaid: participant.venmoPaid,
                    submitted: participant.submitted,
                    submittedAt: participant.submittedAt,
                    r32Submitted: participant.r32Submitted,
                    r32SubmittedAt: participant.r32SubmittedAt,
                    r32Picks: null,
                    r16Submitted: participant.r16Submitted,
                    r16SubmittedAt: participant.r16SubmittedAt,
                    r16Picks: null,
                    qfSubmitted: participant.qfSubmitted,
                    qfSubmittedAt: participant.qfSubmittedAt,
                    qfPicks: null,
                    points: 0,
                    scoring: [],
                    visible: participant.code === selectedParticipant.code,
                    groupPickScores: {},
                    picks: null
                  }));
              let previousPoints: number | null = null;
              let displayRank = 0;

              return standingsPeople.map((person, index) => {
                if (index === 0 || person.points !== previousPoints) {
                  displayRank += 1;
                  previousPoints = person.points;
                }
                const groupAdvancerPoints = getPickScoreValue(person, "Advancers");
                const groupWinnerBonusPoints = getPickScoreValue(person, "Winner bonus");
                const groupStagePoints = groupAdvancerPoints + groupWinnerBonusPoints;
                const championPick = person.picks?.champion || "";
                const championEliminated = isChampionEliminated(championPick, championStatusMatches);
                const scoredGroupPickCount = groups.reduce((total, group) => {
                  const groupScore = person.groupPickScores?.[group];

                  return total +
                    (groupScore?.winner !== undefined ? 1 : 0) +
                    (groupScore?.runnerUp !== undefined ? 1 : 0);
                }, 0);
                const personKnockoutRounds = [
                  {
                    stage: "qf",
                    label: "Quarterfinals",
                    shortLabel: "QF",
                    started: qfStarted,
                    submitted: person.qfSubmitted,
                    picks: person.qfPicks,
                    matches: qfMatches,
                    pointValue: 3
                  },
                  {
                    stage: "r16",
                    label: "Round of 16",
                    shortLabel: "R16",
                    started: r16Started,
                    submitted: person.r16Submitted,
                    picks: person.r16Picks,
                    matches: r16Matches,
                    pointValue: 2
                  },
                  {
                    stage: "r32",
                    label: "Round of 32",
                    shortLabel: "R32",
                    started: r32Started,
                    submitted: person.r32Submitted,
                    picks: person.r32Picks,
                    matches: r32Matches,
                    pointValue: 1
                  }
	                ].filter((round) => round.started)
	                  .sort((a, b) => {
	                    const currentLabel = currentKnockoutRound.shortLabel;
	                    if (a.shortLabel === currentLabel && b.shortLabel !== currentLabel) return -1;
	                    if (b.shortLabel === currentLabel && a.shortLabel !== currentLabel) return 1;
	                    return b.pointValue - a.pointValue;
	                  });
                const pathToGlory = currentKnockoutRound.locked
                  ? buildPathToGlory(
                      person,
                      standingsPeople,
                      currentKnockoutMatchSummaries,
                      currentKnockoutRound.pickKey,
                      currentKnockoutRound.pointValue,
                      championStatusMatches
                    )
                  : null;
	                return (
	                  <article className={`standing-row standing-${displayRank}`} key={person.code}>
                    <div className="standing-main">
                      <div className="rank">{displayRank}</div>
                      <div>
                        <h3>{person.nickname}</h3>
                        <p>
                          {person.name}
                          {person.code === selectedParticipant.code ? " · you" : ""}
                        </p>
                      </div>
                      <strong>{person.submitted ? `${person.points} pts` : "—"}</strong>
                    </div>
                    {person.submitted && person.scoring.length > 0 && (
                      <div className="score-breakdown" aria-label={`${person.nickname} score breakdown`}>
                        {person.scoring.map((item) => {
                          const potential = item.label === "Advancers"
                            ? groupPotentialToDate.advancers
                            : item.label === "Winner bonus"
                              ? groupPotentialToDate.winnerBonus
                              : item.label === "Knockout"
                                ? knockoutPotentialToDate
                                : 0;
                          const showProgress = item.label === "Advancers" || item.label === "Winner bonus" || item.label === "Knockout";

                          return (
                            <div key={`${person.code}-${item.label}`}>
                              <span>{item.label}</span>
                              <strong>{item.label === "Champion" ? "TBD" : item.value}</strong>
                              {showProgress && (
                                <small>
                                  {formatScoreProgress(item.value, potential)}
                                  <br />
                                  {formatCorrectPercent(item.value, potential)}
                                </small>
                              )}
                              {item.label === "Champion" && (
                                <small>
                                  <span className={championEliminated ? "champion-pick eliminated" : "champion-pick"}>
                                    {championPick || "No champion pick"}
                                  </span>
                                </small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
	                    <details className="pick-details">
	                      <summary>View {person.nickname}&apos;s picks</summary>
	                      <div className="pick-sheet">
	                        {pathToGlory && (
	                          <div className="path-mini">
	                            <div>
	                              <span>Path to Glory</span>
	                              <strong>{pathToGlory.rankLabel} · {pathToGlory.points} pts</strong>
	                              <p>{pathToGlory.status}</p>
	                            </div>
	                            <div>
	                              <span>Possible upside</span>
	                              <strong>+{pathToGlory.possibleUpside}</strong>
	                              <p>{pathToGlory.leverage}</p>
	                            </div>
	                            <div>
	                              <span>Champion</span>
	                              <strong className={pathToGlory.championEliminated ? "champion-pick eliminated" : "champion-pick"}>
	                                {pathToGlory.champion}
	                              </strong>
	                              <p>{pathToGlory.championEliminated ? "Eliminated" : "Alive"}</p>
	                            </div>
	                          </div>
	                        )}
	                        {personKnockoutRounds.map((round, roundIndex) => {
	                          const roundContent = round.picks ? (
	                            <>
	                              <div className="saved-pick-list round-result-list">
	                                {getRoundOf32PickRows(round.picks.matchWinners, round.matches, round.pointValue).map((pick) => (
	                                  <div
	                                    className={`round-result-row result-${pick.result}`}
	                                    key={`${person.code}-public-${round.stage}-${pick.id}`}
	                                  >
	                                    <span>{pick.label}{pick.schedule ? ` - ${pick.schedule}` : ""}</span>
	                                    <strong>{pick.winner || "No pick"}</strong>
	                                    <em>
	                                      {pick.result === "pending"
	                                        ? "Result pending"
	                                        : pick.result === "won"
	                                          ? `Won +${pick.points} point${pick.points === 1 ? "" : "s"}`
	                                          : `Lost 0 points${pick.actualWinner ? ` · winner: ${pick.actualWinner}` : ""}`}
	                                    </em>
	                                  </div>
	                                ))}
	                              </div>
	                              {round.picks.submittedAt && (
	                                <p className="saved-pick-note">
	                                  {round.label} submitted {new Date(round.picks.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
	                                </p>
	                              )}
	                            </>
	                          ) : (
	                            <div className="round-status-note">
	                              <strong>{round.submitted ? `${round.label} picks submitted.` : `No ${round.label} picks submitted yet.`}</strong>
	                              <p>
	                                {round.submitted
	                                  ? "They will appear here after John locks this round."
	                                  : "Nothing to show for this round yet."}
	                              </p>
	                            </div>
	                          );

	                          if (roundIndex > 0) {
	                            return (
	                              <details className="group-stage-details round-history-details" key={`${person.code}-public-${round.stage}`}>
	                                <summary>
	                                  <span>{round.label}</span>
	                                  <strong>{round.picks ? "View picks" : round.submitted ? "Submitted" : "No picks"}</strong>
	                                </summary>
	                                {roundContent}
	                              </details>
	                            );
	                          }

	                          return (
	                            <div className="round-pick-section current-pick-section" key={`${person.code}-public-${round.stage}`}>
	                              <h4>{round.label}</h4>
	                              {roundContent}
	                            </div>
	                          );
	                        })}
	                        {person.visible && person.picks ? (
	                          <details className="group-stage-details pick-archive-details">
	                            <summary>
	                              <span>Pick archive</span>
	                              <strong>Pre-tournament picks</strong>
	                            </summary>
	                            <div className="saved-grid">
	                              <div>
	                                <span>Champion</span>
	                                <strong>
	                                  <span className={championEliminated ? "champion-pick eliminated" : "champion-pick"}>
	                                    {person.picks.champion}
	                                  </span>
	                                </strong>
	                              </div>
	                              <div>
	                                <span>Golden Boot</span>
	                                <strong>
	                                  {person.picks.goldenBoot}
	                                  <span className="golden-boot-status">
	                                    ({getGoldenBootStatus(person.picks.goldenBoot, goldenBootRows)})
	                                  </span>
	                                </strong>
	                              </div>
	                            </div>
	                            <details className="group-stage-details">
	                              <summary>
	                                <span>Group stage</span>
	                                <strong>{groupStagePoints} pts</strong>
                              </summary>
                              <div className="group-stage-rollup" aria-label={`${person.nickname} group stage rollup`}>
                                <div>
                                  <span>Advancers</span>
                                  <strong>{groupAdvancerPoints}</strong>
                                </div>
                                <div>
                                  <span>Winner bonus</span>
                                  <strong>{groupWinnerBonusPoints}</strong>
                                </div>
                                <div>
                                  <span>Picks shown</span>
                                  <strong>{scoredGroupPickCount}/24</strong>
                                </div>
                              </div>
                              <h4 className="pick-section-title">All group-stage picks</h4>
                              <div className="review-groups">
                                {groups.map((group) => (
                                  <div key={`${person.code}-${group}`}>
                                    <span>Group {group}</span>
                                    <strong className="group-pick-score-line">
                                      <span className="pick-country">{person.picks?.groupWinners?.[group] || "No winner"}</span>
                                      <span className="pick-score">({person.groupPickScores?.[group]?.winner ?? 0})</span>
                                      <span className="pick-label">winner</span>
                                    </strong>
                                    <strong className="group-pick-score-line">
                                      <span className="pick-country">{person.picks?.groupRunnersUp?.[group] || "No runner-up"}</span>
                                      <span className="pick-score">({person.groupPickScores?.[group]?.runnerUp ?? 0})</span>
                                      <span className="pick-label">runner-up</span>
                                    </strong>
                                  </div>
	                                ))}
	                              </div>
	                            </details>
	                          </details>
	                        ) : (
	                          <div className="round-status-note">
	                            <strong>{person.submitted ? "Pre-tournament picks hidden." : "No pre-tournament picks submitted."}</strong>
	                            <p>{person.submitted ? "They will appear here after John locks that round." : "Nothing to show yet."}</p>
	                          </div>
	                        )}
	                      </div>
	                    </details>
                  </article>
                );
              });
            })()}
          </div>
        </section>
      )}

      {tab === "rules" && (
        <section className="screen stack" aria-labelledby="rules-title">
          <ScreenHeader
            kicker="Pool rules"
            title="How scoring works"
            note="Plain-English rules, built for quick checks during the tournament."
          />
          <div className="rules-grid">
            {[
              { label: "Entry", value: "$10", note: "Winner takes all. No second place unless we decide otherwise." },
              { label: "Champion", value: "6 pts", note: "Pre-tournament champion pick. You can still pick a different team later." },
              { label: "Group advancers", value: "1 pt each", note: "Each picked team that finishes top two earns 1 point, no matter which slot you used." },
              { label: "Group winner bonus", value: "+1 pt", note: "Earned when your winner pick actually wins the group." },
              { label: "Round of 32", value: "1 pt", note: "One point for each correct match winner." },
              { label: "Round of 16", value: "2 pts", note: "Escalating value once the bracket gets serious." },
              { label: "Quarterfinals", value: "3 pts", note: "Correct picks become more valuable each round." },
              { label: "Semis / Final", value: "4 / 5 pts", note: "Four for each semifinal, five for the final." }
            ].map((rule) => (
              <article className="rule-card" key={rule.label}>
                <span>{rule.label}</span>
                <strong>{rule.value}</strong>
                <p>{rule.note}</p>
              </article>
            ))}
          </div>
          <div className="tiebreaker-card">
            <p className="eyebrow">Group-stage example</p>
            <p>A perfect group is worth 3 points. If you pick the correct two advancing teams but flip winner and runner-up, you still earn 2 points.</p>
          </div>
          <div className="tiebreaker-card">
            <p className="eyebrow">Tiebreakers</p>
            <ol>
              <li>Correct Golden Boot pick</li>
              <li>Most correct picks across the whole tournament</li>
              <li>Split the pot if still tied</li>
            </ol>
          </div>
        </section>
      )}

      {tab === "payments" && (
        <section className="screen stack" aria-labelledby="payments-title">
          <ScreenHeader
            kicker="Venmo tracker"
            title="Who has paid?"
            note="Manual confirmation keeps Venmo private and simple."
          />
          <div className="payment-summary">
            <div>
              <strong>{paidCount}/{totalPlayers}</strong>
              <span>paid</span>
            </div>
            <div>
              <strong>${potTotal}</strong>
              <span>confirmed pot</span>
            </div>
          </div>
          <div className="payment-list">
            {visibleRoster.map((person) => (
              <article className="payment-row" key={person.code}>
                <div>
                  <h3>{person.nickname}</h3>
                </div>
                {person.venmoPaid ? (
                  <span className="paid-pill">Paid</span>
                ) : (
                  <a
                    className="unpaid-pill"
                    href="https://venmo.com/u/moneymammal"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pay Now
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "pantheon" && (
        <section className="screen stack" aria-labelledby="pantheon-title">
          <ScreenHeader
            kicker="Poolarama Pantheon"
            title="Previous champions"
            note="Men’s World Cup, Women’s World Cup, Euros, and future family glory."
          />
          <div className="pantheon-grid">
            {pantheon.map((item) => (
              <article className="pantheon-card" key={`${item.year}-${item.tournament}`}>
                <span>{item.year}</span>
                <h3>{item.tournament}</h3>
                <strong>{item.champion}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "tables" && (
        <section className="screen stack" aria-labelledby="tables-title">
          <ScreenHeader
            kicker="Pool stats"
            title="Stats"
            note="Sortable round-by-round scoring, Golden Boot status, and archived group tables."
          />
          <PlayerStatsTable
            rows={sortedPlayerStatsRows}
            sort={statsSort}
            onSort={handleStatsSort}
          />
          <GoldenBootTable rows={goldenBootRows} feedback={goldenBootFeedback} />
          <details className="group-stage-details stats-archive-details">
            <summary>
              <span>Group-stage archive</span>
              <strong>Group tables</strong>
            </summary>
            <GroupStandingsDisplay rows={groupStandingsRows} />
          </details>
        </section>
      )}

      {adminEnabled && tab === "admin" && (
        <section className="screen stack" aria-labelledby="admin-title">
          <ScreenHeader
            kicker="Admin dashboard"
            title={`${adminCurrentRound.label} control room`}
            note={adminCurrentRoundAction}
          />
          <section className="admin-focus-card admin-current-task-card admin-round-current" aria-label="Current admin task">
            <div className="admin-focus-heading">
              <div>
                <p className="eyebrow">Current admin task</p>
                <h3>{adminCurrentRound.label}: {adminCurrentRoundStatusLabel}</h3>
                <p>{adminCurrentRoundAction}</p>
              </div>
              <span>{adminCurrentRound.status}</span>
            </div>
            <div className="admin-focus-grid">
              <div>
                <span>Submitted</span>
                <strong>{adminCurrentRoundStats.submitted}/{adminCurrentRoundStats.total}</strong>
              </div>
              <div>
                <span>Matchups</span>
                <strong>
                  {adminCurrentRoundStats.expectedMatches > 0
                    ? `${adminCurrentRoundStats.matchCount}/${adminCurrentRoundStats.expectedMatches}`
                    : "Not started"}
                </strong>
              </div>
              <div>
                <span>Scored</span>
                <strong>
                  {adminCurrentRoundStats.expectedMatches > 0
                    ? `${adminCurrentRoundStats.scored}/${adminCurrentRoundStats.expectedMatches}`
                    : "0/0"}
                </strong>
              </div>
              <div>
                <span>Opened</span>
                <strong>{formatAdminTimestamp(adminCurrentRoundStats.openedAt)}</strong>
              </div>
            </div>
            <div className="admin-focus-actions">
              <p>{adminFeedback}</p>
              <button className="admin-action compact" type="button" onClick={handleExportPicks}>
                Export CSV
              </button>
            </div>
          </section>
          <details className="admin-rollup-card round-health-card admin-support-card archived-admin-card">
            <summary>
              <span>Pool health</span>
              <strong>Full status snapshot</strong>
            </summary>
            <div className="admin-sync-status">
              <div>
                <span>Participants</span>
                <strong>{adminOverview.length}/{adminOverview.length}</strong>
                <em>active roster</em>
              </div>
              <div>
                <span>Group picks</span>
                <strong>{adminSubmittedCount}/{adminOverview.length}</strong>
                <em>{poolState.preTournament.status}</em>
              </div>
              <div>
                <span>R32 picks</span>
                <strong>{adminR32SubmittedCount}/{adminOverview.length}</strong>
                <em>{poolState.r32.status}</em>
              </div>
              <div>
                <span>R32 matches</span>
                <strong>{r32Matches.length}/16</strong>
                <em>{r32ScoredCount}/16 scored</em>
              </div>
              <div>
                <span>R16</span>
                <strong>{poolState.r16.status}</strong>
                <em>{r16Matches.length}/8 matches</em>
              </div>
              <div>
                <span>Quarterfinals</span>
                <strong>{poolState.qf.status}</strong>
                <em>{qfMatches.length}/4 matches</em>
              </div>
            </div>
          </details>
          <details
            className={`r32-admin-card archived-admin-card ${r16CanPreview || r16Started ? "admin-round-archive" : "admin-current-round-card admin-round-current"}`}
            open={!(r16CanPreview || r16Started)}
          >
            <summary>
              <span>{r16CanPreview || r16Started ? "Previous round" : "Current scoring round"}</span>
              <strong>Round of 32 controls</strong>
            </summary>
            <div className="section-title-row">
              <div>
                <p className="eyebrow">{r16CanPreview || r16Started ? "Previous round" : "Current scoring round"}</p>
                <h3 id="r32-admin-title">Score Round of 32 winners</h3>
                <p>
                  R32 picks are locked. Use these controls only to sync or set winners for completed R32 matches.
                </p>
              </div>
              <div className="admin-toolbar-actions compact-actions">
                <button
                  className="admin-action compact"
                  type="button"
                  onClick={() => handleRoundOf32AdminAction("generate")}
                  disabled={poolState.r32.status !== "setup"}
                >
                  Generate R32 preview
                </button>
                <button
                  className="admin-action compact"
                  type="button"
                  onClick={() => handleRoundOf32AdminAction("open")}
                  disabled={poolState.r32.status !== "setup" || !r32PreviewReady || r32Matches.length !== 16}
                >
                  Confirm and open R32
                </button>
                <button
                  className="admin-action compact quiet"
                  type="button"
                  onClick={() => handleRoundOf32AdminAction("lock")}
                  disabled={!r32Open}
                >
                  Lock R32 picks
                </button>
                <button
                  className="admin-action compact"
                  type="button"
                  onClick={handleSyncRoundOf32Winners}
                  disabled={!r32Locked}
                >
                  Sync completed R32 winners
                </button>
              </div>
            </div>
            <div className="admin-sync-status" aria-label="Round of 32 status">
              <div>
                <span>Status</span>
                <strong>{poolState.r32.status}</strong>
              </div>
              <div>
                <span>Matchups</span>
                <strong>{r32Matches.length}/16{r32PreviewReady ? " preview" : ""}</strong>
              </div>
              <div>
                <span>Submitted</span>
                <strong>{adminR32SubmittedCount}/{adminOverview.length}</strong>
              </div>
              <div>
                <span>Opened</span>
                <strong>{formatAdminTimestamp(poolState.r32.openedAt)}</strong>
              </div>
            </div>
            {r32Matches.length > 0 ? (
              <div className="r32-preview-grid">
                {r32Matches.map((match) => (
                  <div key={`admin-preview-${match.matchId}`}>
                    <span>{match.label}</span>
                    {formatKnockoutSchedule(match.label) && (
                      <em className="admin-match-schedule">{formatKnockoutSchedule(match.label)}</em>
                    )}
                    <strong>{match.teamA}</strong>
                    <strong>{match.teamB}</strong>
                    {match.winner && <em className="r32-result-winner">Winner: {match.winner}</em>}
                    {poolState.r32.status === "locked" && (
                      <div className="r32-result-actions">
                        {[match.teamA, match.teamB].map((teamName) => (
                          <button
                            className={`admin-action compact ${match.winner === teamName ? "" : "quiet"}`}
                            type="button"
                            key={`${match.matchId}-${teamName}`}
                            onClick={() => handleRoundOf32Winner(match.matchId, teamName)}
                          >
                            {match.winner === teamName ? "Winner" : `Set R32 winner: ${teamName}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-note">No Round of 32 preview has been generated yet.</p>
            )}
          </details>
          <details
            className={`admin-rollup-card next-round-rollup archived-admin-card ${qfCanPreview || qfStarted ? "admin-round-archive" : r16CanPreview || r16Started ? "admin-current-round-card admin-round-current" : "admin-round-next"}`}
            open={Boolean((r16CanPreview || r16Started) && !(qfCanPreview || qfStarted))}
          >
            <summary>
              <span>{qfCanPreview || qfStarted ? "Previous round" : r16CanPreview || r16Started ? "Current round" : "Future round - no action yet"}</span>
              <strong>{r16Started ? "Round of 16 controls" : "Round of 16 readiness"}</strong>
            </summary>
            <div className="next-round-status">
              <div>
                <strong>{r32ScoredCount}/16</strong>
                <span>R32 winners scored</span>
              </div>
              <p>
                {r32ScoredCount === 16
                  ? "Round of 16 preview can be generated and reviewed."
                  : "Round of 16 controls stay disabled until every Round of 32 winner is scored."}
              </p>
            </div>
            <div className="admin-toolbar-actions compact-actions">
              <button
                className="admin-action compact"
                type="button"
                onClick={() => handleRoundOf16AdminAction("generate")}
                disabled={poolState.r16.status !== "setup" || !r16CanPreview}
              >
                Generate R16 preview
              </button>
              <button
                className="admin-action compact"
                type="button"
                onClick={() => handleRoundOf16AdminAction("open")}
                disabled={poolState.r16.status !== "setup" || !r16PreviewReady || r16Matches.length !== 8}
              >
                Confirm and open R16
              </button>
              <button
                className="admin-action compact quiet"
                type="button"
                onClick={() => handleRoundOf16AdminAction("lock")}
                disabled={!r16Open}
              >
                Lock R16 picks
              </button>
              <button
                className="admin-action compact"
                type="button"
                onClick={handleSyncRoundOf16Winners}
                disabled={!r16Locked}
              >
                Sync completed R16 winners
              </button>
            </div>
            <div className="admin-sync-status" aria-label="Round of 16 status">
              <div>
                <span>Status</span>
                <strong>{poolState.r16.status}</strong>
              </div>
              <div>
                <span>Matchups</span>
                <strong>{r16Matches.length}/8{r16PreviewReady ? " preview" : ""}</strong>
              </div>
              <div>
                <span>Submitted</span>
                <strong>{adminR16SubmittedCount}/{adminOverview.length}</strong>
              </div>
              <div>
                <span>Scored</span>
                <strong>{r16ScoredCount}/8</strong>
              </div>
            </div>
            {r16Matches.length > 0 ? (
              <div className="r32-preview-grid">
                {r16Matches.map((match) => (
                  <div key={`admin-r16-preview-${match.matchId}`}>
                    <span>{match.label}</span>
                    {formatKnockoutSchedule(match.label) && (
                      <em className="admin-match-schedule">{formatKnockoutSchedule(match.label)}</em>
                    )}
                    <strong>{match.teamA}</strong>
                    <strong>{match.teamB}</strong>
                    {match.winner && <em className="r32-result-winner">Winner: {match.winner}</em>}
                    {poolState.r16.status === "locked" && (
                      <div className="r32-result-actions">
                        {[match.teamA, match.teamB].map((teamName) => (
                          <button
                            className={`admin-action compact ${match.winner === teamName ? "" : "quiet"}`}
                            type="button"
                            key={`${match.matchId}-${teamName}`}
                            onClick={() => handleRoundOf16Winner(match.matchId, teamName)}
                          >
                            {match.winner === teamName ? "Winner" : `Set R16 winner: ${teamName}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-note">
                {r16CanPreview ? "No Round of 16 preview has been generated yet." : "Round of 16 preview is waiting on the remaining R32 winners."}
              </p>
            )}
          </details>
          <details
            className={`admin-rollup-card next-round-rollup archived-admin-card ${qfCanPreview || qfStarted ? "admin-current-round-card admin-round-current" : "admin-round-next"}`}
            open={qfCanPreview || qfStarted}
          >
            <summary>
              <span>{qfCanPreview || qfStarted ? "Current round" : "Future round - no action yet"}</span>
              <strong>{qfStarted ? "Quarterfinal controls" : "Quarterfinal readiness"}</strong>
            </summary>
            <div className="next-round-status">
              <div>
                <strong>{r16ScoredCount}/8</strong>
                <span>R16 winners scored</span>
              </div>
              <p>
                {qfCanPreview
                  ? "Quarterfinal preview can be generated and reviewed."
                  : "Quarterfinal controls stay disabled until every Round of 16 winner is scored."}
              </p>
            </div>
            <div className="admin-toolbar-actions compact-actions">
              <button
                className="admin-action compact"
                type="button"
                onClick={() => handleQuarterfinalAdminAction("generate")}
                disabled={poolState.qf.status !== "setup" || !qfCanPreview}
              >
                Generate QF preview
              </button>
              <button
                className="admin-action compact"
                type="button"
                onClick={() => handleQuarterfinalAdminAction("open")}
                disabled={poolState.qf.status !== "setup" || !qfPreviewReady || qfMatches.length !== 4}
              >
                Confirm and open QF
              </button>
              <button
                className="admin-action compact quiet"
                type="button"
                onClick={() => handleQuarterfinalAdminAction("lock")}
                disabled={!qfOpen}
              >
                Lock QF picks
              </button>
              <button
                className="admin-action compact"
                type="button"
                onClick={handleSyncQuarterfinalWinners}
                disabled={!qfLocked}
              >
                Sync completed QF winners
              </button>
            </div>
            <div className="admin-sync-status" aria-label="Quarterfinal status">
              <div>
                <span>Status</span>
                <strong>{poolState.qf.status}</strong>
              </div>
              <div>
                <span>Matchups</span>
                <strong>{qfMatches.length}/4{qfPreviewReady ? " preview" : ""}</strong>
              </div>
              <div>
                <span>Scored</span>
                <strong>{qfScoredCount}/4</strong>
              </div>
              <div>
                <span>Opened</span>
                <strong>{formatAdminTimestamp(poolState.qf.openedAt)}</strong>
              </div>
            </div>
            {qfMatches.length > 0 ? (
              <div className="r32-preview-grid">
                {qfMatches.map((match) => (
                  <div key={`admin-qf-preview-${match.matchId}`}>
                    <span>{match.label}</span>
                    {formatKnockoutSchedule(match.label) && (
                      <em className="admin-match-schedule">{formatKnockoutSchedule(match.label)}</em>
                    )}
                    <strong>{match.teamA}</strong>
                    <strong>{match.teamB}</strong>
                    {match.winner && <em className="r32-result-winner">Winner: {match.winner}</em>}
                    {poolState.qf.status === "locked" && (
                      <div className="r32-result-actions">
                        {[match.teamA, match.teamB].map((teamName) => (
                          <button
                            className={`admin-action compact ${match.winner === teamName ? "" : "quiet"}`}
                            type="button"
                            key={`${match.matchId}-${teamName}`}
                            onClick={() => handleQuarterfinalWinner(match.matchId, teamName)}
                          >
                            {match.winner === teamName ? "Winner" : `Set QF winner: ${teamName}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-note">
                {qfCanPreview ? "No Quarterfinal preview has been generated yet." : "Quarterfinal preview is waiting on the remaining R16 winners."}
              </p>
            )}
          </details>
          <details className="admin-rollup-card golden-rollup archived-admin-card">
            <summary>
              <span>Golden Boot</span>
              <strong>Top scorers</strong>
            </summary>
            <GoldenBootTable rows={goldenBootRows} feedback={goldenBootFeedback} />
          </details>
          <details className="admin-rollup-card people-rollup archived-admin-card">
            <summary>
              <span>Players and payments</span>
              <strong>Participant controls</strong>
            </summary>
            <div className="admin-list">
              {adminOverview.map((participant) => {
                const isSeededParticipant = knownParticipants.some((knownParticipant) => knownParticipant.code === participant.code);

                return (
                  <article className="admin-row" key={participant.code}>
                    <div className="admin-person">
                      <h3>{participant.nickname}</h3>
                      <p>{participant.name}</p>
                    </div>
                    <div className="admin-statuses">
                      <span className={participant.venmoPaid ? "status-pill paid" : "status-pill unpaid"}>
                        {participant.venmoPaid ? "Paid" : "Unpaid"}
                      </span>
                      <span className={participant.submitted ? "status-pill submitted" : "status-pill missing"}>
                        {participant.submitted ? "Group submitted" : "Group missing"}
                      </span>
                      {poolState.r32.status !== "setup" && (
                        <span className={participant.r32Submitted ? "status-pill submitted" : "status-pill missing"}>
                          {participant.r32Submitted ? "R32 submitted" : "R32 missing"}
                        </span>
                      )}
                      {poolState.r16.status !== "setup" && (
                        <span className={participant.r16Submitted ? "status-pill submitted" : "status-pill missing"}>
                          {participant.r16Submitted ? "R16 submitted" : "R16 missing"}
                        </span>
                      )}
                      {poolState.qf.status !== "setup" && (
                        <span className={participant.qfSubmitted ? "status-pill submitted" : "status-pill missing"}>
                          {participant.qfSubmitted ? "QF submitted" : "QF missing"}
                        </span>
                      )}
                    </div>
                    <div className="admin-pick-summary">
                      <span>Group: {participant.submittedAt ? new Date(participant.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not submitted yet"}</span>
                      {poolState.r32.status !== "setup" && (
                        <span>R32: {participant.r32SubmittedAt ? new Date(participant.r32SubmittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not submitted yet"}</span>
                      )}
                      {poolState.r16.status !== "setup" && (
                        <span>R16: {participant.r16SubmittedAt ? new Date(participant.r16SubmittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not submitted yet"}</span>
                      )}
                      {poolState.qf.status !== "setup" && (
                        <span>QF: {participant.qfSubmittedAt ? new Date(participant.qfSubmittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not submitted yet"}</span>
                      )}
                      <strong>
                        {participant.champion
                          ? `${participant.champion} / ${participant.goldenBoot}`
                          : participant.submitted
                            ? "Picks hidden until locked"
                            : "No picks on file"}
                      </strong>
                      <em>{participant.inviteCode ? "Private invite ready" : "Basic invite"}</em>
                    </div>
                    <div className="admin-row-actions">
                      <button className="admin-action compact" type="button" onClick={() => handleCopyInvite(participant)}>
                        Copy link
                      </button>
                      <button className="admin-action compact quiet" type="button" onClick={() => handleCopyReminder(participant)}>
                        Copy reminder
                      </button>
                      <details className="advanced-row-actions">
                        <summary>Advanced</summary>
                        <button
                          className={`admin-action compact payment-toggle ${participant.venmoPaid ? "quiet" : ""}`}
                          type="button"
                          onClick={() => handleTogglePayment(participant)}
                        >
                          {participant.venmoPaid ? "Mark unpaid" : "Mark paid"}
                        </button>
                        {!isSeededParticipant && (
                          <button
                            className={`admin-action compact danger ${pendingDeleteCode === participant.code ? "confirm" : ""}`}
                            type="button"
                            onClick={() => handleDeleteParticipant(participant)}
                          >
                            {pendingDeleteCode === participant.code ? "Confirm delete" : "Delete"}
                          </button>
                        )}
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
          <details className="daily-review-card archived-admin-card">
            <summary>
              <span>Current round</span>
              <strong>Pool analysis</strong>
            </summary>
            <div className="daily-review-heading">
              <div>
                <p className="eyebrow">Current pool analysis</p>
                <h3 id="daily-review-title">{dailyReview.headline}</h3>
                <p>{dailyReview.updatedLabel}</p>
              </div>
              <span>Not public</span>
            </div>
            {dailyReview.dek && <p className="daily-review-dek">{dailyReview.dek}</p>}
            <div className="daily-review-list">
              {dailyReview.bullets.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {dailyReview.archiveBullets.length > 0 && (
              <details className="insight-archive">
                <summary>
                  <span>Historical context</span>
                  <strong>Group stage recap</strong>
                </summary>
                <div className="daily-review-list archive-list">
                  {dailyReview.archiveBullets.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </details>
            )}
            {dailyReview.kicker && <p className="daily-review-kicker">{dailyReview.kicker}</p>}
          </details>
          <details className="admin-rollup-card utility-rollup archived-admin-card">
            <summary>
              <span>Utilities</span>
              <strong>Maintenance</strong>
            </summary>
            <p>Use these for refreshes and non-destructive admin upkeep.</p>
            <div className="admin-maintenance-actions">
              <button className="admin-action compact" type="button" onClick={loadAdminOverview}>
                Refresh participants
              </button>
              <button
                className={`admin-action compact ${preTournamentLocked ? "quiet" : ""}`}
                type="button"
                onClick={handleTogglePreTournamentLock}
              >
                {preTournamentLocked ? "Unlock picks" : "Lock picks"}
              </button>
              <button className="admin-action compact" type="button" onClick={handleSeedParticipants}>
                Seed participants
              </button>
            </div>
          </details>
          <details className="invite-card archived-admin-card">
            <summary>
              <span>Roster tools</span>
              <strong>Add a player</strong>
            </summary>
            <div>
              <p className="eyebrow">Invites</p>
              <h3 id="invite-title">Add a player</h3>
              <p>New players get private invite links that are harder to guess than their names.</p>
            </div>
            <form className="invite-form" onSubmit={handleAddParticipant}>
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={newParticipantName}
                  onChange={(event) => setNewParticipantName(event.target.value)}
                  placeholder="Full name"
                  maxLength={80}
                />
              </label>
              <label>
                <span>Pool name</span>
                <input
                  type="text"
                  value={newParticipantNickname}
                  onChange={(event) => setNewParticipantNickname(event.target.value)}
                  placeholder="Nickname"
                  maxLength={80}
                />
              </label>
              <button className="admin-action compact" type="submit">
                Add player
              </button>
            </form>
          </details>
          <details className="group-standings-admin archived-admin-card">
            <summary>
              <span>Group-stage archive</span>
              <strong>Live group tables</strong>
            </summary>
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Live group tables</p>
                <h3 id="group-standings-admin-title">Update group standings</h3>
                <p>Sync from live match data, or adjust ranks and table stats manually whenever you want.</p>
              </div>
              <div className="admin-toolbar-actions compact-actions">
                <button className="admin-action compact" type="button" onClick={handleSyncGroupStandings}>
                  Sync live tables
                </button>
                <button className="admin-action compact quiet" type="button" onClick={handleSaveGroupStandings}>
                  Save tables
                </button>
              </div>
            </div>
            <div className="group-standings-grid">
              {groups.map((group) => (
                <article className="group-standing-panel" key={`admin-group-${group}`}>
                  <h4>Group {group}</h4>
                  {groupStandingsRows
                    .filter((row) => row.group === group)
                    .sort((a, b) => a.rank - b.rank)
                    .map((row) => {
                      const team = teams.find((item) => item.name === row.team) || {
                        name: row.team,
                        code: row.team.slice(0, 3).toUpperCase()
                      };

                      return (
                        <div className="group-standing-row" key={row.team}>
                          <strong title={team.name}>{getTableTeamDisplayName(team)}</strong>
                          <label>
                            <span>Rank</span>
                            <input type="number" min="1" max="4" value={row.rank} onChange={(event) => updateGroupStanding(row.team, "rank", event.target.value)} />
                          </label>
                          <label>
                            <span>Pts</span>
                            <input type="number" min="0" value={row.points} onChange={(event) => updateGroupStanding(row.team, "points", event.target.value)} />
                          </label>
                          <label>
                            <span>GF</span>
                            <input type="number" min="0" value={row.goalsFor} onChange={(event) => updateGroupStanding(row.team, "goalsFor", event.target.value)} />
                          </label>
                          <label>
                            <span>GD</span>
                            <input type="number" value={row.goalDifference} onChange={(event) => updateGroupStanding(row.team, "goalDifference", event.target.value)} />
                          </label>
                        </div>
                      );
                    })}
                </article>
              ))}
            </div>
          </details>
          <details className="danger-zone-card archived-admin-card">
            <summary>
              <span>Danger Zone</span>
              <strong>Reset tools</strong>
            </summary>
            <p>These actions can remove submitted picks or generated matchups. Each action requires a typed confirmation.</p>
            <div className="admin-maintenance-actions">
              <button
                className="admin-action compact danger"
                type="button"
                onClick={() => handleRoundOf32AdminAction("reset")}
                disabled={poolState.r32.status === "setup" && r32Matches.length === 0}
              >
                Reset R32
              </button>
              <button className="admin-action compact danger" type="button" onClick={handleClearSubmissions}>
                Clear group picks
              </button>
            </div>
          </details>
        </section>
      )}
    </main>
  );
}

function PlayerStatsTable({
  rows,
  sort,
  onSort
}: {
  rows: PlayerStatsRow[];
  sort: { key: StatsSortKey; direction: "asc" | "desc" };
  onSort: (key: StatsSortKey) => void;
}) {
  const sortMark = (key: StatsSortKey) => (sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : "");

  return (
    <section className="player-stats-card" aria-labelledby="player-stats-title">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Sortable stats</p>
          <h3 id="player-stats-title">All player scoring</h3>
          <p>Scroll sideways for every round. Tap a column heading to sort.</p>
        </div>
      </div>
      <div className="player-stats-scroll" role="region" aria-label="Sortable player stats table" tabIndex={0}>
        <table className="player-stats-table">
          <thead>
            <tr>
              <th className="sticky-stat-col">
                <button type="button" onClick={() => onSort("player")}>Player{sortMark("player")}</button>
              </th>
              <th><button type="button" onClick={() => onSort("rank")}>Rank{sortMark("rank")}</button></th>
              <th><button type="button" onClick={() => onSort("total")}>Total{sortMark("total")}</button></th>
              <th><button type="button" onClick={() => onSort("group")}>Group{sortMark("group")}</button></th>
              <th><button type="button" onClick={() => onSort("advancers")}>Adv{sortMark("advancers")}</button></th>
              <th><button type="button" onClick={() => onSort("winnerBonus")}>Bonus{sortMark("winnerBonus")}</button></th>
              <th><button type="button" onClick={() => onSort("knockout")}>KO{sortMark("knockout")}</button></th>
              <th><button type="button" onClick={() => onSort("r32")}>R32{sortMark("r32")}</button></th>
              <th><button type="button" onClick={() => onSort("r16")}>R16{sortMark("r16")}</button></th>
              <th><button type="button" onClick={() => onSort("qf")}>QF{sortMark("qf")}</button></th>
              <th>Champion</th>
              <th>Golden Boot</th>
              <th><button type="button" onClick={() => onSort("possibleUpside")}>Upside{sortMark("possibleUpside")}</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <th className="sticky-stat-col" scope="row">
                  <strong>{row.player}</strong>
                  <span>{row.name}</span>
                </th>
                <td>{row.rank}</td>
                <td className="stat-total">{row.total}</td>
                <td>{row.group}</td>
                <td>{row.advancers}</td>
                <td>{row.winnerBonus}</td>
                <td>{row.knockout}</td>
                <td>{row.r32}</td>
                <td>{row.r16}</td>
                <td>{row.qf}</td>
                <td>
                  <span className={row.championEliminated ? "champion-pick eliminated" : "champion-pick"}>
                    {row.champion}
                  </span>
                </td>
                <td>
                  <span>{row.goldenBoot}</span>
                  <em>{row.goldenBootStatus}</em>
                </td>
                <td className="stat-upside">+{row.possibleUpside}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupStandingsDisplay({ rows }: { rows: GroupStandingRow[] }) {
  return (
    <div className="group-standings-grid public-tables-grid">
      {groups.map((group) => (
        <article className="group-standing-panel public-table-panel" key={`public-group-${group}`}>
          <h4>Group {group}</h4>
          <div className="public-table-header" aria-hidden="true">
            <span>Team</span>
            <span>GP</span>
            <span>GD</span>
            <span>GF</span>
            <span>Pts</span>
          </div>
          {rows
            .filter((row) => row.group === group)
            .sort((a, b) => a.rank - b.rank)
            .map((row) => {
              const team = teams.find((item) => item.name === row.team) || {
                name: row.team,
                code: row.team.slice(0, 3).toUpperCase(),
                flag: ""
              };
              const goalDifference = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);

              return (
                <div className="public-table-row" key={`${group}-${row.team}`}>
                  <strong>
                    <span>{row.rank}</span>
                    {team.flag && <em aria-hidden="true">{team.flag}</em>}
                    <b title={team.name}>{getTableTeamDisplayName(team)}</b>
                  </strong>
                  <span>{row.played}</span>
                  <span className={row.goalDifference > 0 ? "positive-gd" : row.goalDifference < 0 ? "negative-gd" : ""}>
                    {goalDifference}
                  </span>
                  <span>{row.goalsFor}</span>
                  <span>{row.points}</span>
                </div>
              );
            })}
        </article>
      ))}
    </div>
  );
}

function GoldenBootTable({ rows, feedback }: { rows: GoldenBootRow[]; feedback: string }) {
  return (
    <section className="golden-boot-table-card" aria-labelledby="golden-boot-table-title">
      <div>
        <p className="eyebrow">Golden Boot</p>
        <h3 id="golden-boot-table-title">Top scorers</h3>
        <p>{feedback}</p>
      </div>
      <div className="golden-boot-table">
        <div className="golden-boot-table-header" aria-hidden="true">
          <span>Player</span>
          <span>Team</span>
          <span>Goals</span>
        </div>
        {(rows.length > 0 ? rows.slice(0, 15) : []).map((row) => (
          <div className="golden-boot-table-row" key={`${row.normalizedPlayer}-${row.countryCode}`}>
            <strong>
              <span>{row.tied ? `T-${row.rank}` : row.rank}</span>
              {row.player}
            </strong>
            <em>{row.countryCode || row.country}</em>
            <span>{row.goals}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="golden-boot-empty">No scorers available yet.</div>
        )}
      </div>
    </section>
  );
}

function TabButton({
  label,
  tabName,
  activeTab,
  onSelect
}: {
  label: string;
  tabName: Tab;
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <button
      className={activeTab === tabName ? "active" : ""}
      type="button"
      onClick={() => onSelect(tabName)}
    >
      {label}
    </button>
  );
}

function ScreenHeader({ kicker, title, note }: { kicker: string; title: string; note: string }) {
  return (
    <header className="screen-header">
      <p className="eyebrow">{kicker}</p>
      <h2>{title}</h2>
      <p>{note}</p>
    </header>
  );
}
