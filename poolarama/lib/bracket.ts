import { groups, teams, type GroupId } from "@/lib/tournament-data";

export type GroupStandingInput = {
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

export type GeneratedMatch = {
  matchId: string;
  label: string;
  teamA: string;
  teamB: string;
  order: number;
};

export type KnockoutSourceMatch = {
  matchId: string;
  label?: string;
  teamA: string;
  teamB: string;
  winner?: string | null;
  order: number;
};

type QualifiedGroupRank = "winner" | "runnerUp" | "third";

type ThirdPlaceAssignment = {
  oneA: GroupId;
  oneB: GroupId;
  oneD: GroupId;
  oneE: GroupId;
  oneG: GroupId;
  oneI: GroupId;
  oneK: GroupId;
  oneL: GroupId;
};

type MatchSlot =
  | { matchNumber: number; sideA: [GroupId, QualifiedGroupRank]; sideB: [GroupId, QualifiedGroupRank] }
  | { matchNumber: number; sideA: [GroupId, QualifiedGroupRank]; sideBThirdFor: keyof ThirdPlaceAssignment };

const thirdPlaceAssignments: Record<string, ThirdPlaceAssignment> = {
  "BDEF IJKL": { oneA: "E", oneB: "J", oneD: "B", oneE: "D", oneG: "I", oneI: "F", oneK: "L", oneL: "K" },
  "BDEF GIKL": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "I", oneI: "F", oneK: "L", oneL: "K" },
  "BDEF GIJL": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "J", oneI: "F", oneK: "L", oneL: "I" },
  "BDEF GIJK": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "J", oneI: "F", oneK: "I", oneL: "K" },
  "ABDE FGIL": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "A", oneI: "F", oneK: "L", oneL: "I" },
  "ABDE FGIK": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "A", oneI: "F", oneK: "I", oneL: "K" },
  "ABDE FGIJ": { oneA: "E", oneB: "G", oneD: "B", oneE: "D", oneG: "A", oneI: "F", oneK: "I", oneL: "J" },
  "ABCD EFGI": { oneA: "C", oneB: "G", oneD: "B", oneE: "D", oneG: "A", oneI: "F", oneK: "E", oneL: "I" }
};

const roundOf32Slots: MatchSlot[] = [
  { matchNumber: 73, sideA: ["A", "runnerUp"], sideB: ["B", "runnerUp"] },
  { matchNumber: 74, sideA: ["E", "winner"], sideBThirdFor: "oneE" },
  { matchNumber: 75, sideA: ["F", "winner"], sideB: ["C", "runnerUp"] },
  { matchNumber: 76, sideA: ["C", "winner"], sideB: ["F", "runnerUp"] },
  { matchNumber: 77, sideA: ["I", "winner"], sideBThirdFor: "oneI" },
  { matchNumber: 78, sideA: ["E", "runnerUp"], sideB: ["I", "runnerUp"] },
  { matchNumber: 79, sideA: ["A", "winner"], sideBThirdFor: "oneA" },
  { matchNumber: 80, sideA: ["L", "winner"], sideBThirdFor: "oneL" },
  { matchNumber: 81, sideA: ["D", "winner"], sideBThirdFor: "oneD" },
  { matchNumber: 82, sideA: ["G", "winner"], sideBThirdFor: "oneG" },
  { matchNumber: 83, sideA: ["K", "runnerUp"], sideB: ["L", "runnerUp"] },
  { matchNumber: 84, sideA: ["H", "winner"], sideB: ["J", "runnerUp"] },
  { matchNumber: 85, sideA: ["B", "winner"], sideBThirdFor: "oneB" },
  { matchNumber: 86, sideA: ["J", "winner"], sideB: ["H", "runnerUp"] },
  { matchNumber: 87, sideA: ["K", "winner"], sideBThirdFor: "oneK" },
  { matchNumber: 88, sideA: ["D", "runnerUp"], sideB: ["G", "runnerUp"] }
];

function compareStandings(a: GroupStandingInput, b: GroupStandingInput) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.team.localeCompare(b.team)
  );
}

function compareGroupRanks(a: GroupStandingInput, b: GroupStandingInput) {
  const aHasPoints = a.points > 0;
  const bHasPoints = b.points > 0;

  if (aHasPoints !== bHasPoints) {
    return aHasPoints ? -1 : 1;
  }

  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.rank - b.rank ||
    a.team.localeCompare(b.team)
  );
}

