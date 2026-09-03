import type { PoolaramaBackupReason } from "@/lib/poolarama-backup";

export type ParticipantDeleteGuardResult =
  | { ok: false; status: number; error: string }
  | { ok: true; backupReason: PoolaramaBackupReason };

type BackupResult = {
  backupId?: string;
};

type DeleteResult = {
  deletedCount?: number;
};

export function getParticipantDeleteConfirmation(participantCode: string) {
  return `DELETE ${participantCode}`;
}

export function validateParticipantDeleteRequest({
  participantCode,
  confirmation,
  isSeededParticipant,
  participantExists
}: {
  participantCode: string;
  confirmation?: string;
  isSeededParticipant: boolean;
  participantExists: boolean;
}): ParticipantDeleteGuardResult {
  if (!participantCode) {
    return { ok: false, status: 400, error: "Participant code is required." };
  }

  const expectedConfirmation = getParticipantDeleteConfirmation(participantCode);

  if (confirmation !== expectedConfirmation) {
    return {
      ok: false,
      status: 400,
      error: `Type ${expectedConfirmation} to confirm deleting this participant and their submissions.`
    };
  }

  if (isSeededParticipant) {
    return { ok: false, status: 403, error: "Seeded participants cannot be deleted here." };
  }

  if (!participantExists) {
    return { ok: false, status: 404, error: "Participant not found." };
  }

  return { ok: true, backupReason: "participant-delete" };
}

export async function deleteParticipantAfterBackup({
  createBackup,
  deleteParticipant,
  deleteSubmissions
}: {
  createBackup: (reason: PoolaramaBackupReason) => Promise<BackupResult>;
  deleteParticipant: () => Promise<DeleteResult>;
  deleteSubmissions: () => Promise<DeleteResult>;
}) {
  const backup = await createBackup("participant-delete");

  if (!backup.backupId) {
    throw new Error("Backup failed; participant was not deleted.");
  }

  const [participantResult, submissionResult] = await Promise.all([
    deleteParticipant(),
    deleteSubmissions()
  ]);

  return {
    backup,
    deleted: participantResult.deletedCount || 0,
    submissionsDeleted: submissionResult.deletedCount || 0
  };
}
