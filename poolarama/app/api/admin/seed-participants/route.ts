import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { knownParticipants } from "@/lib/known-participants";
import { defaultPoolSlug, getMockAdminOverview } from "@/lib/mock-api-data";
import ParticipantModel from "@/models/Participant";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({
        participants: getMockAdminOverview(),
        seeded: knownParticipants.length,
        storageMode: "mock",
        warning: "Mongo is not configured; using known participants as mock data."
      });
    }

    await Promise.all(
      knownParticipants.map((participant) =>
        ParticipantModel.findOneAndUpdate(
          { poolSlug: defaultPoolSlug, participantCode: participant.code },
          {
            $set: {
              name: participant.name,
              nickname: participant.nickname,
              venmoPaid: participant.venmoPaid,
              paidAt: participant.venmoPaid ? new Date() : null
            },
            $setOnInsert: {
              poolSlug: defaultPoolSlug,
              participantCode: participant.code,
              isAdmin: false
            }
          },
          { new: true, upsert: true }
        )
      )
    );

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
