import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { knownParticipants } from "@/lib/known-participants";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { generateInviteCode, slugifyParticipantCode } from "@/lib/participant-utils";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 80;
}

export async function POST(request: NextRequest) {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable; cannot add live participants." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = isValidName(body.name) ? body.name.trim() : "";
    const nickname = isValidName(body.nickname) ? body.nickname.trim() : name;

    if (!name || !nickname) {
      return NextResponse.json(
        { error: "Name and nickname are required." },
        { status: 400 }
      );
    }

    const codeBase = slugifyParticipantCode(nickname || name);
    let participantCode = codeBase;
    let suffix = 2;

    while (await ParticipantModel.exists({ poolSlug: defaultPoolSlug, participantCode })) {
      participantCode = `${codeBase}-${suffix}`;
      suffix += 1;
    }

    const participant = await ParticipantModel.create({
      poolSlug: defaultPoolSlug,
      participantCode,
      inviteCode: generateInviteCode(participantCode),
      name,
      nickname,
      venmoPaid: false,
      paidAt: null,
      isAdmin: false
    });

    return NextResponse.json({
      participant: {
        code: participant.participantCode,
        inviteCode: participant.inviteCode,
        name: participant.name,
        nickname: participant.nickname,
        venmoPaid: participant.venmoPaid
      },
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/participants failed", error);

    return NextResponse.json(
      { error: "Could not add participant." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable; cannot delete participants." },
        { status: 503 }
      );
    }

    const participantCode = request.nextUrl.searchParams.get("code") || "";

    if (!participantCode) {
      return NextResponse.json(
        { error: "Participant code is required." },
        { status: 400 }
      );
    }

    if (knownParticipants.some((participant) => participant.code === participantCode)) {
      return NextResponse.json(
        { error: "Seeded participants cannot be deleted here." },
        { status: 403 }
      );
    }

    const [participantResult, submissionResult] = await Promise.all([
      ParticipantModel.deleteOne({ poolSlug: defaultPoolSlug, participantCode }),
      SubmissionModel.deleteMany({ poolSlug: defaultPoolSlug, participantCode })
    ]);

    return NextResponse.json({
      deleted: participantResult.deletedCount,
      submissionsDeleted: submissionResult.deletedCount,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/participants DELETE failed", error);

    return NextResponse.json(
      { error: "Could not delete participant." },
      { status: 500 }
    );
  }
}
