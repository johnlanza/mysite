import { NextResponse } from "next/server";
import { fetchGoldenBootTable } from "@/lib/golden-boot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const goldenBoot = await fetchGoldenBootTable();

    return NextResponse.json({
      ...goldenBoot,
      storageMode: "provider"
    });
  } catch (error) {
    console.error("Poolarama /api/golden-boot GET failed", error);

    return NextResponse.json(
      {
        error: "Could not load Golden Boot table.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
