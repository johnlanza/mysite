import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateFinalMatches, type GeneratedMatch } from "@/lib/bracket";
import { fetchSyncedKnockoutWinners, planKnockoutWinnerUpdates } from "@/lib/knockout-winner-sync";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { createPoolaramaBackup } from "@/lib/poolarama-backup";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

async function loadRoundMatches(stage: "sf" | "final") {
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

function getFinalStatus(pool: { finalStatus?: string }) {
  return pool.finalStatus === "open" || pool.finalStatus === "locked" ? pool.finalStatus : "setup";
}

async function generatePreview() {
  return generateFinalMatches(await loadRoundMatches("sf"));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) return poolDataUnavailableResponse();

    const [pool, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      loadRoundMatches("final")
    ]);

    return NextResponse.json({
      matches,
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/final GET failed", error);

    return NextResponse.json(
      { error: "Could not load Final." },
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
    const finalStatus = getFinalStatus(pool);

    if (action === "generate" || action === "preview") {
      if (finalStatus !== "setup") {
        return NextResponse.json(
          { error: "Final preview is only available before picks are opened." },
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
      if (pool.sfStatus !== "locked") {
        return NextResponse.json(
          { error: "Semifinals must be locked before the Final can open." },
          { status: 409 }
        );
      }

      if (finalStatus !== "setup") {
        return NextResponse.json(
          { error: "Final picks are already open or locked." },
          { status: 409 }
        );
      }

      if (body.confirmation !== "OPEN") {
        return NextResponse.json(
          { error: "Generate and confirm the Final preview before opening picks." },
          { status: 400 }
        );
      }

      const matches = await generatePreview();

      if (matches.length !== 1) {
        return NextResponse.json(
          { error: "Generate and verify the Final match before opening picks." },
          { status: 409 }
        );
      }

      if (!previewMatchesAreCurrent(body.previewMatches, matches)) {
        return NextResponse.json(
          { error: "Final preview is missing or stale. Generate preview again before opening picks." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("final-open");

      await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "final" });
      await MatchModel.insertMany(
        matches.map((match) => ({
          poolSlug: defaultPoolSlug,
          stage: "final",
          source: "generated",
          winner: "",
          ...match
        }))
      );

      pool.currentStage = "final";
      pool.finalStatus = "open";
      pool.finalOpenedAt = new Date();
      pool.finalLockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("final"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "lock") {
      if (finalStatus !== "open") {
        return NextResponse.json(
          { error: "Final picks must be open before they can be locked." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("final-lock");

      pool.finalStatus = "locked";
      pool.finalLockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("final"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "score") {
      if (finalStatus !== "locked") {
        return NextResponse.json(
          { error: "Final picks must be locked before winners can be scored." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("final");
      const match = matches.find((candidate) => candidate.matchId === body.matchId);

      if (!match) {
        return NextResponse.json(
          { error: "Final match was not found." },
          { status: 404 }
        );
      }

      if (body.winner !== match.teamA && body.winner !== match.teamB) {
        return NextResponse.json(
          { error: "Winner must match one of the Final teams." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("final-score");

      await MatchModel.updateOne(
        { poolSlug: defaultPoolSlug, stage: "final", matchId: body.matchId },
        { $set: { winner: body.winner } }
      );

      return NextResponse.json({
        matches: await loadRoundMatches("final"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "sync-winners") {
      if (finalStatus !== "locked") {
        return NextResponse.json(
          { error: "Final picks must be locked before winners can be synced." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("final");
      const syncResult = await fetchSyncedKnockoutWinners("final");
      const plan = planKnockoutWinnerUpdates(matches, syncResult.winners);
      const backup = plan.updates.length > 0 ? await createPoolaramaBackup("final-sync") : null;

      if (plan.updates.length > 0) {
        await Promise.all(
          plan.updates.map((update) =>
            MatchModel.updateOne(
              { poolSlug: defaultPoolSlug, stage: "final", matchId: update.matchId },
              { $set: { winner: update.winner } }
            )
          )
        );
      }

      return NextResponse.json({
        matches: await loadRoundMatches("final"),
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
      { error: "Unsupported Final action." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Final.";
    console.error("Poolarama /api/admin/final POST failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
