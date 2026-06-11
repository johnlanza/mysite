import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse } from "@/lib/runtime-safety";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const nextStatus = body.preTournamentStatus === "locked" ? "locked" : "open";
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Mongo is required to lock picks." },
        { status: 503 }
      );
    }

    const pool = await getOrCreateDefaultPool();
    pool.preTournamentStatus = nextStatus;
    pool.preTournamentLockedAt = nextStatus === "locked" ? new Date() : null;
    await pool.save();

    return NextResponse.json({ pool: buildPoolState(pool), storageMode: "mongo" });
  } catch (error) {
    console.error("Poolarama /api/admin/pool-state failed", error);

    return NextResponse.json(
      { error: "Could not update pool lock state." },
      { status: 500 }
    );
  }
}
