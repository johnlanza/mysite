"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { defaultParticipant, knownParticipants, type KnownParticipant } from "@/lib/known-participants";
import type { AdminParticipantOverview } from "@/lib/poolarama-types";
import { goldenBootCandidates, groups, teams, type GroupId } from "@/lib/tournament-data";

type Tab = "picks" | "standings" | "rules" | "payments" | "pantheon" | "admin";

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
    };
    submittedAt: string;
    storageMode: "mongo" | "mock";
  } | null;
  participant?: {
    code: string;
    name: string;
    nickname: string;
    venmoPaid: boolean;
  };
};

type AdminOverviewResponse = {
  participants: AdminParticipantOverview[];
  storageMode: "mongo" | "mock";
};

type PoolState = {
  preTournament: {
    status: "open" | "locked";
    lockedAt: string | null;
  };
};

type PublicPickParticipant = {
  code: string;
  name: string;
  nickname: string;
  submitted: boolean;
  submittedAt: string | null;
  visible: boolean;
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
};

type TestStage = "Group" | "R32" | "R16" | "QF" | "SF" | "Final" | "Complete";

type TestMatch = {
  id: string;
  stage: Exclude<TestStage, "Group" | "Complete">;
  teamA: string;
  teamB: string;
  winner: string | null;
};

const selectedParticipantKey = "poolarama-selected-participant";
const confirmedParticipantKey = "poolarama-confirmed-participant";
const defaultPoolState: PoolState = {
  preTournament: {
    status: "open",
    lockedAt: null
  }
};

function getSavedPicksKey(participantCode: string) {
  return `poolarama-test-picks:${participantCode}`;
}

