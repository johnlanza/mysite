import { NextResponse } from "next/server";
import { withBasePath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    app: "Poolarama",
    status: "ok",
    endpoints: {
      me: withBasePath("/api/me"),
      submissions: withBasePath("/api/submissions"),
      standings: withBasePath("/api/standings")
    }
  });
}
