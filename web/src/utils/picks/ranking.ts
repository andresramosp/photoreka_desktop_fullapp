import {
  PICKS_AWARDS,
  PICKS_JURIES,
  getPicksJury,
  type PicksJury,
  type PicksWeights,
} from "@/config/picks";
import type {
  PicksPhoto,
  PicksRankingMode,
  PicksScores,
  RankedPhoto,
} from "./types";

// Criteria the photo has no score for drop out of both sums, so a missing
// score never counts as a zero.
export function weightedScore(
  scores: PicksScores | null,
  weights: PicksWeights,
): number | null {
  if (!scores) return null;
  let sum = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = scores[key as keyof PicksScores];
    if (typeof value !== "number" || !weight) continue;
    sum += value * weight;
    used += weight;
  }
  return used > 0 ? sum / used : null;
}

export function juryAccepts(jury: PicksJury, photo: PicksPhoto): boolean {
  if (!jury.genres) return true;
  return Boolean(photo.genres?.some((genre) => jury.genres!.includes(genre)));
}

export function scoreFor(
  photo: PicksPhoto,
  mode: PicksRankingMode,
): number | null {
  if (mode.kind === "criterion") return photo.scores?.[mode.criterion] ?? null;
  return juryScore(getPicksJury(mode.juryId), photo);
}

/** Null when the jury leaves the photo out: wrong genre, or below its minimum score. */
export function juryScore(jury: PicksJury, photo: PicksPhoto): number | null {
  if (!juryAccepts(jury, photo)) return null;
  const score = weightedScore(photo.scores, jury.weights);
  if (score === null || (jury.minScore !== undefined && score < jury.minScore)) return null;
  return score;
}

export function rankPhotos(
  photos: PicksPhoto[],
  mode: PicksRankingMode,
): RankedPhoto[] {
  const scored: { photo: PicksPhoto; score: number }[] = [];
  for (const photo of photos) {
    const score = scoreFor(photo, mode);
    if (score !== null) scored.push({ photo, score });
  }
  scored.sort((a, b) => b.score - a.score || a.photo.name.localeCompare(b.photo.name));
  return scored.map((item, i) => ({ ...item, rank: i + 1 }));
}

export function countJuryPhotos(photos: PicksPhoto[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const jury of [...PICKS_JURIES, ...PICKS_AWARDS]) {
    counts[jury.id] = photos.filter((p) => juryScore(jury, p) !== null).length;
  }
  return counts;
}

export function formatScore(score: number | null | undefined): string {
  return typeof score === "number" ? score.toFixed(1) : "–";
}
