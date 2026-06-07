import { NextResponse, type NextRequest } from "next/server";

export const adminInviteToken = "admin-7f4d9c2b8a61e0f5";

export function isAdminRequest(request: NextRequest) {
  const headerToken = request.headers.get("x-poolarama-admin") || "";
  const queryToken = request.nextUrl.searchParams.get("adminToken") || "";

  return headerToken === adminInviteToken || queryToken === adminInviteToken;
}

export function requireAdminRequest(request: NextRequest) {
  if (isAdminRequest(request)) return null;

  return NextResponse.json(
    { error: "Admin access required." },
    { status: 401 }
  );
}
