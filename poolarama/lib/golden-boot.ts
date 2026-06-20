export type GoldenBootRow = {
  player: string;
  normalizedPlayer: string;
  country: string;
  countryCode: string;
  goals: number;
  rank: number;
  tied: boolean;
  placeLabel: string;
};

type EspnCompetitor = {
  team?: {
    id?: string;
    abbreviation?: string;
    displayName?: string;
  };
};

type EspnScoringDetail = {
  scoringPlay?: boolean;
  ownGoal?: boolean;
  team?: {
    id?: string;
  };
  athletesInvolved?: Array<{
    displayName?: string;
    team?: {
      id?: string;
    };
  }>;
};

type EspnEvent = {
  competitions?: Array<{
    status?: {
      type?: {
        completed?: boolean;
      };
    };
    competitors?: EspnCompetitor[];
    details?: EspnScoringDetail[];
  }>;
};

type EspnScoreboardResponse = {
  events?: EspnEvent[];
};

const espnScoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";

export function normalizeGoldenBootName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|junior)\.?$/i, "junior")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function ordinal(rank: number) {
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

async function fetchJsonWithRetry<T>(url: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
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
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Golden Boot provider fetch failed.");
}

export async function fetchGoldenBootTable() {
  const data = await fetchJsonWithRetry<EspnScoreboardResponse>(espnScoreboardUrl);
  const scorers = new Map<string, Omit<GoldenBootRow, "rank" | "tied" | "placeLabel">>();

  for (const event of data.events || []) {
    const competition = event.competitions?.[0];
    if (!competition?.status?.type?.completed) continue;

    const teamById = new Map(
      (competition.competitors || [])
        .map((competitor) => competitor.team)
        .filter(Boolean)
        .map((team) => [
          team?.id || "",
          {
            country: team?.displayName || "",
            countryCode: team?.abbreviation || ""
          }
        ])
    );

    for (const detail of competition.details || []) {
      if (!detail.scoringPlay || detail.ownGoal) continue;

      const athlete = detail.athletesInvolved?.[0];
      const player = athlete?.displayName?.trim();
      if (!player) continue;

      const teamId = athlete?.team?.id || detail.team?.id || "";
      const team = teamById.get(teamId) || { country: "", countryCode: "" };
      const normalizedPlayer = normalizeGoldenBootName(player);
      const current = scorers.get(normalizedPlayer);

      scorers.set(normalizedPlayer, {
        player,
        normalizedPlayer,
        country: current?.country || team.country,
        countryCode: current?.countryCode || team.countryCode,
        goals: (current?.goals || 0) + 1
      });
    }
  }

  const sortedRows = Array.from(scorers.values()).sort((a, b) =>
    b.goals - a.goals ||
    a.player.localeCompare(b.player)
  );

  return {
    provider: "ESPN scoreboard",
    providerUrl: espnScoreboardUrl,
    syncedAt: new Date().toISOString(),
    completedMatchCount: (data.events || []).filter((event) => event.competitions?.[0]?.status?.type?.completed).length,
    rows: sortedRows.map((row, index, rows) => {
      const rank = index === 0
        ? 1
        : row.goals === rows[index - 1].goals
          ? rows.findIndex((candidate) => candidate.goals === row.goals) + 1
          : index + 1;
      const tied = rows.filter((candidate) => candidate.goals === row.goals).length > 1;

      return {
        ...row,
        rank,
        tied,
        placeLabel: `${tied ? "T-" : ""}${ordinal(rank)} place`
      };
    })
  };
}
