import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import {
  defaultPoolSlug
} from "@/lib/mock-api-data";
import { findKnownParticipant, isRetiredParticipant, knownParticipants } from "@/lib/known-participants";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import type { PoolStage, PoolSubmissionPicks, SavedSubmission } from "@/lib/poolarama-types";
import { isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

const validStages = new Set<PoolStage>(["preTournament", "r32", "r16", "qf", "sf", "final"]);

function isValidPickText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
}

function parsePicks(body: Record<string, unknown>, stage: PoolStage): PoolSubmissionPicks {
  const picks = (body.picks || {}) as Partial<PoolSubmissionPicks>;
  const champion = picks.champion;
  const goldenBoot = picks.goldenBoot;

  if (stage === "r32" || stage === "r16" || stage === "qf") {
    const matchWinners = picks.matchWinners || {};

    if (Object.keys(matchWinners).length === 0) {
      throw new Error(`${stage === "r32" ? "Round of 32" : stage === "r16" ? "Round of 16" : "Quarterfinal"} picks are required.`);
    }

    return {
      champion: typeof champion === "string" ? champion.trim() : "",
      goldenBoot: typeof goldenBoot === "string" ? goldenBoot.trim() : "",
      groupFilter: picks.groupFilter || "All",
      roundOf32Winner: typeof picks.roundOf32Winner === "string" ? picks.roundOf32Winner.trim() : "",
      groupWinners: picks.groupWinners || {},
      groupRunnersUp: picks.groupRunnersUp || {},
      matchWinners
    };
  }

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
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const stage = validStages.has(body.stage as PoolStage) ? (body.stage as PoolStage) : "preTournament";
    const participantCode = typeof body.participantCode === "string" ? body.participantCode : "";

    if (isRetiredParticipant(participantCode)) {
      return NextResponse.json(
        { error: "Participant is not active for this pool." },
        { status: 403 }
      );
    }

    let selectedParticipant = findKnownParticipant(participantCode);
    const picks = parsePicks(body, stage);
    const submittedAt = new Date();
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return poolDataUnavailableResponse();
    }

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

    const baseSubmission = {
      poolSlug: defaultPoolSlug,
      participantCode: selectedParticipant.code,
      participantName: selectedParticipant.name,
      stage,
      picks,
      submittedAt: submittedAt.toISOString()
    };
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

    if (stage === "r32" || stage === "r16" || stage === "qf") {
      const pool = await getOrCreateDefaultPool();
      const roundLabel = stage === "r32" ? "Round of 32" : stage === "r16" ? "Round of 16" : "Quarterfinal";
      const expectedMatches = stage === "r32" ? 16 : stage === "r16" ? 8 : 4;
      const roundStatus = stage === "r32" ? pool.r32Status : stage === "r16" ? pool.r16Status : pool.qfStatus;

      if (roundStatus !== "open") {
        return NextResponse.json(
          { error: `${roundLabel} picks are not open.` },
          { status: 423 }
        );
      }

      const matches = await MatchModel.find({ poolSlug: defaultPoolSlug, stage }).lean();
      const matchWinners = picks.matchWinners || {};

      if (matches.length !== expectedMatches || Object.keys(matchWinners).length !== matches.length) {
        return NextResponse.json(
          { error: `Pick every ${roundLabel} winner before submitting.` },
          { status: 400 }
        );
      }

      const invalidPick = matches.some((match) => {
        const winner = matchWinners[match.matchId];
        return winner !== match.teamA && winner !== match.teamB;
      });

      if (invalidPick) {
        return NextResponse.json(
          { error: `${roundLabel} picks include an invalid matchup winner.` },
          { status: 400 }
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
