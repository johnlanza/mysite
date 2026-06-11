export type KnownParticipant = {
  code: string;
  inviteCode?: string;
  name: string;
  nickname: string;
  venmoPaid: boolean;
};

export const allKnownParticipants: KnownParticipant[] = [
  { code: "cheddar", name: "John Lanza", nickname: "Cheddar", venmoPaid: false },
  { code: "fall-guy", name: "G-Man Lanza", nickname: "Fall Guy", venmoPaid: false },
  { code: "jessie", name: "Jessie", nickname: "Jessie", venmoPaid: false },
  { code: "ruby", name: "Ruby Lanza", nickname: "Ruby", venmoPaid: false },
  { code: "kellyn", name: "Kellyn Lanza", nickname: "Kellyn", venmoPaid: false },
  { code: "brett", name: "Brett Lanza", nickname: "Brett", venmoPaid: false },
  { code: "irish-eyes", name: "Eileen Lanza", nickname: "Irish Eyes", venmoPaid: false },
  { code: "jeff-lanza", name: "Jeff Lanza", nickname: "Jeff Lanza", venmoPaid: false },
  { code: "cleatus-the-great", name: "Jack Lee Lanza", nickname: "Cleatus the Great", venmoPaid: false },
  { code: "quinn", name: "Quinn Lanza", nickname: "Quinn", venmoPaid: false }
];

export const retiredParticipantCodes = new Set(["jessie"]);

export const knownParticipants = allKnownParticipants.filter(
  (participant) => !retiredParticipantCodes.has(participant.code)
);

export const defaultParticipant = knownParticipants[0];

export function isRetiredParticipant(code: string | null | undefined) {
  return Boolean(code && retiredParticipantCodes.has(code));
}

export function findKnownParticipant(code: string | null | undefined) {
  return knownParticipants.find((participant) => participant.code === code) || defaultParticipant;
}
