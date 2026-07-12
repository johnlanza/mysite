import { defaultPoolSlug } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import BackupModel from "@/models/Backup";
import GroupStandingModel from "@/models/GroupStanding";
import MatchModel from "@/models/Match";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export type PoolaramaBackupReason =
  | "manual"
  | "r32-open"
  | "r32-lock"
  | "r32-score"
  | "r32-sync"
  | "r32-reset"
  | "r16-open"
  | "r16-lock"
  | "r16-score"
  | "r16-sync"
  | "qf-open"
  | "qf-lock"
  | "qf-score"
  | "qf-sync"
  | "sf-open"
  | "sf-lock"
  | "sf-score"
  | "sf-sync";

export async function buildPoolaramaBackupSnapshot(reason: PoolaramaBackupReason = "manual") {
  const [pool, participants, submissions, groupStandings, matches] = await Promise.all([
    getOrCreateDefaultPool(),
    ParticipantModel.find({ poolSlug: defaultPoolSlug }).sort({ participantCode: 1 }).lean(),
    SubmissionModel.find({ poolSlug: defaultPoolSlug }).sort({ participantCode: 1, stage: 1 }).lean(),
    GroupStandingModel.find({ poolSlug: defaultPoolSlug }).sort({ group: 1, rank: 1 }).lean(),
    MatchModel.find({ poolSlug: defaultPoolSlug }).sort({ stage: 1, order: 1 }).lean()
  ]);
  const activeRoster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
  const activeParticipantCodes = new Set(activeRoster.map((participant) => participant.code));
  const activePreTournamentSubmissions = submissions.filter((submission) =>
    submission.stage === "preTournament" && activeParticipantCodes.has(submission.participantCode)
  );

  return {
    createdAt: new Date().toISOString(),
    reason,
    poolSlug: defaultPoolSlug,
    pool: buildPoolState(pool),
    rawPool: pool.toObject(),
    activeRoster,
    participants,
    submissions,
    groupStandings,
    matches,
    counts: {
      participants: activeRoster.length,
      rawParticipants: participants.length,
      submissions: submissions.length,
      preTournamentSubmissions: activePreTournamentSubmissions.length,
      rawPreTournamentSubmissions: submissions.filter((submission) => submission.stage === "preTournament").length,
      groupStandings: groupStandings.length,
      matches: matches.length
    }
  };
}

export async function createPoolaramaBackup(reason: PoolaramaBackupReason) {
  const snapshot = await buildPoolaramaBackupSnapshot(reason);
  const backup = await BackupModel.create({
    poolSlug: defaultPoolSlug,
    reason,
    snapshot
  });

  return {
    backupId: backup._id.toString(),
    backupCreatedAt: backup.createdAt.toISOString(),
    backupReason: reason,
    counts: snapshot.counts
  };
}
