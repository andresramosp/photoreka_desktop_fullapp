/**
 * Photoreka Picks — anonymous, paid scoring product.
 *
 * Criteria and genres live here on purpose, apart from config/photo_schema: Picks
 * adds or drops criteria without touching the main analyzer. The descriptions
 * started as a copy of the `style` variant. The web app mirrors the keys and
 * labels in web/src/config/picks.ts.
 */

import type { ModelName } from '#services/models_service'

export const PICKS_MAX_PHOTOS = 5000
export const PICKS_PRICE_PER_PHOTO_EUR = 0.01
/** Stripe charges a fixed fee per payment, so tiny orders pay this floor. */
export const PICKS_MIN_CHARGE_EUR = 1
export const PICKS_RETENTION_DAYS = 30
export const PICKS_R2_PREFIX = 'picks'

/** Free trial: a separate, smaller order; buying afterwards starts a new one. */
export const PICKS_FREE_TRIAL = {
  photos: 10,
  perIpPerDay: 1,
  perDay: 50,
} as const

export const PICKS_JUDGING = {
  scoreModel: 'gpt-5.1' as ModelName,
  genreModel: 'gemini-2.5-flash-lite' as ModelName,
  imagesPerBatch: 8,
  /** Batches in flight per session: 5,000 photos in under 30 minutes. */
  batchesPerSession: 16,
  /** LLM calls in flight across every session, so several orders cannot exhaust the API limits. */
  globalCalls: 48,
  maxAttemptsPerPhoto: 3,
  pollMs: 1500,
  /** Without upload-complete, a session whose uploads stopped this long ago is judged as is. */
  uploadIdleMs: 10 * 60 * 1000,
  /** A runner that has not refreshed its lock in this window is considered dead. */
  lockTtlSeconds: 60,
} as const

export type PicksCriterionKey =
  | 'aesthetics'
  | 'composition'
  | 'storytelling'
  | 'originality'
  | 'message'
  | 'humor'
  | 'visual_games'
  | 'spontaneity'

export const PICKS_CRITERIA: { key: PicksCriterionKey; description: string }[] = [
  {
    key: 'aesthetics',
    description:
      'Evaluate the beauty of the photo in a visual, aesthetic, and immediate sense, without narrative or thematic considerations. Use the example of pictorial beauty as a starting point. Is the light and color pleasing to the eye? It can be beautiful in both a naive and dramatic sense.',
  },
  {
    key: 'composition',
    description:
      'Evaluate the compositional harmony, the balance of the elements in the photo, how they are distributed throughout the frame; do they form clear and pleasing patterns, does it make the photo legible, giving the eye a path to follow? Is there a clear eye-catcher that immediately draws the eye and orders the rest of the elements?',
  },
  {
    key: 'storytelling',
    description:
      'Are there characters in the photo whose interactions, gestures, and emotions invite us to imagine a story behind them, whether obvious or more symbolic? Evaluate it here as if it were a play. How much of a play is it?',
  },
  {
    key: 'originality',
    description:
      "Does the photo have any unique qualities that set it apart from the rest? Whether it's an everyday situation with something out of place, a striking detail, a surreal atmosphere, or a novel composition, evaluate how original, memorable or unusual the photo is.",
  },
  {
    key: 'message',
    description:
      'Does the photo convey a powerful message, whether social/human (in documentary/street photography) or more figurative/symbolic (in conceptual photography)? Does it invite reflection on the human condition or the world?',
  },
  {
    key: 'humor',
    description:
      'Does the photo have a humorous element, whether intentional or accidental? It can be a funny situation, an ironic twist, or a visual pun. Consider also possible spicy or erotic-humorous allusions, within healthy limits. Evaluate how effectively the humor is conveyed.',
  },
  {
    key: 'visual_games',
    description:
      "Does the photo feature visual games, illusions, surprising alignments, or perceptual tricks that create a playful or intriguing effect? This may involve reflections, unexpected spatial relationships, visual framing, clever compositions, or other elements that challenge or reward the viewer's perception.",
  },
  {
    key: 'spontaneity',
    description:
      'Does the moment feel spontaneous and unforced? For real-life situations, evaluate whether the image feels real and candid. For portraits and selfies, evaluate how natural and relaxed the subjects appear. For photos without people, always set to 1.',
  },
]

export type PicksGenreKey =
  | 'street'
  | 'documentary'
  | 'landscape'
  | 'portrait'
  | 'travel'
  | 'fine_art'

export const PICKS_GENRES: { key: PicksGenreKey; description: string }[] = [
  {
    key: 'street',
    description: 'Candid life in public space: people, streets, cities, everyday scenes.',
  },
  {
    key: 'documentary',
    description: 'Real events, social or human situations recorded as testimony.',
  },
  {
    key: 'landscape',
    description: 'Natural or urban scenery where the place itself is the subject.',
  },
  {
    key: 'portrait',
    description: 'One or a few people as the main subject, posed or not.',
  },
  {
    key: 'travel',
    description: 'A sense of a specific place or culture seen by a visitor.',
  },
  {
    key: 'fine_art',
    description: 'Conceptual, abstract or expressive images driven by an artistic idea.',
  },
]

export const PICKS_CRITERION_KEYS = PICKS_CRITERIA.map((c) => c.key)
export const PICKS_GENRE_KEYS = PICKS_GENRES.map((g) => g.key)

/** Integer euro-cents; the server is the only source of truth for the charge. */
export function computePicksAmountCents(photoCount: number): number {
  const photoCents = Math.round(photoCount * PICKS_PRICE_PER_PHOTO_EUR * 100)
  return Math.max(PICKS_MIN_CHARGE_EUR * 100, photoCents)
}
