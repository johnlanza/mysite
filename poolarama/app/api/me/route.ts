import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import {
  defaultPoolSlug,
  getMockSubmission
} from "@/lib/mock-api-data";
import { findKnownParticipant } from "@/lib/known-participants";
import type { PoolSubmissionPicks, SavedSubmission } from "@/lib/poolarama-types";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

function normalizePicks(picks: unknown): PoolSubmissionPicks {
  const candidate = picks as Partial<PoolSubmissionPicks> | null;

  return {
    champion: candidate?.champion || "",
    goldenBoot: candidate?.goldenBoot || "",
    groupFilter: candidate?.groupFilter || "All",
    roundOf32Winner: candidate?.roundOf32Winner || "",
    groupWinners: candidate?.groupWinners || {},
    groupRunnersUp: candidate?.groupRunnersUp || {},
    matchWinners: candidate?.matchWinners || {}
  };
}

export async function GET(request: NextRequest) {
  const selectedParticipant = findKnownParticipant(request.nextUrl.searchParams.get("code"));

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({
        storageMode: "mock",
        participant: {
          code: selectedParticipant.code,
          name: selectedParticipant.name,
          nickname: selectedParticipant.nickname,
          venmoPaid: selectedParticipant.venmoPaid
        },
        submission: getMockSubmission(selectedParticipant.code)
      });
    }

    const participant = await ParticipantModel.findOneAndUpdate(
      { poolSlug: defaultPoolSlug, participantCode: selectedParticipant.code },
      {
        $setOnInsert: {
          poolSlug: defaultPoolSlug,
          participantCode: selectedParticipant.code,
          name: selectedParticipant.name,
          nickname: selectedParticipant.nickname,
          venmoPaid: selectedParticipant.venmoPaid
        }
      },
      { new: true, upsert: true }
    ).lean();
    const submission = await SubmissionModel.findOne({
      poolSlug: defaultPoolSlug,
      participantCode: selectedParticipant.code,
      stage: "preTournament"
    })
      .sort({ submittedAt: -1 })
      .lean();
    const responseSubmission: SavedSubmission | null = submission
      ? {
          poolSlug: submission.poolSlug,
          participantCode: submission.participantCode,
          participantName: participant.name,
          stage: submission.stage,
          picks: normalizePicks(submission.picks),
          submittedAt: submission.submittedAt.toISOString(),
          storageMode: "mongo"
        }
      : null;

    return NextResponse.json({
      storageMode: "mongo",
      participant: {
        code: participant.participantCode,
        name: participant.name,
        nickname: participant.nickname,
        venmoPaid: participant.venmoPaid
      },
      submission: responseSubmission
    });
  } catch (error) {
    console.error("Poolarama /api/me failed", error);

    return NextResponse.json({
      storageMode: "mock",
      participant: {
        code: selectedParticipant.code,
        name: selectedParticipant.name,
        nickname: selectedParticipant.nickname,
        venmoPaid: selectedParticipant.venmoPaid
      },
      submission: getMockSubmission(selectedParticipant.code),
      warning: "Database unavailable; using mock prototype data."
    });
  }
}
