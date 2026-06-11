import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { mergeKnownAndMongoParticipants, participantFromMongo } from "@/lib/participant-utils";
import { buildPoolState, getOrCreateDefaultPool } from "@/lib/pool-state";
import { groups, type GroupId } from "@/lib/tournament-data";
import ParticipantModel from "@/models/Participant";
import SubmissionModel from "@/models/Submission";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function getPickValue(picks: unknown, group: GroupId) {
  if (!picks) return "";
  if (picks instanceof Map) return picks.get(group) || "";
  if (typeof picks === "object") return (picks as Record<string, string>)[group] || "";
  return "";
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Mongo is not configured; export is unavailable." },
        { status: 503 }
      );
    }

    const pool = await getOrCreateDefaultPool();

    if (buildPoolState(pool).preTournament.status !== "locked") {
      return NextResponse.json(
        { error: "Picks are hidden until pre-tournament picks are locked." },
        { status: 423 }
      );
    }

    const [participants, submissions] = await Promise.all([
      ParticipantModel.find({ poolSlug: defaultPoolSlug }).lean(),
      SubmissionModel.find({ poolSlug: defaultPoolSlug, stage: "preTournament" }).lean()
    ]);
    const header = [
      "Participant Code",
      "Name",
      "Nickname",
      "Venmo Paid",
      "Submitted",
      "Submitted At",
      "Champion",
      "Golden Boot",
      ...groups.flatMap((group) => [`Group ${group} Winner`, `Group ${group} Runner-up`])
    ];
    const roster = mergeKnownAndMongoParticipants(participants.map(participantFromMongo));
    const rows = roster.map((knownParticipant) => {
      const participant =
        participants.find((item) => item.participantCode === knownParticipant.code) || null;
      const submission =
        submissions.find((item) => item.participantCode === knownParticipant.code) || null;
      const groupWinners = submission?.picks?.groupWinners;
      const groupRunnersUp = submission?.picks?.groupRunnersUp;

      return [
        knownParticipant.code,
        participant?.name || knownParticipant.name,
        participant?.nickname || knownParticipant.nickname,
        participant?.venmoPaid ? "Yes" : "No",
        submission ? "Yes" : "No",
        submission?.submittedAt ? submission.submittedAt.toISOString() : "",
        submission?.picks?.champion || "",
        submission?.picks?.goldenBoot || "",
        ...groups.flatMap((group) => [
          getPickValue(groupWinners, group),
          getPickValue(groupRunnersUp, group)
        ])
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Disposition": `attachment; filename="poolarama-picks-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    console.error("Poolarama /api/admin/export failed", error);

    return NextResponse.json(
      { error: "Could not export picks." },
      { status: 500 }
    );
  }
}