export function getDefaultGroupStandings(): GroupStandingInput[] {
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

export function reconcileGroupStandings(savedStandings: GroupStandingInput[]) {
  const savedByTeam = new Map(savedStandings.map((standing) => [`${standing.group}:${standing.team}`, standing]));

  return rankGroupStandings(getDefaultGroupStandings().map((defaultStanding) => ({
    ...defaultStanding,
    ...savedByTeam.get(`${defaultStanding.group}:${defaultStanding.team}`)
  })));
}

export function rankGroupStandings(standings: GroupStandingInput[]) {
  return groups.flatMap((group) => {
    const groupRows = standings
      .filter((standing) => standing.group === group)
      .sort(compareGroupRanks);

    return groupRows.map((standing, index) => ({
      ...standing,
      rank: index + 1
    }));
  });
}

function thirdPlaceKey(groups: GroupId[]) {
  const sortedGroups = [...groups].sort();
  return `${sortedGroups.slice(0, 4).join("")} ${sortedGroups.slice(4).join("")}`;
}

function getQualifiedTeam(
  rowsByGroup: Map<GroupId, GroupStandingInput[]>,
  group: GroupId,
  rank: QualifiedGroupRank
) {
  const rankNumber = rank === "winner" ? 1 : rank === "runnerUp" ? 2 : 3;
  const team = rowsByGroup.get(group)?.find((standing) => standing.rank === rankNumber);

  if (!team) {
    throw new Error(`Missing ${rank} from Group ${group}.`);
  }

  return team;
}

export function generateRoundOf32Matches(standings: GroupStandingInput[]): GeneratedMatch[] {
  const rankedStandings = rankGroupStandings(standings);
  const thirdPlaceQualifiers = rankedStandings
    .filter((standing) => standing.rank === 3)
    .sort(compareStandings)
    .slice(0, 8);
  const thirdPlaceGroups = thirdPlaceQualifiers.map((standing) => standing.group);
  const assignment = thirdPlaceAssignments[thirdPlaceKey(thirdPlaceGroups)];
  const rowsByGroup = new Map(
    groups.map((group) => [
      group,
      rankedStandings.filter((standing) => standing.group === group)
    ])
  );

  if (!assignment) {
    throw new Error(`Unsupported Round of 32 third-place combination: ${thirdPlaceKey(thirdPlaceGroups)}.`);
  }

  return roundOf32Slots.map((slot, index) => {
    const teamA = getQualifiedTeam(rowsByGroup, slot.sideA[0], slot.sideA[1]);
    const teamB = "sideB" in slot
      ? getQualifiedTeam(rowsByGroup, slot.sideB[0], slot.sideB[1])
      : getQualifiedTeam(rowsByGroup, assignment[slot.sideBThirdFor], "third");

    return {
      matchId: `r32-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${slot.matchNumber}`,
      teamA: teamA.team,
      teamB: teamB.team,
      order: index + 1
    };
  });
}

export function generateRoundOf16Matches(roundOf32Matches: KnockoutSourceMatch[]): GeneratedMatch[] {
  const orderedMatches = [...roundOf32Matches].sort((a, b) => a.order - b.order);

  if (orderedMatches.length !== 16) {
    throw new Error(`Round of 16 preview requires 16 Round of 32 matches, found ${orderedMatches.length}.`);
  }

  const missingWinner = orderedMatches.find((match) => !match.winner);

  if (missingWinner) {
    throw new Error(`Round of 16 preview requires every Round of 32 winner. Missing ${missingWinner.label || missingWinner.matchId}.`);
  }

  return Array.from({ length: 8 }, (_, index) => {
    const firstMatch = orderedMatches[index * 2];
    const secondMatch = orderedMatches[index * 2 + 1];

    return {
      matchId: `r16-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${89 + index}`,
      teamA: firstMatch.winner || "",
      teamB: secondMatch.winner || "",
      order: index + 1
    };
  });
}

export function generateQuarterfinalMatches(roundOf16Matches: KnockoutSourceMatch[]): GeneratedMatch[] {
  const orderedMatches = [...roundOf16Matches].sort((a, b) => a.order - b.order);

  if (orderedMatches.length !== 8) {
    throw new Error(`Quarterfinal preview requires 8 Round of 16 matches, found ${orderedMatches.length}.`);
  }

  const missingWinner = orderedMatches.find((match) => !match.winner);

  if (missingWinner) {
    throw new Error(`Quarterfinal preview requires every Round of 16 winner. Missing ${missingWinner.label || missingWinner.matchId}.`);
  }

  return Array.from({ length: 4 }, (_, index) => {
    const firstMatch = orderedMatches[index * 2];
    const secondMatch = orderedMatches[index * 2 + 1];

    return {
      matchId: `qf-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${97 + index}`,
      teamA: firstMatch.winner || "",
      teamB: secondMatch.winner || "",
      order: index + 1
    };
  });
}
