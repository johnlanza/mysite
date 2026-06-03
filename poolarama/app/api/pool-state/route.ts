import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({ pool: buildPoolState(null), storageMode: "mock" });
    }

    const pool = await getOrCreateDefaultPool();

    return NextResponse.json({ pool: buildPoolState(pool), storageMode: "mongo" });
  } catch (error) {
    console.error("Poolarama /api/pool-state failed", error);

    return NextResponse.json({ pool: buildPoolState(null), storageMode: "mock" });
  }
}
