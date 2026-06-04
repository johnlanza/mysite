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
};

export type GeneratedMatch = {
  matchId: string;
  label: string;
  teamA: string;
  teamB: string;
  order: number;
};

function compareStandings(a: GroupStandingInput, b: GroupStandingInput) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
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

export function rankGroupStandings(standings: GroupStandingInput[]) {
  return groups.flatMap((group) => {
    const groupRows = standings
      .filter((standing) => standing.group === group)
      .sort((a, b) => a.rank - b.rank || compareStandings(a, b));

    return groupRows.map((standing, index) => ({
      ...standing,
      rank: standing.rank || index + 1
    }));
  });
}

export function generateRoundOf32Matches(standings: GroupStandingInput[]): GeneratedMatch[] {
  const rankedStandings = rankGroupStandings(standings);
  const automaticQualifiers = rankedStandings.filter((standing) => standing.rank <= 2);
  const thirdPlaceQualifiers = rankedStandings
    .filter((standing) => standing.rank === 3)
    .sort(compareStandings)
    .slice(0, 8);
  const qualifiers = [...automaticQualifiers, ...thirdPlaceQualifiers].sort(compareStandings);

  if (qualifiers.length < 32) {
    throw new Error("Need 32 qualified teams to generate Round of 32.");
  }

  return Array.from({ length: 16 }, (_, index) => {
    const teamA = qualifiers[index];
    const teamB = qualifiers[31 - index];

    return {
      matchId: `r32-${String(index + 1).padStart(2, "0")}`,
      label: `R32 Match ${index + 1}`,
      teamA: teamA.team,
      teamB: teamB.team,
      order: index + 1
    };
  });
}
