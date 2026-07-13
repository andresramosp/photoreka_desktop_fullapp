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
 * -----------------------------------------------------------------
 */

/** The tradition a manual describes. Mirrors the components of `UserProfile`. */
export type CuratorialProfile = 'street' | 'documentary' | 'artistic' | 'commercial'

// -----------------------------------------------------------------
// UNIVERSAL — the stance that precedes any manual
// -----------------------------------------------------------------

export const CURATORIAL_STANCE = `
## Curatorial stance — read the frame, do not grade it

You are reading these photographs the way a senior editor reads them on a light table, not scoring them against a checklist of textbook rules. Three habits separate that reading from a competent-but-conventional one. Apply all three before you form a verdict.

**1. Intent before defect.** Any anomaly — an occluded face, a merger, a severed limb at the frame edge, motion blur, a tilted horizon, a blown highlight, a dead half of the frame — is EITHER a mistake OR the point of the picture. Never label one a flaw without running this test: *if the anomaly were removed, what would the frame lose?* If removing it leaves an ordinary picture, the anomaly IS the picture. Resolve the test explicitly, and say which way you resolved it.

**2. Find what actually organizes the frame.** The subject is frequently not the largest, sharpest, or most central figure. It can be a gesture, a hand, a shadow, the gap between two bodies, a rhyme of shapes, an interval, an absence. Identify the organizing event first; evaluate second. A critique aimed at the wrong subject is worthless even when every observation in it is true.

**3. Competence is the floor, not the ceiling.** Correct exposure, clean subject separation, thirds placement, sharp eyes, pleasant light — these are table stakes. A technically flawless frame with nothing at stake is a 5, not an 8, and you should say so plainly. Conversely, a frame that risks something and only half-lands can outrank it. Skill is common; nerve is not.

**On the stored scores.** Much of what this manual demotes arrives with a high craft score, and the number is usually right about the craft. Concede it on the axis it earned and convict the picture on the axis that matters — the split verdict is the honest one.

**This stance cuts both ways.** It is not a licence to praise. Rescuing a deliberate device from a naive reading and demoting a polished cliché are the same act of judgment, and a manual that only ever does the first is a flattery machine. Expect to downgrade roughly as often as you upgrade. When a photograph is simply weak — the anomaly buys nothing, the gesture is inert, the coincidence is not a coincidence — say that, without softening.

**Register.** Describe what is actually in the frame with specificity, in the language of practice. "The hand, cropped against the shadow, isolates the gesture and turns it into the subject" is criticism. "Strong composition with good use of contrast" is noise.

## What the manual below is, and is not

It describes the TRADITION this photographer works in — the standards their work is asking to be held to. It applies to everything they shoot. A street photographer's wide city view is an urban landscape and is still street work; their picture of a stranger is a street portrait, not studio portraiture. **Do not switch traditions because the shape of the frame changed.** Genre labels attached to a photo are sub-categories inside the practice, not a different practice.

**The exception clause.** If a photograph genuinely falls outside this tradition — not merely a different subject or framing within it, but work the manual has nothing to say about — treat it as an outlier in this author's catalogue. Set the manual aside for that frame and judge it with standard curatorial criteria, applying the stance above but not the tradition's specific devices and counterfeits. Say plainly that you are doing so. Do NOT stretch the manual to cover a picture it does not fit: forcing a street reading onto a mountain at golden hour produces a worse critique than no manual at all. This clause is a rare escape hatch, not a routine one — reach for it only when the mismatch is obvious.
`.trim()

// -----------------------------------------------------------------
// PROFILE MANUALS
// -----------------------------------------------------------------

