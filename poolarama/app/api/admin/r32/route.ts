import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateRoundOf32Matches, getDefaultGroupStandings, reconcileGroupStandings, type GeneratedMatch, type GroupStandingInput } from "@/lib/bracket";
import { fetchSyncedKnockoutWinners, planKnockoutWinnerUpdates } from "@/lib/knockout-winner-sync";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { createPoolaramaBackup } from "@/lib/poolarama-backup";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { allowMockFallback, isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import { type GroupId } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";
import MatchModel from "@/models/Match";
import SubmissionModel from "@/models/Submission";

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

function matchSignature(matches: GeneratedMatch[]) {
  return matches
    .map((match) => `${match.matchId}:${match.teamA}:${match.teamB}:${match.order}`)
    .join("|");
}

function previewMatchesAreCurrent(previewMatches: unknown, generatedMatches: GeneratedMatch[]) {
  if (!Array.isArray(previewMatches)) return false;

  return matchSignature(previewMatches as GeneratedMatch[]) === matchSignature(generatedMatches);
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

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      confirmation?: string;
      previewMatches?: unknown;
      matchId?: string;
      winner?: string;
    };
    const action = body.action || "generate";
    const pool = await getOrCreateDefaultPool();

    if (action === "reset") {
      if (body.confirmation !== "RESET R32") {
        return NextResponse.json(
          { error: "Type RESET R32 to confirm Round of 32 reset." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("r32-reset");

      await Promise.all([
        MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "r32" }),
        SubmissionModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "r32" })
      ]);

      pool.currentStage = "preTournament";
      pool.r32Status = "setup";
      pool.r32OpenedAt = null;
      pool.r32LockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: [],
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "generate" || action === "preview") {
      if (pool.r32Status !== "setup") {
        return NextResponse.json(
          { error: "Round of 32 preview is only available before picks are opened." },
          { status: 409 }
        );
      }

      const matches = generateRoundOf32Matches(await loadStandings());

      return NextResponse.json({
        matches,
        pool: buildPoolState(pool),
        storageMode: "mongo",
        previewOnly: true
      });
    }

    if (action === "open") {
      if (pool.r32Status !== "setup") {
        return NextResponse.json(
          { error: "Round of 32 picks are already open or locked." },
          { status: 409 }
        );
      }

      if (body.confirmation !== "OPEN") {
        return NextResponse.json(
          { error: "Generate and confirm the Round of 32 preview before opening picks." },
          { status: 400 }
        );
      }

      const matches = generateRoundOf32Matches(await loadStandings());

      if (matches.length !== 16) {
        return NextResponse.json(
          { error: "Generate and verify 16 Round of 32 matches before opening picks." },
          { status: 409 }
        );
      }

      if (!previewMatchesAreCurrent(body.previewMatches, matches)) {
        return NextResponse.json(
          { error: "Round of 32 preview is missing or stale. Generate preview again before opening picks." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("r32-open");

      await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "r32" });
      await MatchModel.insertMany(
        matches.map((match) => ({
          poolSlug: defaultPoolSlug,
          stage: "r32",
          source: "generated",
          winner: "",
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
        storageMode: "mongo",
        backup
      });
    }

    if (action === "lock") {
      if (pool.r32Status !== "open") {
        return NextResponse.json(
          { error: "Round of 32 picks must be open before they can be locked." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("r32-lock");

      pool.r32Status = "locked";
      pool.r32LockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadMatches(),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "score") {
      if (pool.r32Status !== "locked") {
        return NextResponse.json(
          { error: "Round of 32 picks must be locked before winners can be scored." },
          { status: 409 }
        );
      }

      const matches = await loadMatches();
      const match = matches.find((candidate) => candidate.matchId === body.matchId);

      if (!match) {
        return NextResponse.json(
          { error: "Round of 32 match was not found." },
          { status: 404 }
        );
      }

      if (body.winner !== match.teamA && body.winner !== match.teamB) {
        return NextResponse.json(
          { error: "Winner must match one of the Round of 32 teams." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("r32-score");

      await MatchModel.updateOne(
        { poolSlug: defaultPoolSlug, stage: "r32", matchId: body.matchId },
        { $set: { winner: body.winner } }
      );

      return NextResponse.json({
        matches: await loadMatches(),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "sync-winners") {
      if (pool.r32Status !== "locked") {
        return NextResponse.json(
          { error: "Round of 32 picks must be locked before winners can be synced." },
          { status: 409 }
        );
      }

      const matches = await loadMatches();
      const syncResult = await fetchSyncedKnockoutWinners("r32");
      const plan = planKnockoutWinnerUpdates(matches, syncResult.winners);
      const backup = plan.updates.length > 0 ? await createPoolaramaBackup("r32-sync") : null;

      if (plan.updates.length > 0) {
        await Promise.all(
          plan.updates.map((update) =>
            MatchModel.updateOne(
              { poolSlug: defaultPoolSlug, stage: "r32", matchId: update.matchId },
              { $set: { winner: update.winner } }
            )
          )
        );
      }

      return NextResponse.json({
        matches: await loadMatches(),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup,
        sync: {
          ...syncResult,
          updates: plan.updates,
          unchanged: plan.unchanged,
          conflicts: plan.conflicts,
          unmatched: plan.unmatched
        }
      });
    }

    return NextResponse.json(
      { error: "Unsupported Round of 32 action." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Poolarama /api/admin/r32 POST failed", error);

    return NextResponse.json(
      { error: "Could not update Round of 32." },
      { status: 500 }
    );
  }
}
