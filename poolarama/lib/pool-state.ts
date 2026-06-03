import { defaultPoolSlug } from "@/lib/mock-api-data";
import PoolModel from "@/models/Pool";

export type PoolRoundState = {
  preTournament: {
    status: "open" | "locked";
    lockedAt: string | null;
  };
};

export function buildPoolState(pool: {
  preTournamentStatus?: "open" | "locked";
  preTournamentLockedAt?: Date | null;
} | null): PoolRoundState {
  return {
    preTournament: {
      status: pool?.preTournamentStatus === "locked" ? "locked" : "open",
      lockedAt: pool?.preTournamentLockedAt ? pool.preTournamentLockedAt.toISOString() : null
    }
  };
}

export async function getOrCreateDefaultPool() {
  return PoolModel.findOneAndUpdate(
    { slug: defaultPoolSlug },
    {
      $setOnInsert: {
        slug: defaultPoolSlug,
        title: "Men's World Cup 2026 Edition",
        entryFee: 10,
        status: "open",
        currentStage: "preTournament",
        preTournamentStatus: "open",
        preTournamentLockedAt: null
      }
    },
    { new: true, upsert: true }
  );
}
