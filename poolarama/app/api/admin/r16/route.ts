import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateRoundOf16Matches, type GeneratedMatch } from "@/lib/bracket";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { createPoolaramaBackup } from "@/lib/poolarama-backup";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { isMaintenanceMode, maintenanceModeResponse, poolDataUnavailableResponse } from "@/lib/runtime-safety";
import MatchModel from "@/models/Match";

export const dynamic = "force-dynamic";

async function loadRoundMatches(stage: "r32" | "r16") {
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

function getR16Status(pool: { r16Status?: string }) {
  return pool.r16Status === "open" || pool.r16Status === "locked" ? pool.r16Status : "setup";
}

async function generatePreview() {
  return generateRoundOf16Matches(await loadRoundMatches("r32"));
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) return poolDataUnavailableResponse();

    const [pool, matches] = await Promise.all([
      getOrCreateDefaultPool(),
      loadRoundMatches("r16")
    ]);

    return NextResponse.json({
      matches,
      pool: buildPoolState(pool),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/r16 GET failed", error);

    return NextResponse.json(
      { error: "Could not load Round of 16." },
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
    const r16Status = getR16Status(pool);

    if (action === "generate" || action === "preview") {
      if (r16Status !== "setup") {
        return NextResponse.json(
          { error: "Round of 16 preview is only available before picks are opened." },
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
      if (pool.r32Status !== "locked") {
        return NextResponse.json(
          { error: "Round of 32 must be locked before Round of 16 can open." },
          { status: 409 }
        );
      }

      if (r16Status !== "setup") {
        return NextResponse.json(
          { error: "Round of 16 picks are already open or locked." },
          { status: 409 }
        );
      }

      if (body.confirmation !== "OPEN") {
        return NextResponse.json(
          { error: "Generate and confirm the Round of 16 preview before opening picks." },
          { status: 400 }
        );
      }

      const matches = await generatePreview();

      if (matches.length !== 8) {
        return NextResponse.json(
          { error: "Generate and verify 8 Round of 16 matches before opening picks." },
          { status: 409 }
        );
      }

      if (!previewMatchesAreCurrent(body.previewMatches, matches)) {
        return NextResponse.json(
          { error: "Round of 16 preview is missing or stale. Generate preview again before opening picks." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("r16-open");

      await MatchModel.deleteMany({ poolSlug: defaultPoolSlug, stage: "r16" });
      await MatchModel.insertMany(
        matches.map((match) => ({
          poolSlug: defaultPoolSlug,
          stage: "r16",
          source: "generated",
          winner: "",
          ...match
        }))
      );

      pool.currentStage = "r16";
      pool.r16Status = "open";
      pool.r16OpenedAt = new Date();
      pool.r16LockedAt = null;
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("r16"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "lock") {
      if (r16Status !== "open") {
        return NextResponse.json(
          { error: "Round of 16 picks must be open before they can be locked." },
          { status: 409 }
        );
      }

      const backup = await createPoolaramaBackup("r16-lock");

      pool.r16Status = "locked";
      pool.r16LockedAt = new Date();
      await pool.save();

      return NextResponse.json({
        matches: await loadRoundMatches("r16"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    if (action === "score") {
      if (r16Status !== "locked") {
        return NextResponse.json(
          { error: "Round of 16 picks must be locked before winners can be scored." },
          { status: 409 }
        );
      }

      const matches = await loadRoundMatches("r16");
      const match = matches.find((candidate) => candidate.matchId === body.matchId);

      if (!match) {
        return NextResponse.json(
          { error: "Round of 16 match was not found." },
          { status: 404 }
        );
      }

      if (body.winner !== match.teamA && body.winner !== match.teamB) {
        return NextResponse.json(
          { error: "Winner must match one of the Round of 16 teams." },
          { status: 400 }
        );
      }

      const backup = await createPoolaramaBackup("r16-score");

      await MatchModel.updateOne(
        { poolSlug: defaultPoolSlug, stage: "r16", matchId: body.matchId },
        { $set: { winner: body.winner } }
      );

      return NextResponse.json({
        matches: await loadRoundMatches("r16"),
        pool: buildPoolState(pool),
        storageMode: "mongo",
        backup
      });
    }

    return NextResponse.json(
      { error: "Unsupported Round of 16 action." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Round of 16.";
    console.error("Poolarama /api/admin/r16 POST failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
