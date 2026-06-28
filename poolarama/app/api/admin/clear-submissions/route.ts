import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse } from "@/lib/runtime-safety";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const body = (await request.json().catch(() => ({}))) as { confirmation?: string };

    if (body.confirmation !== "RESET GROUP PICKS") {
      return NextResponse.json(
        { error: "Type RESET GROUP PICKS to confirm clearing submissions." },
        { status: 400 }
      );
    }

    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Mongo is required to clear submissions." },
        { status: 503 }
      );
    }

    const result = await SubmissionModel.deleteMany({
      poolSlug: defaultPoolSlug,
      stage: "preTournament"
    });
    const pool = await getOrCreateDefaultPool();
    pool.preTournamentStatus = "open";
    pool.preTournamentLockedAt = null;
    await pool.save();

    return NextResponse.json({
      deleted: result.deletedCount || 0,
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/clear-submissions failed", error);

    return NextResponse.json(
      { error: "Could not clear submissions." },
      { status: 500 }
    );
  }
}
