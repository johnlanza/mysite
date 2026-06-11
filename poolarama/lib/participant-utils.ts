import { isRetiredParticipant, knownParticipants, type KnownParticipant } from "@/lib/known-participants";

export type ParticipantRecord = KnownParticipant & {
  inviteCode?: string | null;
  createdAt?: Date | string;
};

export function slugifyParticipantCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function participantFromMongo(item: {
  participantCode: string;
  inviteCode?: string | null;
  name: string;
  nickname: string;
  venmoPaid?: boolean;
  createdAt?: Date;
}): ParticipantRecord {
  return {
    code: item.participantCode,
    inviteCode: item.inviteCode || undefined,
    name: item.name,
    nickname: item.nickname,
    venmoPaid: Boolean(item.venmoPaid),
    createdAt: item.createdAt
  };
}

export function mergeKnownAndMongoParticipants(mongoParticipants: ParticipantRecord[]) {
  const participantMap = new Map<string, ParticipantRecord>();

  for (const participant of knownParticipants) {
    participantMap.set(participant.code, participant);
  }

  for (const participant of mongoParticipants.filter((participant) => !isRetiredParticipant(participant.code))) {
    participantMap.set(participant.code, participant);
  }

  return Array.from(participantMap.values());
}

export function generateInviteCode(seed = "") {
  const suffix = Math.random().toString(36).slice(2, 10);
  const prefix = slugifyParticipantCode(seed).slice(0, 18) || "player";

  return `${prefix}-${suffix}`;
}
