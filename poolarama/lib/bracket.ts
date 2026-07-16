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

  const matchesByNumber = new Map(
    orderedMatches.map((match) => [Number((match.label || "").match(/\d+/)?.[0]), match])
  );
  const roundOf16Slots = [
    { matchNumber: 89, sideA: 74, sideB: 77 },
    { matchNumber: 90, sideA: 73, sideB: 75 },
    { matchNumber: 91, sideA: 76, sideB: 78 },
    { matchNumber: 92, sideA: 79, sideB: 80 },
    { matchNumber: 93, sideA: 83, sideB: 84 },
    { matchNumber: 94, sideA: 81, sideB: 82 },
    { matchNumber: 95, sideA: 86, sideB: 88 },
    { matchNumber: 96, sideA: 85, sideB: 87 }
  ];

  return roundOf16Slots.map((slot, index) => {
    const firstMatch = matchesByNumber.get(slot.sideA);
    const secondMatch = matchesByNumber.get(slot.sideB);

    if (!firstMatch || !secondMatch) {
      throw new Error(`Round of 16 preview is missing Match ${slot.sideA} or Match ${slot.sideB}.`);
    }

    return {
      matchId: `r16-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${slot.matchNumber}`,
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

  const matchesByNumber = new Map(
    orderedMatches.map((match) => [Number((match.label || "").match(/\d+/)?.[0]), match])
  );
  const quarterfinalSlots = [
    { matchNumber: 97, sideA: 89, sideB: 90 },
    { matchNumber: 98, sideA: 93, sideB: 94 },
    { matchNumber: 99, sideA: 91, sideB: 92 },
    { matchNumber: 100, sideA: 95, sideB: 96 }
  ];

  return quarterfinalSlots.map((slot, index) => {
    const firstMatch = matchesByNumber.get(slot.sideA);
    const secondMatch = matchesByNumber.get(slot.sideB);

    if (!firstMatch || !secondMatch) {
      throw new Error(`Quarterfinal preview is missing Match ${slot.sideA} or Match ${slot.sideB}.`);
    }

    return {
      matchId: `qf-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${slot.matchNumber}`,
      teamA: firstMatch.winner || "",
      teamB: secondMatch.winner || "",
      order: index + 1
    };
  });
}

export function generateSemifinalMatches(quarterfinalMatches: KnockoutSourceMatch[]): GeneratedMatch[] {
  const orderedMatches = [...quarterfinalMatches].sort((a, b) => a.order - b.order);

  if (orderedMatches.length !== 4) {
    throw new Error(`Semifinal preview requires 4 Quarterfinal matches, found ${orderedMatches.length}.`);
  }

  const missingWinner = orderedMatches.find((match) => !match.winner);

  if (missingWinner) {
    throw new Error(`Semifinal preview requires every Quarterfinal winner. Missing ${missingWinner.label || missingWinner.matchId}.`);
  }

  const matchesByNumber = new Map(
    orderedMatches.map((match) => [Number((match.label || "").match(/\d+/)?.[0]), match])
  );
  const semifinalSlots = [
    { matchNumber: 101, sideA: 97, sideB: 98 },
    { matchNumber: 102, sideA: 99, sideB: 100 }
  ];

  return semifinalSlots.map((slot, index) => {
    const firstMatch = matchesByNumber.get(slot.sideA);
    const secondMatch = matchesByNumber.get(slot.sideB);

    if (!firstMatch || !secondMatch) {
      throw new Error(`Semifinal preview is missing Match ${slot.sideA} or Match ${slot.sideB}.`);
    }

    return {
      matchId: `sf-${String(index + 1).padStart(2, "0")}`,
      label: `Match ${slot.matchNumber}`,
      teamA: firstMatch.winner || "",
      teamB: secondMatch.winner || "",
      order: index + 1
    };
  });
}

export function generateFinalMatches(semifinalMatches: KnockoutSourceMatch[]): GeneratedMatch[] {
  const orderedMatches = [...semifinalMatches].sort((a, b) => a.order - b.order);

  if (orderedMatches.length !== 2) {
    throw new Error(`Final preview requires 2 Semifinal matches, found ${orderedMatches.length}.`);
  }

  const missingWinner = orderedMatches.find((match) => !match.winner);

  if (missingWinner) {
    throw new Error(`Final preview requires every Semifinal winner. Missing ${missingWinner.label || missingWinner.matchId}.`);
  }

  const matchesByNumber = new Map(
    orderedMatches.map((match) => [Number((match.label || "").match(/\d+/)?.[0]), match])
  );
  const firstMatch = matchesByNumber.get(101);
  const secondMatch = matchesByNumber.get(102);

  if (!firstMatch || !secondMatch) {
    throw new Error("Final preview is missing Match 101 or Match 102.");
  }

  return [
    {
      matchId: "final-01",
      label: "Match 104",
      teamA: firstMatch.winner || "",
      teamB: secondMatch.winner || "",
      order: 1
    }
  ];
}
