const ONE_TIME_SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

export function isOneTimeSweepEligible(sweepAt: Date, now = new Date()) {
  const delay = now.getTime() - sweepAt.getTime();
  return delay >= 0 && delay <= ONE_TIME_SWEEP_GRACE_MS;
}
