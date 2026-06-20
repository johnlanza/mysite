import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { generateRoundOf32Matches } from "@/lib/bracket";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { fetchSyncedGroupStandings } from "@/lib/live-standings-sync";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { isMaintenanceMode, maintenanceModeResponse } from "@/lib/runtime-safety";
import { teams } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";

export const dynamic = "force-dynamic";

async function syncStandings(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable; standings were not synced." },
        { status: 503 }
      );
    }

    const syncResult = await fetchSyncedGroupStandings();

    if (syncResult.standings.length !== teams.length) {
      return NextResponse.json(
        {
          error: "Provider standings did not map to every Poolarama team.",
          provider: syncResult.provider,
          mappedTeams: syncResult.standings.length,
          expectedTeams: teams.length
        },
        { status: 502 }
      );
    }

    await Promise.all(
      syncResult.standings.map((standing) =>
        GroupStandingModel.findOneAndUpdate(
          { poolSlug: defaultPoolSlug, group: standing.group, team: standing.team },
          {
            $set: {
              ...standing,
              poolSlug: defaultPoolSlug
            }
          },
          { new: true, upsert: true }
        )
      )
    );
    await GroupStandingModel.deleteMany({
      poolSlug: defaultPoolSlug,
      $nor: teams.map((team) => ({ group: team.group, team: team.name }))
    });

    return NextResponse.json({
      ...syncResult,
      r32Preview: generateRoundOf32Matches(syncResult.standings),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/sync-standings failed", error);

    return NextResponse.json(
      {
        error: "Could not sync live standings.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return syncStandings(request);
}

export async function POST(request: NextRequest) {
  return syncStandings(request);
}
