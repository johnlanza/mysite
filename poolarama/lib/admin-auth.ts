import { NextResponse, type NextRequest } from "next/server";

function getAdminToken() {
  return process.env.POOLARAMA_ADMIN_TOKEN || "";
}

export function isAdminRequest(request: NextRequest) {
  const adminToken = getAdminToken();
  if (!adminToken) return false;

  const headerToken = request.headers.get("x-poolarama-admin") || "";
  const queryToken = request.nextUrl.searchParams.get("adminToken") || "";

  return headerToken === adminToken || queryToken === adminToken;
}

export function requireAdminRequest(request: NextRequest) {
  if (isAdminRequest(request)) return null;

  return NextResponse.json(
    { error: "Admin access required." },
    { status: 401 }
  );
}
