export function formatChampionScore(value: number, tournamentComplete: boolean) {
  return tournamentComplete ? String(value) : "TBD";
}