function getTeamDisplayName(team: { name: string; code: string }) {
  return team.name.length > 12 ? team.code : team.name;
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

function getCountryColors(country: string): [string, string] {
  return teams.find((team) => team.name === country)?.colors || ["#5b6676", "#ffffff"];
}

function getNextTestStage(stage: TestStage): TestStage {
  const stageOrder: TestStage[] = ["Group", "R32", "R16", "QF", "SF", "Final", "Complete"];
  return stageOrder[Math.min(stageOrder.indexOf(stage) + 1, stageOrder.length - 1)];
}

function getStagePointValue(stage: TestMatch["stage"]) {
  return stage === "R32" ? 1 : stage === "R16" ? 2 : stage === "QF" ? 3 : stage === "SF" ? 4 : 5;
}

function buildTestMatches(stage: TestMatch["stage"], stageTeams: string[]) {
  return Array.from({ length: Math.floor(stageTeams.length / 2) }, (_, index) => ({
    id: `${stage.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
    stage,
    teamA: stageTeams[index * 2],
    teamB: stageTeams[index * 2 + 1],
    winner: null
  }));
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
  { year: "2023", tournament: "Women’s World Cup", champion: "Needs tiebreaker", detail: "Brett and Mike tied on points" },
  { year: "2022", tournament: "Men’s World Cup", champion: "Brett", detail: "23 points" }
];

export function PoolaramaPrototype() {
  const [tab, setTab] = useState<Tab>("picks");
  const [selectedChampion, setSelectedChampion] = useState("");
  const [selectedGoldenBoot, setSelectedGoldenBoot] = useState("");
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
  const [poolState, setPoolState] = useState<PoolState>(defaultPoolState);
  const [publicPicks, setPublicPicks] = useState<PublicPickParticipant[]>([]);
  const [testStage, setTestStage] = useState<TestStage>("Group");
  const [testMatches, setTestMatches] = useState<TestMatch[]>([]);
  const [testScore, setTestScore] = useState(0);
  const [testLog, setTestLog] = useState<string[]>(["Ready to run a 10 minute tournament."]);

  const paidCount = adminOverview.filter((person) => person.venmoPaid).length;
  const potTotal = paidCount * 10;
  const totalPlayers = adminOverview.length || knownParticipants.length;
  const championCandidates = useMemo(() => {
    const candidateNames = groups.flatMap((group) => [groupWinners[group], groupRunnersUp[group]]);

    return teams.filter((team) => candidateNames.includes(team.name));
  }, [groupRunnersUp, groupWinners]);
  const currentPicksAreSaved = savedPicks !== null &&
    savedPicks.champion === selectedChampion &&
    savedPicks.goldenBoot === selectedGoldenBoot &&
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
    Boolean(selectedGoldenBoot);
  const preTournamentLocked = poolState.preTournament.status === "locked";
  const completionHint = duplicateGroupPicks.length > 0
    ? `Fix duplicate picks in Group ${duplicateGroupPicks[0]}.`
    : missingGroupPicks.length > 0
      ? `Finish Group ${missingGroupPicks[0]}.`
      : !selectedChampion
        ? "Pick a champion."
        : !selectedGoldenBoot
          ? "Pick a Golden Boot winner."
          : preTournamentLocked
            ? "Pre-tournament picks are locked."
            : "Ready to review.";
  const submittedCount = adminOverview.filter((participant) => participant.submitted).length;
  const leaderLabel = submittedCount === 0 ? "Awaiting initial picks" : "Scoring not started";
  const unpaidCount = adminOverview.filter((participant) => !participant.venmoPaid).length;
  const activeTestMatches = testMatches.filter((match) => match.stage === testStage);
  const completedTestMatches = activeTestMatches.filter((match) => match.winner).length;

  useEffect(() => {
    if (selectedChampion && !championCandidates.some((team) => team.name === selectedChampion)) {
      setSelectedChampion("");
      setIsReviewing(false);
    }
  }, [championCandidates, selectedChampion]);

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

      if (nextPicks.goldenBoot) {
        setSelectedGoldenBoot(nextPicks.goldenBoot);
      }

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
    const urlParticipant = knownParticipants.find((participant) => participant.code === urlParticipantCode) || null;
    setAdminEnabled(adminParam === "john");
    const storedParticipantCode = window.localStorage.getItem(selectedParticipantKey);
    const confirmedParticipantCode = window.localStorage.getItem(confirmedParticipantKey);
    const initialParticipant =
      urlParticipant ||
      knownParticipants.find((participant) => participant.code === storedParticipantCode) ||
      defaultParticipant;
    const linkLocked = Boolean(urlParticipant);

    setSelectedParticipant(initialParticipant);
    setIdentityLockedByLink(linkLocked);
    setIdentityConfirmed(linkLocked || confirmedParticipantCode === initialParticipant.code);

    if (linkLocked) {
      window.localStorage.setItem(selectedParticipantKey, initialParticipant.code);
      window.localStorage.setItem(confirmedParticipantKey, initialParticipant.code);
    }

    async function loadSavedPicks() {
      try {
        const response = await fetch(withBasePath(`/api/me?code=${initialParticipant.code}`), { cache: "no-store" });

        if (response.ok) {
          const data = (await response.json()) as ApiSubmissionResponse;

          if (data.participant) {
            const matchedParticipant =
              knownParticipants.find((participant) => participant.code === data.participant?.code) || initialParticipant;

            setSelectedParticipant(matchedParticipant);
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
            return;
          }
        }
      } catch {
        // Browser backup below keeps prototype testing usable when the API is down.
      }

      const storedPicks =
        window.localStorage.getItem(getSavedPicksKey(initialParticipant.code)) ||
        window.localStorage.getItem("poolarama-test-picks");

      if (!storedPicks) {
        return;
      }

      try {
        applySavedPicks({ ...JSON.parse(storedPicks), storageMode: "browser" } as SavedPicks);
      } catch {
        window.localStorage.removeItem(getSavedPicksKey(initialParticipant.code));
      }
    }

    loadSavedPicks();
  }, []);

  useEffect(() => {
    loadAdminOverview();
  }, []);

  useEffect(() => {
    if (!adminEnabled && tab === "admin") {
      setTab("picks");
    }
  }, [adminEnabled, tab]);

  useEffect(() => {
    loadPublicPicks(selectedParticipant.code);
  }, [selectedParticipant.code]);

  async function loadAdminOverview() {
    try {
      const response = await fetch(withBasePath("/api/admin/overview"), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Admin overview failed.");
      }

      const data = (await response.json()) as AdminOverviewResponse;
      setAdminOverview(data.participants);
      setAdminFeedback(
        data.storageMode === "mongo"
          ? "Admin overview loaded from Mongo."
          : "Admin overview loaded from prototype API memory."
      );
    } catch {
      setAdminFeedback("Admin overview unavailable. Showing local participant list.");
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
    } catch {
      setPoolState(defaultPoolState);
    }
  }

  async function loadPublicPicks(viewerCode = selectedParticipant.code) {
    try {
      const response = await fetch(withBasePath(`/api/picks?viewerCode=${viewerCode}`), { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Public picks failed.");
      }

      const data = (await response.json()) as PublicPicksResponse;
      setPoolState(data.pool);
      setPublicPicks(data.participants);
    } catch {
      setPublicPicks([]);
    }
  }

  async function handleTogglePreTournamentLock() {
    const nextStatus = preTournamentLocked ? "open" : "locked";
    setAdminFeedback(`${nextStatus === "locked" ? "Locking" : "Unlocking"} pre-tournament picks...`);

    try {
      const response = await fetch(withBasePath("/api/admin/pool-state"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
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
        method: "POST"
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

  async function handleClearSubmissions() {
    setAdminFeedback("Clearing test submissions...");

    try {
      const response = await fetch(withBasePath("/api/admin/clear-submissions"), {
        method: "DELETE"
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          participantCode: participant.code,
          venmoPaid: nextPaid
        })
      });

      if (!response.ok) {
        throw new Error("Payment update failed.");
      }

      await loadAdminOverview();
      await loadPublicPicks();
      setAdminFeedback(`${participant.nickname} marked ${nextPaid ? "paid" : "unpaid"}.`);
    } catch {
      setAdminFeedback(`Could not update payment for ${participant.nickname}.`);
    }
  }

  function handleExportPicks() {
    window.location.href = withBasePath("/api/admin/export");
  }

  async function handleSelectParticipant(participant: KnownParticipant) {
    if (identityLockedByLink) return;

    setSelectedParticipant(participant);
    setIdentityConfirmed(false);
    setSelectedChampion("");
    setSelectedGoldenBoot("");
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

      if (data.submission) {
        setSelectedChampion(data.submission.picks.champion);
        setSelectedGoldenBoot(data.submission.picks.goldenBoot);
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

    const nextSavedPicks: SavedPicks = {
      champion: selectedChampion,
      goldenBoot: selectedGoldenBoot,
      groupFilter: "All",
      groupWinners,
      groupRunnersUp,
      savedAt: new Date().toISOString(),
      storageMode: "browser"
    };

    window.localStorage.setItem(getSavedPicksKey(selectedParticipant.code), JSON.stringify(nextSavedPicks));
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
            goldenBoot: selectedGoldenBoot,
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

      window.localStorage.setItem(getSavedPicksKey(selectedParticipant.code), JSON.stringify(apiSavedPicks));
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
      setSavedPicks(nextSavedPicks);
      setIsReviewing(false);
      loadAdminOverview();
      loadPublicPicks();
      setSaveFeedback(`API unavailable. Picks saved in this browser for ${selectedParticipant.nickname}.`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleGenerateTestRound() {
    const seedTeams = teams.slice(0, 32).map((team) => team.name);
    const matches = buildTestMatches("R32", seedTeams);

    setTestStage("R32");
    setTestMatches(matches);
    setTestScore(0);
    setTestLog(["Generated fake Round of 32 from the first 32 teams."]);
  }

  function handleRandomizeTestWinners() {
    if (activeTestMatches.length === 0) {
      setTestLog((current) => ["Generate a round first.", ...current]);
      return;
    }

    setTestMatches((current) =>
      current.map((match) =>
        match.stage === testStage
          ? {
              ...match,
              winner: Math.random() > 0.5 ? match.teamA : match.teamB
            }
          : match
      )
    );
    setTestLog((current) => [`Randomized ${activeTestMatches.length} ${testStage} winners.`, ...current]);
  }

  function handleScoreTestRound() {
    if (activeTestMatches.length === 0 || testStage === "Group" || testStage === "Complete") {
      setTestLog((current) => ["No active knockout round to score.", ...current]);
      return;
    }

    const roundPoints = completedTestMatches * getStagePointValue(testStage);
    setTestScore((current) => current + roundPoints);
    setTestLog((current) => [`Scored ${testStage}: ${completedTestMatches} winners, ${roundPoints} fake points.`, ...current]);
  }

  function handleAdvanceTestRound() {
    if (activeTestMatches.length === 0) {
      setTestLog((current) => ["Generate or complete the current round first.", ...current]);
      return;
    }

    const winners = activeTestMatches.map((match) => match.winner).filter(Boolean) as string[];
    const nextStage = getNextTestStage(testStage);

    if (winners.length !== activeTestMatches.length) {
      setTestLog((current) => ["Every match needs a winner before advancing.", ...current]);
      return;
    }

    if (nextStage === "Complete") {
      setTestStage("Complete");
      setTestLog((current) => [`Tournament complete. Fake champion: ${winners[0]}.`, ...current]);
      return;
    }

    if (nextStage === "Group") return;

    const nextMatches = buildTestMatches(nextStage, winners);
    setTestStage(nextStage);
    setTestMatches((current) => [...current, ...nextMatches]);
    setTestLog((current) => [`Advanced to ${nextStage} with ${winners.length} teams.`, ...current]);
  }

  return (
    <main className="app-shell">
      <div className="test-banner" role="status">
        Live test mode · real tournament data loaded
      </div>
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
        {adminEnabled && <TabButton label="Admin" tabName="admin" activeTab={tab} onSelect={setTab} />}
      </nav>

      {tab === "picks" && (
        <section className="screen stack" aria-labelledby="picks-title">
          <ScreenHeader
            kicker={identityConfirmed ? "Picks open" : "Test claim"}
            title={identityConfirmed ? "Make your group picks" : "Claim your test name"}
            note={identityLockedByLink
              ? `This test link is assigned to ${selectedParticipant.nickname}.`
              : identityConfirmed
                ? `Making picks as ${selectedParticipant.nickname}. Start with group winners and runners-up.`
                : "For this live test, confirm your assigned name before making picks."}
          />
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
            <button className="primary-action inline-action" type="button" onClick={handleConfirmIdentity}>
              {identityConfirmed ? `Using ${selectedParticipant.nickname}` : `Confirm ${selectedParticipant.nickname}`}
            </button>
          </section>
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
                    onClick={() => setSelectedGoldenBoot(candidate.name)}
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
                <strong>{selectedGoldenBoot || "Not picked yet"}</strong>
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
          <div className="standings-list">
            {(publicPicks.length > 0 ? publicPicks : adminOverview.map((participant) => ({
              ...participant,
              visible: participant.code === selectedParticipant.code,
              picks: null
            }))).map((person, index) => (
              <article className={`standing-row standing-${index + 1}`} key={person.nickname}>
                <div className="standing-main">
                  <div className="rank">{index + 1}</div>
                  <div>
                    <h3>{person.nickname}</h3>
                    <p>
                      {person.name} · {person.submitted ? "Submitted" : "No picks yet"}
                      {person.code === selectedParticipant.code ? " · you" : ""}
                    </p>
                  </div>
                  <strong>{person.submitted ? "✓" : "—"}</strong>
                </div>
                <details className="pick-details">
                  <summary>View {person.nickname}&apos;s picks</summary>
                  {person.visible && person.picks ? (
                    <div className="pick-sheet">
                      <p><strong>Champion:</strong> {person.picks.champion}</p>
                      <p><strong>Golden Boot:</strong> {person.picks.goldenBoot}</p>
                      <div className="review-groups">
                        {groups.map((group) => (
                          <div key={`${person.code}-${group}`}>
                            <span>Group {group}</span>
                            <strong>
                              {person.picks?.groupWinners?.[group] || "No winner"} / {person.picks?.groupRunnersUp?.[group] || "No runner-up"}
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
            ))}
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
              { label: "Group winner", value: "2 pts", note: "Awarded for each correct group winner." },
              { label: "Group runner-up", value: "1 pt", note: "Awarded for each correct runner-up." },
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
                <button className={person.venmoPaid ? "paid-pill" : "unpaid-pill"} type="button">
                  {person.venmoPaid ? "Paid" : "Unpaid"}
                </button>
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
              <button className="admin-action compact quiet" type="button" onClick={handleClearSubmissions}>
                Clear test picks
              </button>
              <button className="admin-action compact" type="button" onClick={handleExportPicks}>
                Export CSV
              </button>
              <button className="admin-action compact" type="button" onClick={loadAdminOverview}>
                Refresh
              </button>
            </div>
          </div>
          <section className="test-tournament-card" aria-labelledby="test-tournament-title">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Test tournament</p>
                <h3 id="test-tournament-title">10 minute tournament</h3>
                <p>Fast-forward later rounds without touching real pool data.</p>
              </div>
              <div className="points-pill">
                <strong>{testStage}</strong>
                <span>{testScore} fake pts</span>
              </div>
            </div>
            <div className="test-controls">
              <button className="admin-action compact" type="button" onClick={handleGenerateTestRound}>
                Generate fake R32
              </button>
              <button className="admin-action compact" type="button" onClick={handleRandomizeTestWinners}>
                Randomize winners
              </button>
              <button className="admin-action compact" type="button" onClick={handleScoreTestRound}>
                Score round
              </button>
              <button className="admin-action compact" type="button" onClick={handleAdvanceTestRound}>
                Advance round
              </button>
            </div>
            <div className="test-summary">
              <div>
                <span>Active matches</span>
                <strong>{activeTestMatches.length}</strong>
              </div>
              <div>
                <span>Winners set</span>
                <strong>{completedTestMatches}/{activeTestMatches.length}</strong>
              </div>
              <div>
                <span>Round value</span>
                <strong>{testStage === "Group" || testStage === "Complete" ? "N/A" : `${getStagePointValue(testStage)} pt`}</strong>
              </div>
            </div>
            {activeTestMatches.length > 0 && (
              <div className="test-match-list">
                {activeTestMatches.map((match) => (
                  <article className="test-match-row" key={match.id}>
                    <span>{match.id.toUpperCase()}</span>
                    <strong>{match.teamA} vs. {match.teamB}</strong>
                    <em>{match.winner ? `Winner: ${match.winner}` : "No winner yet"}</em>
                  </article>
                ))}
              </div>
            )}
            <div className="test-log" aria-label="Test tournament log">
              {testLog.slice(0, 5).map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </section>
          <div className="admin-list">
            {adminOverview.map((participant) => {
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
                    <strong>{participant.champion ? `${participant.champion} / ${participant.goldenBoot}` : "No picks on file"}</strong>
                  </div>
                  <button
                    className={`admin-action compact payment-toggle ${participant.venmoPaid ? "quiet" : ""}`}
                    type="button"
                    onClick={() => handleTogglePayment(participant)}
                  >
                    {participant.venmoPaid ? "Mark unpaid" : "Mark paid"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
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
