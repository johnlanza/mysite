import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug, mockStandings } from "@/lib/mock-api-data";
import ParticipantModel from "@/models/Participant";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({ standings: mockStandings, storageMode: "mock" });
    }

    const participants = await ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean();

    if (participants.length === 0) {
      return NextResponse.json({ standings: mockStandings, storageMode: "mongo", seeded: false });
    }

    return NextResponse.json({
      standings: mockStandings.map((standing) => {
        const participant = participants.find(
          (item) => item.nickname === standing.nickname || item.name === standing.name
        );

        return participant
          ? {
              ...standing,
              paid: participant.venmoPaid
            }
          : standing;
      }),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/standings failed", error);

    return NextResponse.json({
      standings: mockStandings,
      storageMode: "mock",
      warning: "Database unavailable; using mock standings."
    });
  }
}
