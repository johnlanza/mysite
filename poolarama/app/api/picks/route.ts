import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { findKnownParticipant, knownParticipants } from "@/lib/known-participants";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import type { PoolSubmissionPicks } from "@/lib/poolarama-types";
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
    groupWinners: normalizeGroupPicks(candidate?.groupWinners),
    groupRunnersUp: normalizeGroupPicks(candidate?.groupRunnersUp),
    matchWinners: candidate?.matchWinners || {}
  };
}

function normalizeGroupPicks(picks: unknown) {
  if (!picks) return {};
  if (picks instanceof Map) return Object.fromEntries(picks.entries());
  if (typeof picks === "object") return picks as Record<string, string>;
  return {};
}

export async function GET(request: NextRequest) {
  const viewer = findKnownParticipant(request.nextUrl.searchParams.get("viewerCode"));

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({
        participants: knownParticipants.map((participant) => ({
          code: participant.code,
          name: participant.name,
          nickname: participant.nickname,
          submitted: false,
          submittedAt: null,
          visible: participant.code === viewer.code,
          picks: null
        })),
        pool: buildPoolState(null),
        storageMode: "mock"
      });
    }

    const [pool, participants, submissions] = await Promise.all([
      getOrCreateDefaultPool(),
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean()
    ]);
    const poolState = buildPoolState(pool);
    const isLocked = poolState.preTournament.status === "locked";

    return NextResponse.json({
      participants: knownParticipants.map((knownParticipant) => {
        const participant =
          participants.find((item) => item.participantCode === knownParticipant.code) || null;
        const submission =
          submissions.find((item) => item.participantCode === knownParticipant.code) || null;
        const visible = isLocked || knownParticipant.code === viewer.code;

        return {
          code: knownParticipant.code,
          name: participant?.name || knownParticipant.name,
          nickname: participant?.nickname || knownParticipant.nickname,
          submitted: Boolean(submission),
          submittedAt: submission?.submittedAt?.toISOString() || null,
          visible,
          picks: visible && submission ? normalizePicks(submission.picks) : null
        };
      }),
      pool: poolState,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/picks failed", error);

    return NextResponse.json(
      { error: "Could not load pick visibility." },
      { status: 500 }
    );
  }
}
