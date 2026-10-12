import { HumanMessage } from '@langchain/core/messages'
import { buildCuratorialManual, SEQUENCING_MANUAL } from '../../utils/curatorial_lenses_content.js'

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
 * ── The gate: `needs_artistic_evaluation` AND thumbnails present AND not curation mode ──
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
 * The third condition is curation mode: a progressive-exploration round answers in one
 * tight paragraph under 500 characters, and the manual asks the curator to reason out loud.
 * The two cannot both be honoured, so the manual stays off for those turns. See shouldInjectLens.
 *
 * WHICH manual is chosen depends only on the user's PROFILE, never on the genre of
 * the photos — see the header of curatorial_lenses_content.ts for why.
 *
 * ── The sequencing manual ──
 *
 * A second, profile-independent manual rides in the same message: how to edit, order, pair
 * and group photos. It shares the thumbnail and curation-mode conditions (it too is about
 * concrete frames, and it too asks the curator to explain itself), but is keyed on
 * `needs_sequencing` instead of `needs_artistic_evaluation`, and `general` gets it as well.
 * The two keys are independent, so a turn can carry either manual, both, or neither.
 * -----------------------------------------------------------------
 */

/** Master switch. Off unless explicitly enabled in the environment. */
export function isCuratorialLensEnabled(): boolean {
  return process.env.CURATORIAL_LENS_ENABLED === 'true'
}

export type LensGateInput = {
  /** From QueryService.classifyQuery — the query asks for subjective judgment. */
  needsArtisticEvaluation: boolean
  /** From QueryService.classifyQuery — the answer arranges photos that must work together. */
  needsSequencing: boolean
  /**
   * Photos that reached Phase 2 carrying an actual thumbnail image — whether the user
   * attached them or the agent's own search surfaced them. A settled count, not a guess:
   * this is read after the Phase 2 visual context is built.
   */
  thumbnailCount: number
  /**
   * The turn is a progressive-exploration round — the user's toggle (ChatSession.curationMode)
   * or a template that pins it (ChatTemplateDefinition.curationMode). Its reply is
   * capped at one tight paragraph under 500 characters — no room for the manual, which asks
   * the curator to name the device and resolve its intent test out loud. See shouldInjectLens.
   */
  curationMode: boolean
}

/** The two manuals the lens message can carry. */
export type LensPart = 'critique' | 'sequencing'

/**
 * The gate, per manual. Kept pure and separate from the agent so the policy can be changed,
 * A/B'd, or replaced by a dedicated classifier in one place.
 */
export function shouldInjectLens(input: LensGateInput): Record<LensPart, boolean> {
  const closed = { critique: false, sequencing: false }
  if (!isCuratorialLensEnabled()) return closed
  // Both manuals ask the curator to VERBALIZE its reading — name the organizing event, state
  // the strategy and the decisive transitions. That is incompatible with a curation turn's
  // one-paragraph, sub-500-character budget, so they are off there rather than injected and
  // then silently ignored (or blowing the length limit).
  if (input.curationMode) return closed
  // The manuals are for looking at photographs. No images in front of the curator, no manual.
  if (input.thumbnailCount === 0) return closed
  return { critique: input.needsArtisticEvaluation, sequencing: input.needsSequencing }
}

export type LensBuildInput = LensGateInput & {
  /** The stored `UserProfile`. The tradition to judge by; `general`/null yields no critique manual. */
  profile?: string | null
}

/**
 * Builds the message injected at the tail of the Phase 2 context — immediately before
 * PHASE2_TRIGGER, so the critique frame is the last thing the curator reads before it
 * judges.
 *
 * Returns null when neither manual applies — gate closed, or only the critique manual was
 * called for and the profile declares no tradition — in which case the caller adds nothing.
 * `injected` names the manuals the message actually carries, for the run log and the dump.
 *
 * It rides in a HumanMessage rather than a second SystemMessage because Gemini takes a
 * single system instruction, and Phase 2 already stacks consecutive HumanMessages for
 * the visual context. The header marks it as internal guidance so the model does not
 * mistake it for something the user said.
 */
export function buildLensMessage(
  input: LensBuildInput
): { message: HumanMessage; injected: LensPart[] } | null {
  const gate = shouldInjectLens(input)
  const manuals: Record<LensPart, string> = {
    critique: gate.critique ? buildCuratorialManual(input.profile) : '',
    sequencing: gate.sequencing ? SEQUENCING_MANUAL : '',
  }
  const injected = (['critique', 'sequencing'] as const).filter((part) => manuals[part])
  if (injected.length === 0) return null

  return {
    message: new HumanMessage(
      '[Internal guidance for evaluating the photos above, not a message from the user. ' +
        'It changes how you read the photos, not what the user asked for, ' +
        'and it does not override the grounding rules.]\n\n' +
        injected.map((part) => manuals[part]).join('\n\n')
    ),
    injected,
  }
}
