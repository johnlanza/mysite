import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { connectToPoolaramaDatabase } from "@/lib/db";
import { buildPoolaramaBackupSnapshot } from "@/lib/poolarama-backup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await connectToPoolaramaDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Mongo is required to create a backup." },
        { status: 503 }
      );
    }

    return NextResponse.json(await buildPoolaramaBackupSnapshot("manual"));
  } catch (error) {
    console.error("Poolarama /api/admin/backup failed", error);

    return NextResponse.json(
      { error: "Could not create Poolarama backup." },
      { status: 500 }
    );
  }
}