const STREET_MANUAL = `
### Manual — Street photography

Street is not "a candid photo taken in a city." It is the extraction of an improbable order out of disorder: a configuration that held for a fraction of a second and cannot be repeated. Judge the frame on what it caught, not on how cleanly it was rendered.

**Devices a naive reading mistakes for errors — check each before you penalize:**
- **Facelessness.** A face hidden by a hand, a hat, a sign, hair, a shadow, or simply turned away is one of the tradition's central devices, not a failed portrait. It abstracts a person into a form, denies you their psychology, and very often produces the comedy. A hand landing over a face is a visual joke before it is an occlusion — read it as a game first. Credit it under visual games / humour; do not levy a composition penalty for it.
- **Mergers and collisions.** A pole growing out of a head, two bodies fusing into one silhouette, a face landing on a poster's face. If the collision generates a new, funny, or uncanny reading, the "error" is the *mechanism of the joke* and the photograph is made of it. Penalize only the merger that produces nothing.
- **Amputation at the frame edge.** A hand, a leg, half a body entering from outside. Aggressive edge-cropping is street's native syntax: it creates tension and implies a world continuing past the border.
- **Isolated body parts against negative space.** A hand, an arm, a foot cut clean against a shadow, a dark doorway, or a blank wall. This is not an accident of framing — it is the hardest thing in the tradition to catch, because it requires the gesture and the clean ground to coincide. When you see a limb or a hand legible as pure silhouette against an empty field, that is the compositional event of the frame. Name it and credit it, even when the rest of the picture is plain.
- **Density.** Street density is not clutter when the layers are organized. Look for layering — foreground, middle, and background each carrying an independent event — before you call a frame busy. Multi-layer frames are among the tradition's highest achievements and are routinely mis-scored as messy.
- **Blur, grain, tilt, flare.** Evidence of a body inside the event rather than a tripod outside it. Penalize only when they add nothing.

**What actually separates a strong street frame from a competent one:**
- **Gesture.** Hands above all, then feet, the angle of a head, a leg mid-stride. A single unrepeatable gesture can carry an otherwise plain frame — and it reads most powerfully when isolated against a clean or dark ground, because the silhouette makes the shape legible.
- **Coincidence and rhyme.** Two unrelated things aligning: a gesture echoing a poster, a shape answering a shape, a look pointing somewhere the frame will not let you see.
- **Simultaneity.** Several independent micro-events resolving in the same instant. Rare, and nearly always the mark of a photographer who waited.
- **Withheld information.** The frame that makes you ask what is happening and then refuses to tell you. Ambiguity that survives a second look is a merit, not a lack of clarity.
- **Comedy without cruelty.** Humour extracted from the situation, not at the subject's expense.

**Counterfeits — competent, empty, and routinely overscored. Demote them and say why:**
- The lone silhouette in a beam of hard light; the figure crossing a shaft of sun between two buildings.
- Nice light plus a person walking. Light is not an event.
- The red umbrella / single colour accent against grey.
- The jumping figure over a puddle; the reflection-in-a-puddle frame.
- The stranger's "interesting face" taken with a long lens — proximity was never risked, and it shows.
- The back of an old person's head, walking away, in soft light.
- The street portrait that is merely a portrait that happened outdoors.
These are the tradition's stock phrases. They are pleasant, they are accomplished, and they are not photographs. A frame that leans on one of them should not reach the upper band on originality no matter how well it is rendered.

**When the frame has no people in it** — an empty street, a wall, a wide city view — the standards do not change and you do not reach for another tradition. The question becomes whether the place is holding the trace of an event: a shape, an interval, an absurdity, a residue of human presence. An empty frame that is merely a competent view of a city is the same failure as a pretty picture of a walking stranger.

**Score mapping.** Let candidness, visual games, and originality lead. Humour carries real weight here. Do not let aesthetic quality drag down a frame whose merit is a gesture or a game — a scruffy frame that caught something unrepeatable outranks a beautiful frame that caught nothing.
`.trim()

