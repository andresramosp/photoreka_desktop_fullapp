/**
 * curatorial_lenses_content.ts
 * -----------------------------------------------------------------
 * Critique manuals for the chat curator (Phase 2), keyed by the photographer's
 * PROFILE — the tradition they work in — not by the genre of any single frame.
 *
 * WHY THIS EXISTS
 * The agent's only style guidance today is a weighting hint ("Street: candidness,
 * visual_games, originality") — which criteria to weight, never HOW to look. With no
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
 * 3. Score-anchored. Each manual ends by mapping its reading onto the existing
 *    artistic_scores criteria, so it biases the rubric already in play.
 * 4. Dual profiles = both manuals + a tension block that resolves ONLY their
 *    conflict. The two manuals already carry both vocabularies; restating them
 *    would double the context to say the same thing. See DUAL_TENSIONS.
 *
 * `general` has no manual: it declares no tradition, so there is no standard to
 * apply and nothing is injected.
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
// DUAL-PROFILE TENSIONS
//
// A dual profile is NOT a third manual. Both manuals already carry both
// vocabularies; restating them would double the context to say the same thing.
// The only information a dual adds is the INTERFERENCE — what to do when the two
// traditions reach opposite verdicts on the same frame. Each block below encodes
// that conflict resolution and nothing else.
// -----------------------------------------------------------------

const TENSION_STREET_DOCUMENTARY = loadContent('tension_street_documentary.md')
const TENSION_STREET_ARTISTIC = loadContent('tension_street_artistic.md')
const TENSION_DOCUMENTARY_ARTISTIC = loadContent('tension_documentary_artistic.md')

// -----------------------------------------------------------------
// REGISTRY & LOOKUP
// -----------------------------------------------------------------

const PROFILE_MANUALS: Readonly<Record<CuratorialProfile, string>> = {
  street: STREET_MANUAL,
  documentary: DOCUMENTARY_MANUAL,
  artistic: ARTISTIC_MANUAL,
  commercial: COMMERCIAL_MANUAL,
} as const

/** Canonical `a×b` key (components sorted) → the interference block for that dual. */
const DUAL_TENSIONS: Readonly<Record<string, string>> = {
  'documentary+street': TENSION_STREET_DOCUMENTARY,
  'artistic+street': TENSION_STREET_ARTISTIC,
  'artistic+documentary': TENSION_DOCUMENTARY_ARTISTIC,
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
 * both manuals + the tension block that resolves their conflicting verdicts, so the
 * model is told how to arbitrate rather than left to average them into a bland middle.
 *
 * Returns an empty string for `general` and `null` — no declared tradition means no
 * standard to apply, the caller injects nothing, and the agent behaves exactly as it
 * does today.
 */
export function buildCuratorialManual(profile: string | null | undefined): string {
  const traditions = parseProfileTraditions(profile)
  if (traditions.length === 0) return ''

  const blocks = [CURATORIAL_STANCE, ...traditions.map((t) => PROFILE_MANUALS[t])]

  if (traditions.length === 2) {
    const tension = DUAL_TENSIONS[[...traditions].sort().join('+')]
    if (tension) blocks.push(tension)
  }

  return blocks.join('\n\n')
}
