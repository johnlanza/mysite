import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { knownParticipants } from "@/lib/known-participants";
import { defaultPoolSlug, getMockAdminOverview } from "@/lib/mock-api-data";
import { generateInviteCode } from "@/lib/participant-utils";
import { allowMockFallback, isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import ParticipantModel from "@/models/Participant";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        participants: getMockAdminOverview(),
        seeded: knownParticipants.length,
        storageMode: "mock",
        warning: "Mongo is not configured; using known participants as mock data."
      });
    }

    for (const participant of knownParticipants) {
      const existingParticipant = await ParticipantModel.findOne({
        poolSlug: defaultPoolSlug,
        participantCode: participant.code
      }).lean();
      const inviteCode = existingParticipant?.inviteCode || generateInviteCode(participant.code);

      await ParticipantModel.findOneAndUpdate(
        { poolSlug: defaultPoolSlug, participantCode: participant.code },
        {
          $set: {
            name: participant.name,
            nickname: participant.nickname,
            venmoPaid: participant.venmoPaid,
            paidAt: participant.venmoPaid ? new Date() : null,
            inviteCode
          },
          $setOnInsert: {
            poolSlug: defaultPoolSlug,
            participantCode: participant.code,
            isAdmin: false
          }
        },
        { new: true, upsert: true }
      );
    }

    const participants = await ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean();

    return NextResponse.json({
      participants,
      seeded: knownParticipants.length,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/seed-participants failed", error);

    return NextResponse.json(
      { error: "Could not seed participants." },
      { status: 500 }
    );
  }
}
