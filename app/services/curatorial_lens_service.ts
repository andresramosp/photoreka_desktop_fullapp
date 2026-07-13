import { HumanMessage } from '@langchain/core/messages'
import { buildCuratorialManual } from '../utils/curatorial_lenses_content.js'

/**
 * curatorial_lens_service.ts
 * -----------------------------------------------------------------
 * Decides whether the Phase 2 curator gets the critique manual for the
 * photographer's tradition (see ../utils/curatorial_lenses_content.ts) and builds
 * the message that carries it.
 *
 * DISABLED BY DEFAULT. Set CURATORIAL_LENS_ENABLED=true to turn it on.
 * With the flag off, `buildLensMessage` returns null and the agent behaves exactly
 * as it does today — the whole feature is one env var and two small call sites in
 * LangchainAgentService.
 *
 * ── The gate: `needs_artistic_evaluation` AND thumbnails present ──
 *
 * The first half is a real condition, not a rubber stamp: measured over 22
 * representative queries the flag fires on about half and separates the unambiguous
 * cases cleanly (every critique/ranking query true, every retrieval/app query false).
 * But it is derived from the QUERY TEXT ALONE, so on its own it cannot tell whether
 * the curator ends up with anything to look at.
 *
 * The second half closes that, and it needs no prediction: this gate is evaluated
 * INSIDE runPhase2, after buildPhase2VisualContext has already run, so the thumbnail
 * count is a settled fact rather than a forecast. That matters, because the photos in
 * front of the curator are not only the ones the user attached — a turn like "find my
 * best photo and tell me why it's the best" attaches nothing, yet `search_advanced`
 * results are image-eligible and arrive in Phase 2 with thumbnails. Both paths open
 * the gate, without the gate having to distinguish them.
 *
 * Thumbnails are also the RIGHT condition, not merely a convenient one. The manual
 * earns its keep on concrete frames — was that occlusion a device or a mistake, does
 * that gesture carry the picture — and a description is a lossy summary that cannot
 * settle such a question. On a text-and-statistics turn the conventional answer is
 * usually good enough, so the manual buys little and risks inviting the model to
 * invent visual events it never saw.
 *
 * WHICH manual is chosen depends only on the user's PROFILE, never on the genre of
 * the photos — see the header of curatorial_lenses_content.ts for why.
 * -----------------------------------------------------------------
 */

/** Master switch. Off unless explicitly enabled in the environment. */
export function isCuratorialLensEnabled(): boolean {
  return process.env.CURATORIAL_LENS_ENABLED === 'true'
}

export type LensGateInput = {
  /** From QueryService.classifyQuery — the query asks for subjective judgment. */
  needsArtisticEvaluation: boolean
  /**
   * Photos that reached Phase 2 carrying an actual thumbnail image — whether the user
   * attached them or the agent's own search surfaced them. A settled count, not a guess:
   * this is read after the Phase 2 visual context is built.
   */
  thumbnailCount: number
}

/**
 * The gate. Kept pure and separate from the agent so the policy can be changed,
 * A/B'd, or replaced by a dedicated classifier in one place.
 */
export function shouldInjectLens(input: LensGateInput): boolean {
  if (!isCuratorialLensEnabled()) return false
  if (!input.needsArtisticEvaluation) return false
  // The manual is for looking at photographs. No images in front of the curator, no manual.
  return input.thumbnailCount > 0
}

export type LensBuildInput = LensGateInput & {
  /** The stored `UserProfile`. The tradition to judge by; `general`/null yields nothing. */
  profile?: string | null
}

/**
 * Builds the message injected at the tail of the Phase 2 context — immediately before
 * PHASE2_TRIGGER, so the critique frame is the last thing the curator reads before it
 * judges.
 *
 * Returns null when the gate is closed or the profile declares no tradition, in which
 * case the caller adds nothing at all.
 *
 * It rides in a HumanMessage rather than a second SystemMessage because Gemini takes a
 * single system instruction, and Phase 2 already stacks consecutive HumanMessages for
 * the visual context. The header marks it as internal guidance so the model does not
 * mistake it for something the user said.
 */
export function buildLensMessage(input: LensBuildInput): HumanMessage | null {
  if (!shouldInjectLens(input)) return null

  const manual = buildCuratorialManual(input.profile)
  if (!manual) return null

  return new HumanMessage(
    '[CURATORIAL CRITIQUE FRAMEWORK — internal guidance for your evaluation, not a message from the user. ' +
      'It refines HOW you read the work above; it does not change what the user asked for, ' +
      'and it never overrides the grounding rules.]\n\n' +
      manual
  )
}
