import { NextResponse } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { allowMockFallback, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import { type GroupId } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";

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

function getLatestUpdatedAt(rows: Array<{ updatedAt?: Date | string }>) {
  const timestamps = rows
    .map((row) => row.updatedAt ? new Date(row.updatedAt).getTime() : 0)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);

  if (timestamps.length === 0) return null;

  return new Date(Math.max(...timestamps)).toISOString();
}

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      if (!allowMockFallback()) return poolDataUnavailableResponse();

      return NextResponse.json({
        standings: getDefaultGroupStandings(),
        storageMode: "mock"
      });
    }

    const rows = await GroupStandingModel.find({ poolSlug: defaultPoolSlug }).lean();
    const standings = rows.length > 0
      ? reconcileGroupStandings(rows.map(rowToStanding))
      : getDefaultGroupStandings();

    return NextResponse.json({
      standings,
      latestUpdatedAt: getLatestUpdatedAt(rows),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/group-standings GET failed", error);

    return NextResponse.json(
      { error: "Could not load group standings." },
      { status: 500 }
    );
  }
}
