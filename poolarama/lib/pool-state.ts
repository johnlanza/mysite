import { defaultPoolSlug } from "@/lib/mock-api-data";
import PoolModel from "@/models/Pool";

export type PoolRoundState = {
  preTournament: {
    status: "open" | "locked";
    lockedAt: string | null;
  };
  r32: {
    status: "setup" | "open" | "locked";
    openedAt: string | null;
    lockedAt: string | null;
  };
};

export function buildPoolState(pool: {
  preTournamentStatus?: "open" | "locked";
  preTournamentLockedAt?: Date | null;
  r32Status?: "setup" | "open" | "locked";
  r32OpenedAt?: Date | null;
  r32LockedAt?: Date | null;
} | null): PoolRoundState {
  return {
    preTournament: {
      status: pool?.preTournamentStatus === "locked" ? "locked" : "open",
      lockedAt: pool?.preTournamentLockedAt ? pool.preTournamentLockedAt.toISOString() : null
    },
    r32: {
      status: pool?.r32Status === "open" || pool?.r32Status === "locked" ? pool.r32Status : "setup",
      openedAt: pool?.r32OpenedAt ? pool.r32OpenedAt.toISOString() : null,
      lockedAt: pool?.r32LockedAt ? pool.r32LockedAt.toISOString() : null
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
        preTournamentLockedAt: null,
        r32Status: "setup",
        r32OpenedAt: null,
        r32LockedAt: null
      }
    },
    { new: true, upsert: true }
  );
}
