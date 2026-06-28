import type { PoolStage } from "@/lib/poolarama-types";
import { teams } from "@/lib/tournament-data";

type KnockoutStage = Extract<PoolStage, "r32" | "r16" | "qf" | "sf" | "final">;

type EspnTeam = {
  abbreviation?: string;
  displayName?: string;
};

type EspnCompetitor = {
  score?: string;
  winner?: boolean;
  team?: EspnTeam;
};

type EspnEvent = {
  id?: string;
  season?: {
    slug?: string;
  };
  competitions?: Array<{
    status?: {
      type?: {
        completed?: boolean;
        detail?: string;
        shortDetail?: string;
      };
    };
    competitors?: EspnCompetitor[];
  }>;
};

type EspnScoreboardResponse = {
  events?: EspnEvent[];
};

export type KnockoutSyncMatch = {
  matchId: string;
  label: string;
  teamA: string;
  teamB: string;
  winner?: string | null;
};

export type SyncedKnockoutWinner = {
  providerEventId: string;
  teamA: string;
  teamB: string;
  winner: string;
  score: string;
  statusDetail: string;
};

export type KnockoutWinnerSyncResult = {
  provider: string;
  providerUrl: string;
  syncedAt: string;
  stage: KnockoutStage;
  rawGameCount: number;
  completedGameCount: number;
  winnerCount: number;
  winners: SyncedKnockoutWinner[];
};

export type KnockoutWinnerMatchPlan = {
  updates: Array<{
    matchId: string;
    label: string;
    winner: string;
    providerEventId: string;
    score: string;
  }>;
  unchanged: Array<{
    matchId: string;
    label: string;
    winner: string;
  }>;
  conflicts: Array<{
    matchId: string;
    label: string;
    storedWinner: string;
    providerWinner: string;
  }>;
  unmatched: SyncedKnockoutWinner[];
};

const espnProviderUrl = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";
const espnSlugByStage: Record<KnockoutStage, string> = {
  r32: "round-of-32",
  r16: "round-of-16",
  qf: "quarterfinals",
  sf: "semifinals",
  final: "final"
};
const teamByCode = new Map(teams.map((team) => [team.code, team.name]));
const teamByNormalizedName = new Map(teams.map((team) => [normalizeTeamName(team.name), team.name]));
const teamAliases = new Map<string, string>([
  ["ivory coast", "Côte d'Ivoire"],
  ["cote divoire", "Côte d'Ivoire"],
  ["côte divoire", "Côte d'Ivoire"],
  ["dr congo", "Congo DR"],
  ["congo dr", "Congo DR"],
  ["south korea", "Korea Republic"],
  ["united states", "USA"],
  ["iran", "IR Iran"],
  ["bosnia herzegovina", "Bosnia and Herzegovina"],
  ["bosnia-herzegovina", "Bosnia and Herzegovina"],
  ["turkiye", "Türkiye"],
  ["cabo verde", "Cape Verde"]
]);

function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function canonicalTeamName(team?: EspnTeam) {
  if (!team) return null;

  const codeMatch = team.abbreviation ? teamByCode.get(team.abbreviation) : null;
  if (codeMatch) return codeMatch;

  const displayName = team.displayName || "";
  const normalized = normalizeTeamName(displayName);

  return teamAliases.get(normalized) || teamByNormalizedName.get(normalized) || null;
}

function pairKey(teamA: string, teamB: string) {
  return [normalizeTeamName(teamA), normalizeTeamName(teamB)].sort().join("|");
}

function scoreLine(competitors: EspnCompetitor[]) {
  return competitors
    .map((competitor) => `${canonicalTeamName(competitor.team) || competitor.team?.displayName || "Unknown"} ${competitor.score ?? ""}`.trim())
    .join(", ");
}

async function fetchJsonWithRetry<T>(url: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchJsonOnce<T>(url);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Provider fetch failed.");
}

async function fetchJsonOnce<T>(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Poolarama/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function espnEventsToWinners(events: EspnEvent[], stage: KnockoutStage) {
  const slug = espnSlugByStage[stage];

  return events.flatMap((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const completed = Boolean(competition?.status?.type?.completed);
    const winner = competitors.find((competitor) => competitor.winner);
    const teamNames = competitors.map((competitor) => canonicalTeamName(competitor.team));
    const winnerName = canonicalTeamName(winner?.team);

    if (
      event.season?.slug !== slug ||
      !completed ||
      competitors.length !== 2 ||
      !teamNames[0] ||
      !teamNames[1] ||
      !winnerName
    ) {
      return [];
    }

    return [{
      providerEventId: String(event.id || pairKey(teamNames[0], teamNames[1])),
      teamA: teamNames[0],
      teamB: teamNames[1],
      winner: winnerName,
      score: scoreLine(competitors),
      statusDetail: competition?.status?.type?.shortDetail || competition?.status?.type?.detail || "FT"
    }];
  });
}

export async function fetchSyncedKnockoutWinners(stage: KnockoutStage): Promise<KnockoutWinnerSyncResult> {
  const espnData = await fetchJsonWithRetry<EspnScoreboardResponse>(espnProviderUrl);
  const events = espnData.events || [];
  const stageEvents = events.filter((event) => event.season?.slug === espnSlugByStage[stage]);
  const winners = espnEventsToWinners(events, stage);

  return {
    provider: "ESPN scoreboard",
    providerUrl: espnProviderUrl,
    syncedAt: new Date().toISOString(),
    stage,
    rawGameCount: events.length,
    completedGameCount: stageEvents.filter((event) => event.competitions?.[0]?.status?.type?.completed).length,
    winnerCount: winners.length,
    winners
  };
}

export function planKnockoutWinnerUpdates(
  matches: KnockoutSyncMatch[],
  syncedWinners: SyncedKnockoutWinner[]
): KnockoutWinnerMatchPlan {
  const matchesByPair = new Map(matches.map((match) => [pairKey(match.teamA, match.teamB), match]));
  const updates: KnockoutWinnerMatchPlan["updates"] = [];
  const unchanged: KnockoutWinnerMatchPlan["unchanged"] = [];
  const conflicts: KnockoutWinnerMatchPlan["conflicts"] = [];
  const unmatched: SyncedKnockoutWinner[] = [];

  for (const syncedWinner of syncedWinners) {
    const match = matchesByPair.get(pairKey(syncedWinner.teamA, syncedWinner.teamB));

    if (!match) {
      unmatched.push(syncedWinner);
      continue;
    }

    if (match.winner === syncedWinner.winner) {
      unchanged.push({
        matchId: match.matchId,
        label: match.label,
        winner: syncedWinner.winner
      });
      continue;
    }

    if (match.winner) {
      conflicts.push({
        matchId: match.matchId,
        label: match.label,
        storedWinner: match.winner,
        providerWinner: syncedWinner.winner
      });
      continue;
    }

    updates.push({
      matchId: match.matchId,
      label: match.label,
      winner: syncedWinner.winner,
      providerEventId: syncedWinner.providerEventId,
      score: syncedWinner.score
    });
  }

  return { updates, unchanged, conflicts, unmatched };
}
