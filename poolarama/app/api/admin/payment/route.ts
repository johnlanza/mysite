import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { findKnownParticipant, knownParticipants } from "@/lib/known-participants";
import { defaultPoolSlug, setMockParticipantPayment } from "@/lib/mock-api-data";
import ParticipantModel from "@/models/Participant";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const participantCode = typeof body.participantCode === "string" ? body.participantCode : "";
    const venmoPaid = Boolean(body.venmoPaid);
    let participant = findKnownParticipant(participantCode);
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      const updatedParticipant = setMockParticipantPayment(participant.code, venmoPaid);

      return NextResponse.json({
        participant: updatedParticipant,
        storageMode: "mock"
      });
    }

    const existingParticipant = await ParticipantModel.findOne({
      poolSlug: defaultPoolSlug,
      participantCode
    }).lean();

    if (!existingParticipant && !knownParticipants.some((knownParticipant) => knownParticipant.code === participantCode)) {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 }
      );
    }

    if (existingParticipant) {
      participant = {
        code: existingParticipant.participantCode,
        name: existingParticipant.name,
        nickname: existingParticipant.nickname,
        venmoPaid: existingParticipant.venmoPaid
      };
    }

    const updatedParticipant = await ParticipantModel.findOneAndUpdate(
      { poolSlug: defaultPoolSlug, participantCode: participant.code },
      {
        $set: {
          poolSlug: defaultPoolSlug,
          participantCode: participant.code,
          inviteCode: existingParticipant?.inviteCode || participant.code,
          name: participant.name,
          nickname: participant.nickname,
          venmoPaid,
          paidAt: venmoPaid ? new Date() : null
        }
      },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({
      participant: updatedParticipant,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/payment failed", error);

    return NextResponse.json(
      { error: "Could not update payment status." },
      { status: 400 }
    );
  }
}