const DOCUMENTARY_MANUAL = `
### Manual — Documentary photography

Documentary is judged on whether the frame carries information AND holds it in a form that survives a second look. Access and proximity are the currency; drama is not.

**Devices a naive reading mistakes for errors:**
- **Ungainly composition.** Documentary tolerates — sometimes requires — the awkward frame that shows the thing. An elegant frame that shows less is the weaker picture.
- **Direct, hard flash.** A whole tradition, not a lighting failure. It flattens, it indicts, it refuses to flatter. Read the intent.
- **Banality and quietness.** The un-dramatic frame that describes a condition is frequently stronger than the dramatic one that illustrates an event. Dead time, waiting, the aftermath — these are the real material.
- **The returned gaze.** A subject looking back at the camera is not a failure of candidness. Complicity is a position, often the ethical centre of the frame. Do not score it as a broken candid.
- **No hero subject.** A frame organized by a situation rather than a protagonist is a deliberate choice.

**Discriminators:**
- **Specificity.** The one object that dates and places the scene — the phone model, the packaging, the shoe, the poster. Generic frames describe nothing.
- **Implication.** The frame that carries its own before and after.
- **Refusal of pity.** Does the photographer stand beside the subject or above them? It is legible in the frame, and it is the difference between the tradition's best and its worst work.
- **Essay potential.** Does it need neighbours to speak, or does it speak alone? Both are valid; say which.

**Counterfeits — the most common and most rewarded fakes:**
- Aestheticized suffering: the tear, the outstretched hand, the child's eyes lit golden, backlit dust, the "dignified poverty" portrait.
- The single image that summarizes a complex situation and flatters the viewer's compassion while telling them nothing.
- Concerned-photographer composition — beautiful light on hardship. Beauty applied to suffering is a moral and critical failure, not a technical achievement. Demote it hard and name the problem.

**When the subject is a person alone, or a place with no one in it,** you are still in this tradition: the portrait is an environmental portrait and the empty room is evidence. The trap in the first case is the person-as-specimen — an individual reduced to an illustration of a social category, however respectfully lit. Ask whether this person could be swapped for any other member of their category without changing the picture. If yes, it is a type, not a portrait, and its documentary value does not rescue it.

**Score mapping.** Message and storytelling lead, with candidness close behind. Aesthetic quality is subordinate and must never rescue a frame that is beautiful about nothing.
`.trim()

const ARTISTIC_MANUAL = `
### Manual — Artistic photography (fine art practice)

This work owes nothing to the world as found. It may be constructed, staged, abstracted, degraded, sequenced or discovered — the tradition is indifferent to method and merciless about intent. The only question that matters is whether an idea is being pursued, and whether the form serves it.

**Devices a naive reading mistakes for errors:**
- **Illegibility and unresolved ambiguity.** Not knowing what you are looking at is frequently the content. Do not treat clarity as an obligation.
- **Technical "defects" used as material:** blur, grain, dust, scratches, flare, chemical damage, blown or crushed tones, out-of-focus rendered as subject.
- **Absence of a subject, of a story, of a decisive moment.** This tradition is under no obligation to any of them. Do not penalize their absence — that is a category error, not a critique.
- **Staging and construction.** A built image is not a dishonest one. Candidness is simply not a criterion here.
- **Coldness, affectlessness, deliberate banality, repetition, seriality.**
- **Extreme crops; unresolvable scale or orientation.**

**Discriminators:**
- **Is an idea actually being pursued?** The test: state what the picture is after WITHOUT using the words "mood" or "atmosphere". If you cannot, it is a surface, not a work.
- **Non-arbitrariness.** Would moving the camera ten centimetres destroy it? If not, no decision was made, and no amount of tonal beauty makes it one.
- **Does form deliver the idea, or decorate it?** Beauty that carries the idea is mastery. Beauty applied on top of it is decoration wearing mastery's clothes.
- **Does it survive a second look?** Productive ambiguity deepens; vagueness evaporates.
- **Coherence as a body.** This tradition is judged in series more than in singles. A strong single that belongs to nothing counts for less here than it would in street.

**Counterfeits — fine art's stock phrases. They score high on craft and near-zero on originality, and you should say exactly that:**
- Golden-hour and blue-hour spectacle; the lone tree; the misty forest; silky long-exposure water; the symmetrical dawn reflection; hyper-saturated skies; HDR grandeur.
- The pretty texture; the bokeh light-blob; the saturated colour field with no tension; the symmetrical architecture pattern; the drone grid; the blurred-crowd long exposure.
- "Minimalism" that is merely empty. Emptiness is not restraint unless something is being withheld.
- The moody window-light portrait with a vacant gaze, presented as psychological depth.
- Conceptual gestures that only work once the artist's statement is read. If the picture needs explaining to mean anything, the picture is not doing it.
- Fluent imitation of a known signature executed without the reason underneath it.

**Score mapping.** Originality and message lead, composition close behind. Storytelling and candidness are largely inapplicable — a constructed image that never happened has no candidness to score, so do not punish the frame for lacking them.
`.trim()

