"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { withBasePath } from "@/lib/base-path";
import { normalizeGoldenBootName, type GoldenBootRow } from "@/lib/golden-boot";
import { defaultParticipant, knownParticipants, type KnownParticipant } from "@/lib/known-participants";
import type { AdminParticipantOverview } from "@/lib/poolarama-types";
import { goldenBootCandidates, groups, teams, type GroupId } from "@/lib/tournament-data";

type Tab = "picks" | "standings" | "rules" | "payments" | "pantheon" | "tables" | "admin";

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
  submitted: boolean;
  submittedAt: string | null;
  points: number;
  scoring: {
    label: string;
    value: number;
  }[];
  visible: boolean;
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

type PublicPicksResponse = {
  participants: PublicPickParticipant[];
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

const selectedParticipantKey = "poolarama-selected-participant";
const confirmedParticipantKey = "poolarama-confirmed-participant";
const goldenBootWriteInLabel = "Other / write-in";
const adminInviteToken = "admin-7f4d9c2b8a61e0f5";

const adminFetchOptions = {
  headers: {
    "x-poolarama-admin": adminInviteToken
  }
};

function adminJsonHeaders() {
  return {
    "Content-Type": "application/json",
    "x-poolarama-admin": adminInviteToken
  };
}
const defaultPoolState: PoolState = {
  preTournament: {
    status: "open",
    lockedAt: null
  },
  r32: {
    status: "setup",
    openedAt: null,
    lockedAt: null
  }
};

function getTeamDisplayName(team: { name: string; code: string }) {
  return team.name.length > 12 ? team.code : team.name;
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
  const [groupStandingsRows, setGroupStandingsRows] = useState<GroupStandingRow[]>(() => buildDefaultGroupStandings());
  const [r32Matches, setR32Matches] = useState<R32Match[]>([]);
  const [r32Picks, setR32Picks] = useState<Record<string, string>>({});
  const [r32SavedPicks, setR32SavedPicks] = useState<Record<string, string> | null>(null);
  const [r32Feedback, setR32Feedback] = useState("Round of 32 picks are not open yet.");
  const [goldenBootRows, setGoldenBootRows] = useState<GoldenBootRow[]>([]);
  const [goldenBootFeedback, setGoldenBootFeedback] = useState("Golden Boot table is loading.");

  const paidCount = adminOverview.filter((person) => person.venmoPaid).length;
  const potTotal = paidCount * 10;
  const totalPlayers = publicPicks.length || adminOverview.length;
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
  const r32PicksComplete = r32Matches.length > 0 && r32Matches.every((match) => Boolean(r32Picks[match.matchId]));
  const showLockedHomeNotice = preTournamentLocked && !identityConfirmed && !identityLockedByLink && !adminEnabled;
  const completionHint = duplicateGroupPicks.length > 0
    ? `Fix duplicate picks in Group ${duplicateGroupPicks[0]}.`
    : missingGroupPicks.length > 0
      ? `Finish Group ${missingGroupPicks[0]}.`
      : !selectedChampion
        ? "Pick a champion."
        : !finalGoldenBootPick
          ? "Pick a Golden Boot winner."
          : preTournamentLocked
            ? "Pre-tournament picks are locked."
            : "Ready to review.";
  const submittedCount = adminOverview.filter((participant) => participant.submitted).length;
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
    const adminParam = new URLSearchParams(window.location.search).get("admin");
    const adminAccessRequested = adminParam === adminInviteToken;
    const adminParticipant = adminAccessRequested ? defaultParticipant : null;
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
            setR32Feedback("Restored Round of 32 picks.");
          }

          if (data.submission || data.submissions?.r32) {
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
    loadAdminOverview();
    loadGroupStandings();
    loadGoldenBootTable();
    loadRoundOf32();
  }, []);

  useEffect(() => {
    if (!adminEnabled && tab === "admin") {
      setTab("picks");
    }
  }, [adminEnabled, tab]);

  useEffect(() => {
    loadPublicPicks(selectedParticipant.inviteCode || "");
  }, [selectedParticipant.code, selectedParticipant.inviteCode]);

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
      setPoolState(data.pool);
      setPoolDataWarning(null);
    } catch {
      setPoolState(defaultPoolState);
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
      setPoolState(data.pool);
      setPublicPicks(data.participants);
      setPoolDataWarning(null);
    } catch (error) {
      setPublicPicks([]);
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

      const data = (await response.json()) as { standings: GroupStandingRow[] };
      setGroupStandingsRows(data.standings);
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

      const data = (await response.json()) as { matches: R32Match[]; pool: PoolState };
      setR32Matches(data.matches);
      setPoolState(data.pool);
    } catch {
      setR32Feedback("Round of 32 unavailable.");
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
      setPoolState(data.pool);
      await loadPublicPicks();
      setAdminFeedback(`Pre-tournament picks are ${nextStatus}.`);
    } catch {
      setAdminFeedback("Could not update pre-tournament lock.");
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
    setAdminFeedback("Clearing test submissions...");

    try {
      const response = await fetch(withBasePath("/api/admin/clear-submissions"), {
        method: "DELETE",
        ...adminFetchOptions
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
    window.location.href = withBasePath(`/api/admin/export?adminToken=${adminInviteToken}`);
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

    if (preTournamentLocked) {
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

      setR32SavedPicks(r32Picks);
      await loadPublicPicks();
      setR32Feedback("Round of 32 picks submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit Round of 32 picks.";
      setR32Feedback(message);
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
        </div>
      </section>

      <nav className="tabbar" aria-label="Poolarama sections">
        <TabButton label="Picks" tabName="picks" activeTab={tab} onSelect={setTab} />
        <TabButton label="Standings" tabName="standings" activeTab={tab} onSelect={setTab} />
        <TabButton label="Rules" tabName="rules" activeTab={tab} onSelect={setTab} />
        <TabButton label="Pay" tabName="payments" activeTab={tab} onSelect={setTab} />
        <TabButton label="Pantheon" tabName="pantheon" activeTab={tab} onSelect={setTab} />
        {adminEnabled ? (
          <TabButton label="Admin" tabName="admin" activeTab={tab} onSelect={setTab} />
        ) : (
          <TabButton label="Tables" tabName="tables" activeTab={tab} onSelect={setTab} />
        )}
      </nav>

      {tab === "picks" && (
        <section className="screen stack" aria-labelledby="picks-title">
          <ScreenHeader
            kicker={showLockedHomeNotice ? "Current round locked" : identityConfirmed ? "Picks open" : "Player access"}
            title={showLockedHomeNotice ? "All picks are in" : identityConfirmed ? "Make your group picks" : "Open your player link"}
            note={showLockedHomeNotice
              ? "The group-stage picks are locked and visible in the standings."
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
          {!showLockedHomeNotice && (
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
                            style={{
                              "--team-a": team.colors[0],
                              "--team-b": team.colors[1]
                            } as React.CSSProperties}
                            onClick={() => {
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
                            style={{
                              "--team-a": team.colors[0],
                              "--team-b": team.colors[1]
                            } as React.CSSProperties}
                            onClick={() => {
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
                    onClick={() => setSelectedChampion(team.name)}
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
                    onClick={() => {
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

              if (preTournamentLocked) {
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
            disabled={isSaving}
            aria-disabled={isSaving || !allRequiredPicksComplete}
          >
            {isSaving
              ? "Submitting picks..."
              : isReviewing
                ? `Submit Picks: ${selectedParticipant.nickname}`
                : preTournamentLocked
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
          {savedPicks && (
            <section className="save-confirmation" aria-live="polite" aria-label="Saved picks">
              <div>
                <p className="eyebrow">Saved picks</p>
                <h3>{selectedParticipant.nickname}&apos;s picks are saved</h3>
                <p>{saveFeedback}</p>
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
            </section>
          )}
          {r32Matches.length > 0 && (
            <section className="knockout-card" aria-labelledby="r32-picks-title">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Round of 32</p>
                  <h3 id="r32-picks-title">Pick match winners</h3>
                  <p>
                    {r32Open
                      ? `${Object.keys(r32Picks).length}/${r32Matches.length} winners picked`
                      : r32Locked
                        ? "Round of 32 picks are locked."
                        : "Round of 32 picks are not open yet."}
                  </p>
                </div>
                <div className="points-pill">
                  <strong>16 pts</strong>
                  <span>1 per match</span>
                </div>
              </div>
              <div className="knockout-match-grid">
                {r32Matches.map((match) => (
                  <article className="knockout-match-card" key={match.matchId}>
                    <span>{match.label}</span>
                    <div>
                      {[match.teamA, match.teamB].map((teamName) => {
                        const team = teams.find((candidate) => candidate.name === teamName);

                        return (
                          <button
                            className={r32Picks[match.matchId] === teamName ? "selected" : ""}
                            key={`${match.matchId}-${teamName}`}
                            type="button"
                            disabled={!r32Open || isSaving}
                            onClick={() => setR32Picks((current) => ({ ...current, [match.matchId]: teamName }))}
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
                onClick={handleSaveRoundOf32Picks}
                disabled={!r32Open || isSaving}
              >
                {r32SavedPicks && JSON.stringify(r32SavedPicks) === JSON.stringify(r32Picks)
                  ? "Round of 32 submitted"
                  : r32Open
                    ? `Submit R32 Picks: ${selectedParticipant.nickname}`
                    : r32Locked
                      ? "Round of 32 locked"
                      : "Round of 32 not open"}
              </button>
              <p className="pick-status" aria-live="polite">{r32Feedback}</p>
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
            note={preTournamentLocked ? "Pre-tournament picks are locked and visible." : "Picks stay hidden until John locks the round."}
          />
          {poolDataWarning && (
            <div className="inline-alert" role="alert">
              <strong>{poolDataWarning}</strong>
            </div>
          )}
          <div className="standings-list">
            {(() => {
              const standingsPeople: PublicPickParticipant[] = publicPicks.length > 0
                ? publicPicks
                : adminOverview.map((participant) => ({
                    code: participant.code,
                    name: participant.name,
                    nickname: participant.nickname,
                    submitted: participant.submitted,
                    submittedAt: participant.submittedAt,
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

                return (
                  <article className={`standing-row standing-${displayRank}`} key={person.code}>
                    <div className="standing-main">
                      <div className="rank">{displayRank}</div>
                      <div>
                        <h3>{person.nickname}</h3>
                        <p>
                          {person.name} · {person.submitted ? "Submitted" : "No picks yet"}
                          {person.code === selectedParticipant.code ? " · you" : ""}
                        </p>
                      </div>
                      <strong>{person.submitted ? `${person.points} pts` : "—"}</strong>
                    </div>
                    {person.submitted && person.scoring.length > 0 && (
                      <div className="score-breakdown" aria-label={`${person.nickname} score breakdown`}>
                        {person.scoring.map((item) => (
                          <div key={`${person.code}-${item.label}`}>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <details className="pick-details">
                      <summary>View {person.nickname}&apos;s picks</summary>
                      {person.visible && person.picks ? (
                        <div className="pick-sheet">
                          <p><strong>Champion:</strong> {person.picks.champion}</p>
                          <p>
                            <strong>Golden Boot:</strong> {person.picks.goldenBoot}
                            <span className="golden-boot-status">
                              ({getGoldenBootStatus(person.picks.goldenBoot, goldenBootRows)})
                            </span>
                          </p>
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
                        </div>
                      ) : (
                        <div className="pick-sheet">
                          <p>
                            <strong>{person.submitted ? "Picks hidden." : "No picks submitted."}</strong>
                          </p>
                          <p>{person.submitted ? "They will appear here after this round locks." : "Nothing to show yet."}</p>
                        </div>
                      )}
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
            {adminOverview.map((person) => (
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
            kicker="Live tables"
            title="Group standings"
            note="Current group tables used for pool scoring."
          />
          <GroupStandingsDisplay rows={groupStandingsRows} />
          <GoldenBootTable rows={goldenBootRows} feedback={goldenBootFeedback} />
        </section>
      )}

      {adminEnabled && tab === "admin" && (
        <section className="screen stack" aria-labelledby="admin-title">
          <ScreenHeader
            kicker="Admin dashboard"
            title="Track the pool"
            note="See who has paid, who has submitted, and who needs a reminder."
          />
          <div className="admin-summary">
            <div>
              <strong>{submittedCount}/{adminOverview.length}</strong>
              <span>submitted</span>
            </div>
            <div>
              <strong>{adminOverview.length - unpaidCount}/{adminOverview.length}</strong>
              <span>paid</span>
            </div>
            <div>
              <strong>{unpaidCount}</strong>
              <span>unpaid</span>
            </div>
            <div>
              <strong>{preTournamentLocked ? "Locked" : "Open"}</strong>
              <span>pre-tournament</span>
            </div>
          </div>
          <div className="admin-toolbar">
            <p>{adminFeedback}</p>
            <div className="admin-toolbar-actions">
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
              <button className="admin-action compact" type="button" onClick={handleExportPicks}>
                Export CSV
              </button>
            </div>
          </div>
          <section className="invite-card" aria-labelledby="invite-title">
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
          </section>
          <section className="group-standings-admin" aria-labelledby="group-standings-admin-title">
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
                    .map((row) => (
                      <div className="group-standing-row" key={row.team}>
                        <strong>{getTeamDisplayName(teams.find((team) => team.name === row.team) || { name: row.team, code: row.team.slice(0, 3).toUpperCase() })}</strong>
                        <label>
                          <span>Rank</span>
                          <input type="number" min="1" max="4" value={row.rank} onChange={(event) => updateGroupStanding(row.team, "rank", event.target.value)} />
                        </label>
                        <label>
                          <span>Pts</span>
                          <input type="number" min="0" value={row.points} onChange={(event) => updateGroupStanding(row.team, "points", event.target.value)} />
                        </label>
                        <label>
                          <span>GD</span>
                          <input type="number" value={row.goalDifference} onChange={(event) => updateGroupStanding(row.team, "goalDifference", event.target.value)} />
                        </label>
                      </div>
                    ))}
                </article>
              ))}
            </div>
          </section>
          <GoldenBootTable rows={goldenBootRows} feedback={goldenBootFeedback} />
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
                      {participant.submitted ? "Submitted" : "No picks"}
                    </span>
                  </div>
                  <div className="admin-pick-summary">
                    <span>{participant.submittedAt ? new Date(participant.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not submitted yet"}</span>
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
                    <button
                      className={`admin-action compact payment-toggle ${participant.venmoPaid ? "quiet" : ""}`}
                      type="button"
                      onClick={() => handleTogglePayment(participant)}
                    >
                      {participant.venmoPaid ? "Mark unpaid" : "Mark paid"}
                    </button>
                    <button className="admin-action compact" type="button" onClick={() => handleCopyInvite(participant)}>
                      Copy link
                    </button>
                    <button className="admin-action compact quiet" type="button" onClick={() => handleCopyReminder(participant)}>
                      Copy reminder
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
                  </div>
                </article>
              );
            })}
          </div>
          <div className="admin-maintenance-actions">
            <button className="admin-action compact" type="button" onClick={loadAdminOverview}>
              Refresh participants
            </button>
            <button className="admin-action compact quiet" type="button" onClick={handleClearSubmissions}>
              Clear test picks
            </button>
          </div>
        </section>
      )}
    </main>
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
            <span>P</span>
            <span>GD</span>
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
                    {getTeamDisplayName(team)}
                  </strong>
                  <span>{row.played}</span>
                  <span className={row.goalDifference > 0 ? "positive-gd" : row.goalDifference < 0 ? "negative-gd" : ""}>
                    {goalDifference}
                  </span>
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
