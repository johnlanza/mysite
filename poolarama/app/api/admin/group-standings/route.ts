import { NextResponse, type NextRequest } from "next/server";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { generateRoundOf32Matches, getDefaultGroupStandings, reconcileGroupStandings, type GroupStandingInput } from "@/lib/bracket";
import { defaultPoolSlug } from "@/lib/mock-api-data";
import { groups, teams, type GroupId } from "@/lib/tournament-data";
import GroupStandingModel from "@/models/GroupStanding";

export const dynamic = "force-dynamic";

function normalizeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeStanding(input: Partial<GroupStandingInput>): GroupStandingInput {
  const goalsFor = normalizeNumber(input.goalsFor);
  const goalsAgainst = normalizeNumber(input.goalsAgainst);

  return {
    group: groups.includes(input.group as GroupId) ? (input.group as GroupId) : "A",
    team: typeof input.team === "string" ? input.team : "",
    played: normalizeNumber(input.played),
    wins: normalizeNumber(input.wins),
    draws: normalizeNumber(input.draws),
    losses: normalizeNumber(input.losses),
    goalsFor,
    goalsAgainst,
    goalDifference: typeof input.goalDifference === "number" ? input.goalDifference : goalsFor - goalsAgainst,
    points: normalizeNumber(input.points),
    rank: normalizeNumber(input.rank)
  };
}

const currentTeamKeys = new Set(teams.map((team) => `${team.group}:${team.name}`));

function isCurrentStanding(standing: GroupStandingInput) {
  return currentTeamKeys.has(`${standing.group}:${standing.team}`);
}

async function getStandings() {
  const rows = await GroupStandingModel.find({ poolSlug: defaultPoolSlug }).lean();

  if (rows.length === 0) {
    return getDefaultGroupStandings();
  }

  return reconcileGroupStandings(
    rows.map((row) => normalizeStanding({
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
      rank: row.rank
    }))
  );
}

export async function GET() {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json({
        standings: getDefaultGroupStandings(),
        r32Preview: generateRoundOf32Matches(getDefaultGroupStandings()),
        storageMode: "mock"
      });
    }

    const standings = await getStandings();

    return NextResponse.json({
      standings,
      r32Preview: generateRoundOf32Matches(standings),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/group-standings GET failed", error);

    return NextResponse.json(
      { error: "Could not load group standings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable; group standings were not saved." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { standings?: Partial<GroupStandingInput>[] };
    const standings = reconcileGroupStandings(
      (body.standings || []).map(normalizeStanding).filter(isCurrentStanding)
    );

    await Promise.all(
      standings.map((standing) =>
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

    return NextResponse.json({
      standings,
      r32Preview: generateRoundOf32Matches(standings),
      storageMode: "mongo"
    });
  } catch (error) {
    console.error("Poolarama /api/admin/group-standings PUT failed", error);

    return NextResponse.json(
      { error: "Could not save group standings." },
      { status: 500 }
    );
  }
}
