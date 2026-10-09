// Stand-in for the backend while the Picks UX is designed: deterministic fake
// scores and critiques, plus a timed simulation of the processing job.

import {
  PICKS_CRITERIA,
  PICKS_GENRES,
  type PicksCriterionKey,
  type PicksGenreKey,
} from "@/config/picks";
import type { PicksPhoto, PicksScores } from "./types";

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const CRITERION_BIAS: Record<PicksCriterionKey, number> = {
  aesthetics: 0.3,
  composition: 0.2,
  storytelling: -0.4,
  originality: -0.6,
  message: -0.7,
  humor: -2,
  visual_games: -1.2,
  spontaneity: -0.2,
};

const clampScore = (v: number) =>
  Math.round(Math.min(10, Math.max(1, v)) * 2) / 2;

export function mockScores(seed: string): PicksScores {
  const rand = seededRandom(hashString(seed));
  const quality = 5.8 + gaussian(rand) * 1.3;
  const scores: PicksScores = {};
  for (const { key } of PICKS_CRITERIA) {
    scores[key] = clampScore(quality + CRITERION_BIAS[key] + gaussian(rand) * 1.1);
  }
  return scores;
}

const CRITIQUES = {
  high: [
    "The light does the storytelling here: a single warm edge separates the subject from a world that has already gone blue.",
    "A frame built with real patience. Every line leads back to the figure, and the empty space gives it room to breathe.",
    "Rare timing. Half a second earlier this is a snapshot; here the gesture lands exactly where the composition needed it.",
    "Quiet, confident and unusual. It avoids the obvious viewpoint and is better for it.",
    "The colour palette is restrained to three notes, which makes the one accent impossible to ignore.",
    "Layers in depth reward a second look: the background tells its own small story.",
  ],
  mid: [
    "A pleasant scene with good light, but the subject competes with a busy background for attention.",
    "Solid fundamentals. A tighter crop on the right would turn a nice moment into a strong one.",
    "The atmosphere is there; the image just needs a clearer point of interest to hold the eye.",
    "Well exposed and balanced, though the viewpoint is the one most people would choose.",
    "There is a story hinted at the edge of the frame that the composition does not quite commit to.",
    "Good instinct for colour. The horizon tilt and centred subject keep it from feeling deliberate.",
  ],
  low: [
    "The moment probably felt bigger than what the frame managed to hold.",
    "Flat light and a centred subject leave the image without tension or direction.",
    "Several ideas fight for the same space; choosing one of them would help.",
    "A record of the place more than a photograph of it.",
  ],
};

export function mockCritique(seed: string, scores: PicksScores): string {
  const values = Object.values(scores) as number[];
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const pool = mean >= 6.6 ? CRITIQUES.high : mean >= 4.8 ? CRITIQUES.mid : CRITIQUES.low;
  return pool[hashString(`${seed}:critique`) % pool.length];
}

const SECOND_GENRE_CHANCE = 0.3;
const NO_GENRE_CHANCE = 0.08;

export function mockGenres(seed: string): PicksGenreKey[] {
  const rand = seededRandom(hashString(`${seed}:genre`));
  if (rand() < NO_GENRE_CHANCE) return [];
  const pick = () => PICKS_GENRES[Math.floor(rand() * PICKS_GENRES.length)].key;
  const genres = new Set<PicksGenreKey>([pick()]);
  if (rand() < SECOND_GENRE_CHANCE) genres.add(pick());
  return [...genres];
}

const DEMO_RATIOS = [1.5, 0.667, 1.5, 1, 1.778, 0.8, 1.5, 1.333, 0.75, 1.5];
const DEMO_HEIGHT = 560;

export function createDemoPhotos(count: number, scored = true): PicksPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `demo-${i + 1}`;
    const ratio = DEMO_RATIOS[hashString(id) % DEMO_RATIOS.length];
    const width = Math.round(DEMO_HEIGHT * ratio);
    const scores = scored ? mockScores(id) : null;
    return {
      id,
      name: `DSC_${String(1000 + i).padStart(5, "0")}.jpg`,
      thumbUrl: `https://picsum.photos/seed/picks${i + 1}/${width}/${DEMO_HEIGHT}`,
      width,
      height: DEMO_HEIGHT,
      scores,
      critique: scores ? mockCritique(id, scores) : null,
      genres: scored ? mockGenres(id) : null,
      // A few exact copies, so the demo shows how they are grouped.
      duplicates:
        i % 11 === 3
          ? Array.from({ length: 1 + (i % 3) }, (_, n) => `DSC_${String(1000 + i).padStart(5, "0")} (${n + 1}).jpg`)
          : [],
    };
  });
}

const TICK_MS = 120;

// Demo-only stand-in for the browser upload: hands items over one tick at a time.
export function simulateUpload<T>(
  items: T[],
  onUploaded: (item: T) => void,
  durationMs = 9000,
): () => void {
  const perTick = Math.max(1, Math.ceil(items.length / (durationMs / TICK_MS)));
  let cursor = 0;
  const handle = setInterval(() => {
    items.slice(cursor, cursor + perTick).forEach(onUploaded);
    cursor += perTick;
    if (cursor >= items.length) clearInterval(handle);
  }, TICK_MS);
  return () => clearInterval(handle);
}

interface JudgingSource {
  total: () => number;
  pendingIds: () => string[];
  uploadFinished: () => boolean;
  onJudged: (ids: string[]) => void;
  onDone: () => void;
}

// Stand-in for the server job: judges whatever has been uploaded, at a pace
// that would finish the whole set in about `durationMs`, and ends once the
// upload is complete and nothing is left pending.
export function simulateJudging(source: JudgingSource, durationMs = 20000): () => void {
  const handle = setInterval(() => {
    const pending = source.pendingIds();
    const perTick = Math.max(1, Math.ceil(source.total() / (durationMs / TICK_MS)));
    const size = Math.max(1, Math.round(perTick * (0.6 + Math.random() * 0.8)));
    if (pending.length > 0) source.onJudged(pending.slice(0, size));
    if (source.uploadFinished() && pending.length <= size) {
      clearInterval(handle);
      source.onDone();
    }
  }, TICK_MS);
  return () => clearInterval(handle);
}
