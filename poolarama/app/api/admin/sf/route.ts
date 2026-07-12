import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateSemifinalMatches, type GeneratedMatch } from "@/lib/bracket";
import { fetchSyncedKnockoutWinners, planKnockoutWinnerUpdates } from "@/lib/knockout-winner-sync";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { createPoolaramaBackup } from "@/lib/poolarama-backup";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

async function loadRoundMatches(stage: "qf" | "sf") {
  return MatchModel.find({ poolSlug: defaultPoolSlug, stage }).sort({ order: 1 }).lean();
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

function getSfStatus(pool: { sfStatus?: string }) {
  return pool.sfStatus === "open" || pool.sfStatus === "locked" ? pool.sfStatus : "setup";
}

async function generatePreview() {
  return generateSemifinalMatches(await loadRoundMatches("qf"));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) return poolDataUnavailableResponse();

    const [pool, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      loadRoundMatches("sf")
    ]);

    return NextResponse.json({
      matches,
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/sf GET failed", error);

    return NextResponse.json(
      { error: "Could not load Semifinals." },
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

    if (!db) return poolDataUnavailableResponse();

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      confirmation?: string;
      previewMatches?: unknown;
      matchId?: string;
      winner?: string;
    };
    const action = body.action || "preview";
    const pool = await getOrCreateDefaultPool();
    const sfStatus = getSfStatus(pool);

    if (action === "generate" || action === "preview") {
      if (sfStatus !== "setup") {
        return NextResponse.json(
          { error: "Semifinal preview is only available before picks are opened." },
          { status: 409 }
        );
      }

      const matches = await generatePreview();

      return NextResponse.json({
        matches,
        pool: buildPoolState(pool),
        storageMode: "mongo",
        previewOnly: true
      });
    }

    if (action === "open") {
      if (pool.qfStatus !== "locked") {
        return NextResponse.json(
          { error: "Quarterfinals must be locked before Semifinals can open." },
          { status: 409 }
        );
      }

      if (sfStatus !== "setup") {
        return NextResponse.json(
          { error: "Semifinal picks are already open or locked." },
          { status: 409 }
        );
      }

      if (body.confirmation !== "OPEN") {
        return NextResponse.json(
          { error: "Generate and confirm the Semifinal preview before opening picks." },
          { status: 400 }
        );
      }

      const matches = await generatePreview();

      if (matches.length !== 2) {
        return NextResponse.json(
          { error: "Generate and verify 2 Semifinal matches before opening picks." },
          { status: 409 }
        );
      }

      if (!previewMatchesAreCurrent(body.previewMatches, matches)) {
        return NextResponse.json(
          { error: "Semifinal preview is missing or stale. Generate preview again before opening picks." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("sf-open");

      await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "sf" });
      await MatchModel.insertMany(
        matches.map((match) => ({
          poolSlug: defaultPoolSlug,
          stage: "sf",
          source: "generated",
          winner: "",
          ...match
        }))
      );

      pool.currentStage = "sf";
      pool.sfStatus = "open";
      pool.sfOpenedAt = new Date();
      pool.sfLockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("sf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "lock") {
      if (sfStatus !== "open") {
        return NextResponse.json(
          { error: "Semifinal picks must be open before they can be locked." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("sf-lock");

      pool.sfStatus = "locked";
      pool.sfLockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("sf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "score") {
      if (sfStatus !== "locked") {
        return NextResponse.json(
          { error: "Semifinal picks must be locked before winners can be scored." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("sf");
      const match = matches.find((candidate) => candidate.matchId === body.matchId);

      if (!match) {
        return NextResponse.json(
          { error: "Semifinal match was not found." },
          { status: 404 }
        );
      }

      if (body.winner !== match.teamA && body.winner !== match.teamB) {
        return NextResponse.json(
          { error: "Winner must match one of the Semifinal teams." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("sf-score");

      await MatchModel.updateOne(
        { poolSlug: defaultPoolSlug, stage: "sf", matchId: body.matchId },
        { $set: { winner: body.winner } }
      );

      return NextResponse.json({
        matches: await loadRoundMatches("sf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "sync-winners") {
      if (sfStatus !== "locked") {
        return NextResponse.json(
          { error: "Semifinal picks must be locked before winners can be synced." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("sf");
      const syncResult = await fetchSyncedKnockoutWinners("sf");
      const plan = planKnockoutWinnerUpdates(matches, syncResult.winners);
      const backup = plan.updates.length > 0 ? await createPoolaramaBackup("sf-sync") : null;

      if (plan.updates.length > 0) {
        await Promise.all(
          plan.updates.map((update) =>
            MatchModel.updateOne(
              { poolSlug: defaultPoolSlug, stage: "sf", matchId: update.matchId },
              { $set: { winner: update.winner } }
            )
          )
        );
      }

      return NextResponse.json({
        matches: await loadRoundMatches("sf"),
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
      { error: "Unsupported Semifinal action." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Semifinals.";
    console.error("Poolarama /api/admin/sf POST failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
