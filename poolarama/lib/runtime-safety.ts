import { NextResponse } from "next/server";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function allowMockFallback() {
  return !isProductionRuntime() || process.env.POOLARAMA_ALLOW_MOCK === "true";
}

export function poolDataUnavailableResponse() {
  return NextResponse.json(
    {
      error: "Pool data temporarily unavailable.",
      storageMode: "unavailable"
    },
    { status: 503 }
  );
}

export function isMaintenanceMode() {
  return process.env.POOLARAMA_MAINTENANCE_MODE === "true";
}

export function maintenanceModeResponse() {
  return NextResponse.json(
    {
      error: "Poolarama is temporarily read-only for maintenance.",
      maintenanceMode: true
    },
    { status: 503 }
  );
}
