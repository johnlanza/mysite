export type KnownParticipant = {
  code: string;
  name: string;
  nickname: string;
  venmoPaid: boolean;
};

export const knownParticipants: KnownParticipant[] = [
  { code: "cheddar", name: "John", nickname: "Cheddar", venmoPaid: false },
  { code: "fall-guy", name: "Fall Guy", nickname: "Fall Guy", venmoPaid: false },
  { code: "jessie", name: "Jessie", nickname: "Jessie", venmoPaid: false },
  { code: "ruby", name: "Ruby", nickname: "Ruby", venmoPaid: false },
  { code: "kellyn", name: "Kellyn", nickname: "Kellyn", venmoPaid: false },
  { code: "brett", name: "Brett Lanza", nickname: "Brett", venmoPaid: false },
  { code: "irish-eyes", name: "Eileen", nickname: "Irish Eyes", venmoPaid: false },
  { code: "jeff-lanza", name: "Jeff Lanza", nickname: "Jeff Lanza", venmoPaid: false },
  { code: "cleatus-the-great", name: "Jeff Lanza", nickname: "Cleatus the Great", venmoPaid: false },
  { code: "quinn", name: "Quinn", nickname: "Quinn", venmoPaid: false }
];

export const defaultParticipant = knownParticipants[0];

export function findKnownParticipant(code: string | null | undefined) {
  return knownParticipants.find((participant) => participant.code === code) || defaultParticipant;
}
