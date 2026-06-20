import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateRoundOf32Matches, getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { allowMockFallback, isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import { type GroupId } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

function rowToStanding(row: {
  group: string;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
  tiebreaker?: GroupStandingInput["tiebreaker"];
}): GroupStandingInput {
  return {
    group: row.group as GroupId,
    team: row.team,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    rank: row.rank,
    tiebreaker: row.tiebreaker
  };
}

async function loadStandings() {
  const rows = await GroupStandingModel.find({ poolSlug: defaultPoolSlug }).lean();
  return rows.length > 0 ? reconcileGroupStandings(rows.map(rowToStanding)) : getDefaultGroupStandings();
}

async function loadMatches() {
  return MatchModel.find({ poolSlug: defaultPoolSlug, stage: "r32" }).sort({ order: 1 }).lean();
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        matches: generateRoundOf32Matches(getDefaultGroupStandings()),
        pool: buildPoolState(null),
        storageMode: "mock"
      });
    }

    const [pool, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      loadMatches()
    ]);

    return NextResponse.json({
      matches,
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/r32 GET failed", error);

    return NextResponse.json(
      { error: "Could not load Round of 32." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  if (isMaintenanceMode()) return maintenanceModeResponse();

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable; Round of 32 was not generated." },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action || "generate";
    const pool = await getOrCreateDefaultPool();

    if (action === "open") {
      pool.currentStage = "r32";
      pool.r32Status = "open";
      pool.r32OpenedAt = new Date();
      pool.r32LockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: await loadMatches(),
        pool: buildPoolState(pool),
        storageMode: "mongo"
      });
    }

    if (action === "lock") {
      pool.r32Status = "locked";
      pool.r32LockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadMatches(),
        pool: buildPoolState(pool),
        storageMode: "mongo"
      });
    }

    const standings = await loadStandings();
    const matches = generateRoundOf32Matches(standings);

    await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "r32" });
    await MatchModel.insertMany(
      matches.map((match) => ({
        poolSlug: defaultPoolSlug,
        stage: "r32",
        source: "generated",
        ...match
      }))
    );

    pool.currentStage = "r32";
    pool.r32Status = "open";
    pool.r32OpenedAt = new Date();
    pool.r32LockedAt = null;
    await pool.save();

    return NextResponse.json({
      matches: await loadMatches(),
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/r32 POST failed", error);

    return NextResponse.json(
      { error: "Could not update Round of 32." },
      { status: 500 }
    );
  }
}
