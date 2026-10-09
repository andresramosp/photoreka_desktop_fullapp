import type { PicksCriterionKey, PicksGenreKey } from "@/config/picks";

export type PicksScores = Partial<Record<PicksCriterionKey, number>>;

export interface PicksSource {
  file: File;
  /** Reference to the original on disk (Chromium only), kept to download it later. */
  handle: FileSystemFileHandle | null;
  /** What the user granted access to (the picked folder or the file itself). */
  root: FileSystemHandle | null;
}

export interface PicksPhoto {
  id: string;
  name: string;
  thumbUrl: string;
  width: number;
  height: number;
  scores: PicksScores | null;
  critique: string | null;
  genres: PicksGenreKey[] | null;
  /** File names of exact copies in the upload, judged once through this photo. */
  duplicates?: string[];
}

export type PicksRankingMode =
  | { kind: "jury"; juryId: string }
  | { kind: "criterion"; criterion: PicksCriterionKey };

export interface RankedPhoto {
  photo: PicksPhoto;
  rank: number;
  score: number;
}

export type PicksStep = "welcome" | "processing" | "results";

// Upload starts when the checkout opens; judging starts on payment and runs
// over whatever has already arrived while the rest keeps uploading.
export interface PicksTransferState {
  total: number;
  uploaded: number;
  failed: number;
  startedAt: number | null;
}

export interface PicksJudgingState {
  judged: number;
  startedAt: number;
  done: boolean;
}
