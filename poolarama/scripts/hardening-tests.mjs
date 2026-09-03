#!/usr/bin/env node
import assert from "node:assert/strict";

const { formatChampionScore } = await import("../lib/champion-display.ts");
const {
  deleteParticipantAfterBackup,
  getParticipantDeleteConfirmation,
  validateParticipantDeleteRequest
} = await import("../lib/participant-delete-guard.ts");

assert.equal(formatChampionScore(6, true), "6");
assert.equal(formatChampionScore(0, true), "0");
assert.equal(formatChampionScore(6, false), "TBD");

assert.equal(getParticipantDeleteConfirmation("testy"), "DELETE testy");
assert.deepEqual(
  validateParticipantDeleteRequest({
    participantCode: "testy",
    confirmation: "DELETE somebody-else",
    isSeededParticipant: false,
    participantExists: true
  }),
  {
    ok: false,
    status: 400,
    error: "Type DELETE testy to confirm deleting this participant and their submissions."
  }
);
assert.deepEqual(
  validateParticipantDeleteRequest({
    participantCode: "cheddar",
    confirmation: "DELETE cheddar",
    isSeededParticipant: true,
    participantExists: true
  }),
  { ok: false, status: 403, error: "Seeded participants cannot be deleted here." }
);
assert.deepEqual(
  validateParticipantDeleteRequest({
    participantCode: "missing",
    confirmation: "DELETE missing",
    isSeededParticipant: false,
    participantExists: false
  }),
  { ok: false, status: 404, error: "Participant not found." }
);
assert.deepEqual(
  validateParticipantDeleteRequest({
    participantCode: "testy",
    confirmation: "DELETE testy",
    isSeededParticipant: false,
    participantExists: true
  }),
  { ok: true, backupReason: "participant-delete" }
);

async function simulateDelete({ backupSucceeds }) {
  const events = [];

  try {
    const result = await deleteParticipantAfterBackup({
      createBackup: async (reason) => {
        assert.equal(reason, "participant-delete");
        events.push("backup:start");
        const backup = backupSucceeds ? { backupId: "backup-1" } : { backupId: "" };
        events.push("backup:finish");
        return backup;
      },
      deleteParticipant: async () => {
        events.push("participant:delete");
        return { deletedCount: 1 };
      },
      deleteSubmissions: async () => {
        events.push("submission:delete");
        return { deletedCount: 2 };
      }
    });

    events.push(`result:${result.deleted}:${result.submissionsDeleted}`);
  } catch (error) {
    events.push(`error:${error instanceof Error ? error.message : String(error)}`);
  }

  return events;
}

assert.deepEqual(await simulateDelete({ backupSucceeds: false }), [
  "backup:start",
  "backup:finish",
  "error:Backup failed; participant was not deleted."
]);
assert.deepEqual(await simulateDelete({ backupSucceeds: true }), [
  "backup:start",
  "backup:finish",
  "participant:delete",
  "submission:delete",
  "result:1:2"
]);

console.log(JSON.stringify({ ok: true }, null, 2));
