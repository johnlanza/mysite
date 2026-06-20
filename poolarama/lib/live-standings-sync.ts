import { type GroupStandingInput } from "@/lib/bracket";
import { groups, teams, type GroupId } from "@/lib/tournament-data";

type ProviderGame = {
  id?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_score?: string;
  away_score?: string;
  group?: string;
  finished?: string;
  type?: string;
};

type ProviderGamesResponse = {
  games?: ProviderGame[];
};

type TeamStats = GroupStandingInput & {
  teamId: string;
};

type FinishedGame = {
  id: string;
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

const providerUrl = "https://worldcup26.ir/get/games";
const teamByProviderId = new Map(teams.map((team, index) => [String(index + 1), team]));

function toNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isFinishedGame(game: ProviderGame): game is Required<Pick<ProviderGame, "home_team_id" | "away_team_id" | "home_score" | "away_score" | "group">> & ProviderGame {
  return (
    game.type === "group" &&
    typeof game.group === "string" &&
    groups.includes(game.group as GroupId) &&
    String(game.finished || "").toLowerCase() === "true" &&
    toNumber(game.home_score) !== null &&
    toNumber(game.away_score) !== null &&
    Boolean(game.home_team_id && game.away_team_id)
  );
}

function createEmptyStats(): TeamStats[] {
  return teams.map((team, index) => ({
    teamId: String(index + 1),
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
    rank: 0,
    tiebreaker: "unresolved"
  }));
}

function applyGame(statsById: Map<string, TeamStats>, game: FinishedGame) {
  const home = statsById.get(game.homeTeamId);
  const away = statsById.get(game.awayTeamId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += game.homeScore;
  home.goalsAgainst += game.awayScore;
  away.goalsFor += game.awayScore;
  away.goalsAgainst += game.homeScore;

  if (game.homeScore > game.awayScore) {
    home.wins += 1;
    away.losses += 1;
    home.points += 3;
  } else if (game.homeScore < game.awayScore) {
    away.wins += 1;
    home.losses += 1;
    away.points += 3;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }

  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
}

function headToHeadStats(teamIds: string[], games: FinishedGame[]) {
  const stats = new Map(teamIds.map((teamId) => [
    teamId,
    { points: 0, goalDifference: 0, goalsFor: 0, matches: 0 }
  ]));
  const tiedIds = new Set(teamIds);

  for (const game of games) {
    if (!tiedIds.has(game.homeTeamId) || !tiedIds.has(game.awayTeamId)) continue;
    const home = stats.get(game.homeTeamId);
    const away = stats.get(game.awayTeamId);
    if (!home || !away) continue;

    home.matches += 1;
    away.matches += 1;
    home.goalsFor += game.homeScore;
    away.goalsFor += game.awayScore;
    home.goalDifference += game.homeScore - game.awayScore;
    away.goalDifference += game.awayScore - game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.points += 3;
    } else if (game.homeScore < game.awayScore) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  return stats;
}

function compareTiedTeams(a: TeamStats, b: TeamStats, groupGames: FinishedGame[]) {
  const h2h = headToHeadStats([a.teamId, b.teamId], groupGames);
  const aH2h = h2h.get(a.teamId);
  const bH2h = h2h.get(b.teamId);

  if (aH2h?.matches && bH2h?.matches) {
    const h2hDifference =
      bH2h.points - aH2h.points ||
      bH2h.goalDifference - aH2h.goalDifference ||
      bH2h.goalsFor - aH2h.goalsFor;
    if (h2hDifference !== 0) return h2hDifference;
  }

  return (
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    Number(a.teamId) - Number(b.teamId)
  );
}

function getTiebreaker(a: TeamStats, b: TeamStats | null, groupGames: FinishedGame[]): GroupStandingInput["tiebreaker"] {
  if (!b) return "overall";
  if (a.points !== b.points || a.goalDifference !== b.goalDifference || a.goalsFor !== b.goalsFor) return "overall";

  const h2h = headToHeadStats([a.teamId, b.teamId], groupGames);
  const aH2h = h2h.get(a.teamId);
  const bH2h = h2h.get(b.teamId);
  if (
    aH2h?.matches &&
    bH2h?.matches &&
    (aH2h.points !== bH2h.points || aH2h.goalDifference !== bH2h.goalDifference || aH2h.goalsFor !== bH2h.goalsFor)
  ) {
    return "headToHead";
  }

  return "unresolved";
}

function rankSyncedStandings(rows: TeamStats[], finishedGames: FinishedGame[]) {
  return groups.flatMap((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    const groupGames = finishedGames.filter((game) => game.group === group);
    const sortedRows = [...groupRows].sort((a, b) => {
      return b.points - a.points || compareTiedTeams(a, b, groupGames);
    });

    return sortedRows.map((row, index) => ({
      ...row,
      rank: index + 1,
      tiebreaker: getTiebreaker(row, sortedRows[index + 1] || null, groupGames)
    }));
  });
}

async function fetchProviderGamesOnce() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(providerUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }

    return (await response.json()) as ProviderGamesResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProviderGames() {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchProviderGamesOnce();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Provider fetch failed.");
}

export async function fetchSyncedGroupStandings() {
  const providerData = await fetchProviderGames();
  const rawGames = providerData.games || [];
  const finishedGames: FinishedGame[] = rawGames.filter(isFinishedGame).map((game) => ({
    id: String(game.id || `${game.home_team_id}-${game.away_team_id}`),
    group: game.group as GroupId,
    homeTeamId: game.home_team_id,
    awayTeamId: game.away_team_id,
    homeScore: Number(game.home_score),
    awayScore: Number(game.away_score)
  }));
  const unknownTeamIds = new Set(
    finishedGames
      .flatMap((game) => [game.homeTeamId, game.awayTeamId])
      .filter((teamId) => !teamByProviderId.has(teamId))
  );

  if (unknownTeamIds.size > 0) {
    throw new Error(`Provider returned unknown team ids: ${Array.from(unknownTeamIds).join(", ")}`);
  }

  const stats = createEmptyStats();
  const statsById = new Map(stats.map((row) => [row.teamId, row]));
  for (const game of finishedGames) {
    applyGame(statsById, game);
  }

  const standings = rankSyncedStandings(stats, finishedGames).map(({ teamId, ...standing }) => standing);

  return {
    provider: "worldcup26.ir",
    providerUrl,
    syncedAt: new Date().toISOString(),
    rawGameCount: rawGames.length,
    finishedGroupGameCount: finishedGames.length,
    standings
  };
}
