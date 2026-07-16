import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        matches: [],
        pool: buildPoolState(null),
        storageMode: "mock"
      });
    }

    const pool = await getOrCreateDefaultPool();
    const poolState = buildPoolState(pool);
    const publicRound = poolState.final.status === "open" || poolState.final.status === "locked";
    const matches = publicRound
      ? await MatchModel.find({ poolSlug: defaultPoolSlug, stage: "final" }).sort({ order: 1 }).lean()
      : [];

    return NextResponse.json({
      matches,
      pool: poolState,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/final failed", error);

    if (!allowMockFallback()) return poolDataUnavailableResponse();

    return NextResponse.json(
      { error: "Could not load Final." },
      { status: 500 }
    );
  }
}
