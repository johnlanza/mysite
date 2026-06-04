import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import {
  defaultPoolSlug,
  setMockSubmission
} from "@/lib/mock-api-data";
import { findKnownParticipant, knownParticipants } from "@/lib/known-participants";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import type { PoolStage, PoolSubmissionPicks, SavedSubmission } from "@/lib/poolarama-types";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

const validStages = new Set<PoolStage>(["preTournament", "r32", "r16", "qf", "sf", "final"]);

function isValidPickText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
}

function parsePicks(body: Record<string, unknown>): PoolSubmissionPicks {
  const picks = (body.picks || {}) as Partial<PoolSubmissionPicks>;
  const champion = picks.champion;
  const goldenBoot = picks.goldenBoot;

  if (!isValidPickText(champion)) {
    throw new Error("Champion pick is required.");
  }

  if (!isValidPickText(goldenBoot)) {
    throw new Error("Golden Boot pick is required.");
  }

  return {
    champion: champion.trim(),
    goldenBoot: goldenBoot.trim(),
    groupFilter: picks.groupFilter || "All",
    roundOf32Winner: typeof picks.roundOf32Winner === "string" ? picks.roundOf32Winner.trim() : "",
    groupWinners: picks.groupWinners || {},
    groupRunnersUp: picks.groupRunnersUp || {},
    matchWinners: picks.matchWinners || {}
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const stage = validStages.has(body.stage as PoolStage) ? (body.stage as PoolStage) : "preTournament";
    const participantCode = typeof body.participantCode === "string" ? body.participantCode : "";
    let selectedParticipant = findKnownParticipant(participantCode);
    const picks = parsePicks(body);
    const submittedAt = new Date();
    const db = await connectToPoolaramaDatabase();

    if (db) {
      const participant = await ParticipantModel.findOne({
        poolSlug: defaultPoolSlug,
        participantCode
      }).lean();

      if (!participant && !knownParticipants.some((knownParticipant) => knownParticipant.code === participantCode)) {
        return NextResponse.json(
          { error: "Participant not found." },
          { status: 404 }
        );
      }

      if (participant) {
        selectedParticipant = {
          code: participant.participantCode,
          name: participant.name,
          nickname: participant.nickname,
          venmoPaid: participant.venmoPaid
        };
      }
    }

    const baseSubmission = {
      poolSlug: defaultPoolSlug,
      participantCode: selectedParticipant.code,
      participantName: selectedParticipant.name,
      stage,
      picks,
      submittedAt: submittedAt.toISOString()
    };
    if (!db) {
      const mockSubmission = setMockSubmission({
        ...baseSubmission,
        storageMode: "mock"
      });

      return NextResponse.json({ submission: mockSubmission, storageMode: "mock" });
    }

    if (stage === "preTournament") {
      const pool = await getOrCreateDefaultPool();
      const poolState = buildPoolState(pool);

      if (poolState.preTournament.status === "locked") {
        return NextResponse.json(
          { error: "Pre-tournament picks are locked." },
          { status: 423 }
        );
      }
    }

    await ParticipantModel.findOneAndUpdate(
      { poolSlug: defaultPoolSlug, participantCode: selectedParticipant.code },
      {
        $setOnInsert: {
          poolSlug: defaultPoolSlug,
          participantCode: selectedParticipant.code,
          inviteCode: selectedParticipant.code,
          name: selectedParticipant.name,
          nickname: selectedParticipant.nickname,
          venmoPaid: selectedParticipant.venmoPaid
        }
      },
      { new: true, upsert: true }
    );
    await SubmissionModel.findOneAndUpdate(
      { poolSlug: defaultPoolSlug, participantCode: selectedParticipant.code, stage },
      {
        $set: {
          poolSlug: defaultPoolSlug,
          participantCode: selectedParticipant.code,
          stage,
          locked: false,
          picks,
          submittedAt
        }
      },
      { new: true, upsert: true }
    );

    const savedSubmission: SavedSubmission = {
      ...baseSubmission,
      storageMode: "mongo"
    };

    return NextResponse.json({ submission: savedSubmission, storageMode: "mongo" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save picks.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
