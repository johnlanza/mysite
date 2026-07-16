import type { AdminParticipantOverview, SavedSubmission, StandingParticipant } from "@/lib/poolarama-types";
import { defaultParticipant, knownParticipants } from "@/lib/known-participants";

export const defaultPoolSlug = "mens-world-cup-2026";
export const defaultParticipantCode = defaultParticipant.code;
export const defaultParticipantName = defaultParticipant.name;

export const mockStandings: StandingParticipant[] = [
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

const mockSubmissions = new Map<string, SavedSubmission>();
const mockPaymentOverrides = new Map<string, boolean>();

export function getMockSubmission(participantCode = defaultParticipantCode) {
  return mockSubmissions.get(participantCode) || null;
}

export function setMockSubmission(submission: SavedSubmission) {
  mockSubmissions.set(submission.participantCode, submission);
  return submission;
}

export function getMockAdminOverview(): AdminParticipantOverview[] {
  return knownParticipants.map((participant) => {
    const submission = mockSubmissions.get(participant.code) || null;
    const venmoPaid = mockPaymentOverrides.get(participant.code) ?? participant.venmoPaid;

    return {
      code: participant.code,
      name: participant.name,
      nickname: participant.nickname,
      venmoPaid,
      submitted: Boolean(submission),
      submittedAt: submission?.submittedAt || null,
      r32Submitted: false,
      r32SubmittedAt: null,
      r16Submitted: false,
      r16SubmittedAt: null,
      qfSubmitted: false,
      qfSubmittedAt: null,
      sfSubmitted: false,
      sfSubmittedAt: null,
      finalSubmitted: false,
      finalSubmittedAt: null,
      champion: submission?.picks.champion || null,
      goldenBoot: submission?.picks.goldenBoot || null
    };
  });
}

export function setMockParticipantPayment(participantCode: string, venmoPaid: boolean) {
  mockPaymentOverrides.set(participantCode, venmoPaid);
  return getMockAdminOverview().find((participant) => participant.code === participantCode) || null;
}
