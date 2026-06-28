import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateQuarterfinalMatches, type GeneratedMatch } from "@/lib/bracket";
import { fetchSyncedKnockoutWinners, planKnockoutWinnerUpdates } from "@/lib/knockout-winner-sync";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { createPoolaramaBackup } from "@/lib/poolarama-backup";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

async function loadRoundMatches(stage: "r16" | "qf") {
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

function getQfStatus(pool: { qfStatus?: string }) {
  return pool.qfStatus === "open" || pool.qfStatus === "locked" ? pool.qfStatus : "setup";
}

async function generatePreview() {
  return generateQuarterfinalMatches(await loadRoundMatches("r16"));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) return poolDataUnavailableResponse();

    const [pool, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      loadRoundMatches("qf")
    ]);

    return NextResponse.json({
      matches,
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/qf GET failed", error);

    return NextResponse.json(
      { error: "Could not load Quarterfinals." },
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
    const qfStatus = getQfStatus(pool);

    if (action === "generate" || action === "preview") {
      if (qfStatus !== "setup") {
        return NextResponse.json(
          { error: "Quarterfinal preview is only available before picks are opened." },
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
      if (pool.r16Status !== "locked") {
        return NextResponse.json(
          { error: "Round of 16 must be locked before Quarterfinals can open." },
          { status: 409 }
        );
      }

      if (qfStatus !== "setup") {
        return NextResponse.json(
          { error: "Quarterfinal picks are already open or locked." },
          { status: 409 }
        );
      }

      if (body.confirmation !== "OPEN") {
        return NextResponse.json(
          { error: "Generate and confirm the Quarterfinal preview before opening picks." },
          { status: 400 }
        );
      }

      const matches = await generatePreview();

      if (matches.length !== 4) {
        return NextResponse.json(
          { error: "Generate and verify 4 Quarterfinal matches before opening picks." },
          { status: 409 }
        );
      }

      if (!previewMatchesAreCurrent(body.previewMatches, matches)) {
        return NextResponse.json(
          { error: "Quarterfinal preview is missing or stale. Generate preview again before opening picks." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("qf-open");

      await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "qf" });
      await MatchModel.insertMany(
        matches.map((match) => ({
          poolSlug: defaultPoolSlug,
          stage: "qf",
          source: "generated",
          winner: "",
          ...match
        }))
      );

      pool.currentStage = "qf";
      pool.qfStatus = "open";
      pool.qfOpenedAt = new Date();
      pool.qfLockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("qf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "lock") {
      if (qfStatus !== "open") {
        return NextResponse.json(
          { error: "Quarterfinal picks must be open before they can be locked." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("qf-lock");

      pool.qfStatus = "locked";
      pool.qfLockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("qf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "score") {
      if (qfStatus !== "locked") {
        return NextResponse.json(
          { error: "Quarterfinal picks must be locked before winners can be scored." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("qf");
      const match = matches.find((candidate) => candidate.matchId === body.matchId);

      if (!match) {
        return NextResponse.json(
          { error: "Quarterfinal match was not found." },
          { status: 404 }
        );
      }

      if (body.winner !== match.teamA && body.winner !== match.teamB) {
        return NextResponse.json(
          { error: "Winner must match one of the Quarterfinal teams." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("qf-score");

      await MatchModel.updateOne(
        { poolSlug: defaultPoolSlug, stage: "qf", matchId: body.matchId },
        { $set: { winner: body.winner } }
      );

      return NextResponse.json({
        matches: await loadRoundMatches("qf"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "sync-winners") {
      if (qfStatus !== "locked") {
        return NextResponse.json(
          { error: "Quarterfinal picks must be locked before winners can be synced." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("qf");
      const syncResult = await fetchSyncedKnockoutWinners("qf");
      const plan = planKnockoutWinnerUpdates(matches, syncResult.winners);
      const backup = plan.updates.length > 0 ? await createPoolaramaBackup("qf-sync") : null;

      if (plan.updates.length > 0) {
        await Promise.all(
          plan.updates.map((update) =>
            MatchModel.updateOne(
              { poolSlug: defaultPoolSlug, stage: "qf", matchId: update.matchId },
              { $set: { winner: update.winner } }
            )
          )
        );
      }

      return NextResponse.json({
        matches: await loadRoundMatches("qf"),
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
      { error: "Unsupported Quarterfinal action." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Quarterfinals.";
    console.error("Poolarama /api/admin/qf POST failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
