import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { findKnownParticipant } from "@/lib/known-participants";
import { defaultPoolSlug, setMockParticipantPayment } from "@/lib/mock-api-data";
import ParticipantModel from "@/models/Participant";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const participantCode = typeof body.participantCode === "string" ? body.participantCode : "";
    const venmoPaid = Boolean(body.venmoPaid);
    const participant = findKnownParticipant(participantCode);
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      const updatedParticipant = setMockParticipantPayment(participant.code, venmoPaid);

      return NextResponse.json({
        participant: updatedParticipant,
        storageMode: "mock"
      });
    }

    const updatedParticipant = await ParticipantModel.findOneAndUpdate(
      { poolSlug: defaultPoolSlug, participantCode: participant.code },
      {
        $set: {
          poolSlug: defaultPoolSlug,
          participantCode: participant.code,
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
