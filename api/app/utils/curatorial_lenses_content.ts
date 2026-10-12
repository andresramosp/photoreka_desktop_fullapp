/**
 * curatorial_lenses_content.ts
 * -----------------------------------------------------------------
 * Critique manuals for the chat curator (Phase 2), keyed by the photographer's
 * PROFILE — the tradition they work in — not by the genre of any single frame.
 *
 * WHY THIS EXISTS
 * The Phase 2 role prompt already tells the curator WHICH criteria to weight — it injects
 * the photographer's own numeric weight vector — but says nothing about HOW to look. With no
 * critical frame in context the model falls back on textbook priors: it reads a
 * deliberate device (an occluded face, a merger, an amputated limb) as a defect, and
 * reads competent convention (golden hour, a lone silhouette, a flattering headshot)
 * as merit. Extra reasoning budget does not fix that — it only produces a more
 * eloquent conventional verdict. These manuals supply the missing frame.
 *
 * WHY PROFILE AND NOT GENRE
 * `genre` is a multi-label SUB-CATEGORY inside a tradition, not a tradition itself:
 * a photo carries several genre tags at once, and the five style profiles all draw
 * from the same five values, so the label says nothing about which standards apply.
 * It describes the SHAPE of the frame, not the practice that produced it — a street
 * photographer's wide city view is tagged `landscape` but it is street work, and
 * judging it with a landscape manual (golden hour, silky water) would be actively
 * wrong. The tradition comes from the author. Genre plays no part in selection.
 *
 * DESIGN CONTRACT — read before editing
 * 1. Operational, not essayistic. Every line must change a judgment. No history,
 *    no name-dropping, no theory the model can recite instead of applying.
 * 2. Symmetric. Each manual must promote hidden merit AND demote competent cliché.
 *    A manual that only rescues "flaws" produces a sycophant that justifies every
 *    defect as intentional — strictly worse than no manual.
 * 3. Generic, not score-coupled. The manual teaches HOW to look; it must NOT restate the
 *    app's artistic_scores weights. The Phase 2 role prompt already injects the
 *    photographer's own numeric weight vector, and a second hand-written mapping here only
 *    drifts from it and contradicts it. Keep the manual in the language of practice.
 * 4. Dual profiles = ONE fused manual per pair, the length of a single manual. It
 *    states what the combination values and how to judge when the two traditions
 *    disagree. Never stack the two single manuals: that doubles the context and
 *    leaves the model to average two verdicts. See DUAL_MANUALS.
 *
 * `general` has no manual: it declares no tradition, so there is no standard to
 * apply and nothing is injected.
 *
 * SEQUENCING_MANUAL is the exception to all of the above: how to edit, order, pair and
 * group photos does not depend on the tradition, so it is one text for every profile,
 * `general` included. It names the per-tradition defaults itself, in one paragraph.
 *
 * CONTENT LOCATION
 * The actual manual text lives as plain Markdown files under
 * `app/content/curatorial_lenses/`, one file per block, so they can be read and
 * edited directly without touching TypeScript. This module only loads them and
 * wires up the lookup/assembly logic. See adonisrc.ts `metaFiles` for why the
 * build copies that directory.
 * -----------------------------------------------------------------
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = path.resolve(__dirname, '../content/curatorial_lenses')

function loadContent(fileName: string): string {
  return readFileSync(path.join(CONTENT_DIR, fileName), 'utf-8').trim()
}

/** The tradition a manual describes. Mirrors the components of `UserProfile`. */
export type CuratorialProfile = 'street' | 'documentary' | 'artistic' | 'commercial'

// -----------------------------------------------------------------
// UNIVERSAL — the stance that precedes any manual
// -----------------------------------------------------------------

export const CURATORIAL_STANCE = loadContent('stance.md')

// -----------------------------------------------------------------
// PROFILE MANUALS
// -----------------------------------------------------------------

const STREET_MANUAL = loadContent('street.md')
const DOCUMENTARY_MANUAL = loadContent('documentary.md')
const ARTISTIC_MANUAL = loadContent('artistic.md')
const COMMERCIAL_MANUAL = loadContent('commercial.md')

// -----------------------------------------------------------------
// SEQUENCING — profile-independent
// -----------------------------------------------------------------

export const SEQUENCING_MANUAL = loadContent('sequencing.md')

// -----------------------------------------------------------------
// DUAL-PROFILE MANUALS
//
// A dual profile gets ONE fused manual, not the two single manuals stacked. Stacking
// them doubled the context and left the model to average two verdicts; the fused
// manual states what the combination values and how to judge when the two traditions
// disagree, in the same length as a single manual.
// -----------------------------------------------------------------

/** Canonical `a+b` key (components sorted) → the fused manual for that dual. */
const DUAL_MANUALS: Readonly<Record<string, string>> = {
  'documentary+street': loadContent('street_documentary.md'),
  'artistic+street': loadContent('street_artistic.md'),
  'artistic+documentary': loadContent('documentary_artistic.md'),
} as const

// -----------------------------------------------------------------
// REGISTRY & LOOKUP
// -----------------------------------------------------------------

const PROFILE_MANUALS: Readonly<Record<CuratorialProfile, string>> = {
  street: STREET_MANUAL,
  documentary: DOCUMENTARY_MANUAL,
  artistic: ARTISTIC_MANUAL,
  commercial: COMMERCIAL_MANUAL,
} as const

/**
 * A single component of a stored `UserProfile` → the tradition it declares.
 * `general` is deliberately absent: it declares no tradition, so nothing is injected.
 */
const PROFILE_TOKEN_TO_TRADITION: Readonly<Record<string, CuratorialProfile>> = {
  'street-photography': 'street',
  'documentary': 'documentary',
  'artistic': 'artistic',
  'commercial': 'commercial',
} as const

/**
 * Parses a stored `UserProfile` into the traditions it declares, order-insensitively.
 *
 * Splitting on `|` rather than matching the whole string is the point: the component
 * order in the DB does not match the declared union in #models/user — real rows hold
 * `artistic|street-photography` while the type says `street-photography|artistic` — and
 * prompts/descriptions.ts already works around it by enumerating both permutations by
 * hand. A lookup keyed by the full string silently returns nothing for a profile it
 * should have matched.
 */
export function parseProfileTraditions(profile: string | null | undefined): CuratorialProfile[] {
  if (!profile) return []
  const found = new Set<CuratorialProfile>()
  for (const token of profile.split('|')) {
    const tradition = PROFILE_TOKEN_TO_TRADITION[token.trim().toLowerCase()]
    if (tradition) found.add(tradition)
  }
  return [...found]
}

/**
 * Assembles the critique block for a photographer's declared tradition(s).
 *
 * Genre plays no part: it is a multi-label sub-category inside the practice, not a
 * practice of its own. One profile → stance + its manual. A dual profile → stance +
 * the fused manual for that pair. A pair without a fused manual (none exists in
 * `UserProfile` today) falls back to the two single manuals stacked.
 *
 * Returns an empty string for `general` and `null` — no declared tradition means no
 * standard to apply, the caller injects nothing, and the agent behaves exactly as it
 * does today.
 */
export function buildCuratorialManual(profile: string | null | undefined): string {
  const traditions = parseProfileTraditions(profile)
  if (traditions.length === 0) return ''

  const manual =
    traditions.length === 1
      ? PROFILE_MANUALS[traditions[0]]
      : (DUAL_MANUALS[[...traditions].sort().join('+')] ??
        traditions.map((t) => PROFILE_MANUALS[t]).join('\n\n'))

  return [CURATORIAL_STANCE, manual].join('\n\n')
}
