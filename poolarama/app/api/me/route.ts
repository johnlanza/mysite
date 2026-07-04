import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import {
  defaultPoolSlug,
  getMockSubmission
} from "@/lib/mock-api-data";
import { isRetiredParticipant } from "@/lib/known-participants";
import type { PoolSubmissionPicks, SavedSubmission } from "@/lib/poolarama-types";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";

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
  const requestedCode = request.nextUrl.searchParams.get("code") || "";

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        storageMode: "mock",
        participant: null,
        submission: null
      });
    }

    if (!requestedCode) {
      return NextResponse.json(
        { error: "Invite link required." },
        { status: 404 }
      );
    }

    const existingParticipant = requestedCode ? await ParticipantModel.findOne({
      poolSlug: defaultPoolSlug,
      inviteCode: requestedCode
    }).lean() : null;

    if (
      !existingParticipant ||
      existingParticipant.inviteCode === existingParticipant.participantCode ||
      isRetiredParticipant(existingParticipant.participantCode)
    ) {
      return NextResponse.json(
        { error: "Invite link not found." },
        { status: 404 }
      );
    }

    const participant = existingParticipant;
    const submissions = await SubmissionModel.find({
      poolSlug: defaultPoolSlug,
      participantCode: participant.participantCode
    })
      .sort({ submittedAt: -1 })
      .lean();
    const preTournamentSubmission = submissions.find((submission) => submission.stage === "preTournament") || null;
    const r32Submission = submissions.find((submission) => submission.stage === "r32") || null;
    const r16Submission = submissions.find((submission) => submission.stage === "r16") || null;
    const qfSubmission = submissions.find((submission) => submission.stage === "qf") || null;
    const toResponseSubmission = (submission: typeof preTournamentSubmission): SavedSubmission | null => submission
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
    const responseSubmission = toResponseSubmission(preTournamentSubmission);

    return NextResponse.json({
      storageMode: "mongo",
      participant: {
        code: participant.participantCode,
        inviteCode: participant.inviteCode,
        name: participant.name,
        nickname: participant.nickname,
        venmoPaid: participant.venmoPaid
      },
      submission: responseSubmission,
      submissions: {
        preTournament: responseSubmission,
        r32: toResponseSubmission(r32Submission),
        r16: toResponseSubmission(r16Submission),
        qf: toResponseSubmission(qfSubmission)
      }
    });
  } catch (error) {
    console.error("Poolarama /api/me failed", error);

    if (!allowMockFallback()) return poolDataUnavailableResponse();

    return NextResponse.json({
      storageMode: "mock",
      participant: null,
      submission: getMockSubmission(),
      warning: "Database unavailable; using mock prototype data."
    });
  }
}