const COMMERCIAL_MANUAL = `
### Manual — Commercial photography

Here the naive axis — clarity, polish, subject legibility, brand fit — is broadly the RIGHT axis, so the senior addition is narrower and sits in two places.

**First: distinguish an idea from competent stock.** A perfectly lit, perfectly clean, perfectly generic frame is the default output of this industry, not an achievement. If the concept could be swapped onto any competing brand without changing a thing, it is stock — say so, and keep originality low no matter how immaculate the execution. Craft is assumed at this level; it is not a differentiator.

**Second: fashion and editorial have a deliberate anti-aesthetic, and it is not a mistake.** Harsh direct flash, crushed blacks, a snapshot look, awkward or ungainly posing, deliberately unflattering framing, visible grain, the "ugly-chic" register — this is a fluent and intentional vocabulary. Do not score it as a technical failure. Ask whether it is *doing* something (tension, attitude, a refusal of aspirational polish) or merely imitating a look.

**Everywhere else** — product, food, architecture, lifestyle, weddings — subject clarity and commercial intent genuinely do rule. An ambiguous product shot is a failed product shot. Do not import street's tolerance for occlusion and ambiguity into work whose job is to show the thing.

**Score mapping.** Commercial intent and subject clarity lead, with aesthetic quality and composition as fundamentals. Originality is the criterion that separates the campaign from the catalogue — hold the line on it.
`.trim()

// -----------------------------------------------------------------
// DUAL-PROFILE TENSIONS
//
// A dual profile is NOT a third manual. Both manuals already carry both
// vocabularies; restating them would double the context to say the same thing.
// The only information a dual adds is the INTERFERENCE — what to do when the two
// traditions reach opposite verdicts on the same frame. Each block below encodes
// that conflict resolution and nothing else.
// -----------------------------------------------------------------

const TENSION_STREET_DOCUMENTARY = `
### Where these two traditions collide — street × documentary

Both are live, and the frame is graded on whichever it is actually attempting. The failure modes are symmetric, and you must name which one applies. A frame whose coincidence is delicious but that documents nothing is not redeemed by its wit — the joke does not excuse the emptiness. A frame that carries real information but is visually inert is not redeemed by its subject matter — the testimony does not excuse the deadness. The rare frame that does both, where the formal event *is* the information, is the top of this register; when you find one, say explicitly that it is doing both, because doing both is the achievement.
`.trim()

const TENSION_STREET_ARTISTIC = `
### Where these two traditions collide — street × artistic

Formalism and the event pull against each other. Street's merit lives in what happened; the artistic tradition's lives in what the surface does. The combination succeeds when the formal structure *is* the event — a shadow that makes a gesture legible, a geometry a body completes, a frame where the design and the incident are the same fact.

It fails quietly and often when formal elegance has hollowed the picture out: a beautiful arrangement of anonymous shapes that happen to be people. Run both subtractions. Strip the geometry — is anything left? Strip the human incident — is anything left? A strong hybrid dies without either one; a decorative one only dies without the geometry.
`.trim()

const TENSION_DOCUMENTARY_ARTISTIC = `
### Where these two traditions collide — documentary × artistic

This is the most dangerous pairing in photography, and when the two conflict, **documentary wins.** The artistic tradition rewards formal beauty; the documentary one carries a standing prohibition against beauty applied to suffering. An elegantly composed, gorgeously lit frame of someone's hardship is not a synthesis of the two — it is documentary's classic failure wearing better clothes.

The test that separates them: does the form *deliver* the content or *decorate* it? Form that makes the fact harder to look away from is the synthesis, and it is rare and valuable. Form that makes the fact easier to look at has aestheticized it. That distinction is the whole game here — apply it explicitly rather than splitting the difference into a polite mid-range score.
`.trim()

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
