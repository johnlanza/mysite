import type { GroupId } from "@/lib/tournament-data";

export type PoolStage = "preTournament" | "r32" | "r16" | "qf" | "sf" | "final";

export type PoolStatus = "setup" | "open" | "locked" | "scoring" | "final";

export type PoolSubmissionPicks = {
  champion: string;
  goldenBoot: string;
  groupFilter?: GroupId | "All";
  roundOf32Winner?: string;
  groupWinners?: Partial<Record<GroupId, string>>;
  groupRunnersUp?: Partial<Record<GroupId, string>>;
  matchWinners?: Record<string, string>;
};

export type SavedSubmission = {
  poolSlug: string;
  participantCode: string;
  participantName: string;
  stage: PoolStage;
  picks: PoolSubmissionPicks;
  submittedAt: string;
  storageMode: "mongo" | "mock";
};

export type StandingParticipant = {
  name: string;
  nickname: string;
  points: number;
  paid: boolean;
  champion: string;
  picks: {
    champion: string;
    goldenBoot: string;
    groups: string;
    groupPickScores?: Partial<Record<GroupId, {
      winner: number;
      runnerUp: number;
    }>>;
    knockout: string[];
  };
  scoring: {
    label: string;
    value: number;
  }[];
};

export type AdminParticipantOverview = {
  code: string;
  inviteCode?: string;
  name: string;
  nickname: string;
  venmoPaid: boolean;
  submitted: boolean;
  submittedAt: string | null;
  r32Submitted: boolean;
  r32SubmittedAt: string | null;
  r16Submitted: boolean;
  r16SubmittedAt: string | null;
  champion: string | null;
  goldenBoot: string | null;
};
