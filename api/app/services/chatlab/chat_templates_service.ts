/**
 * Chat templates — guided sessions that narrow the agent to one job.
 *
 * A template does two things the generalist chat cannot: it cuts the tool set down to what
 * the job actually needs, and it swaps the phase prompts for ones written for that job. The
 * saving is real (fewer tool schemas per Phase 1 iteration, a much shorter role prompt, and
 * fewer wasted iterations reaching for tools that don't belong), but the point is behaviour:
 * a session that can only search the catalog cannot wander off into web searches or catalog
 * statistics mid-curation.
 *
 * The client sends `templateId` and nothing else. Prompts and tool allowlists are resolved
 * here, server-side, for the same reason `modeId` is: a tool allowlist or a system prompt
 * arriving in a request body is caller-controlled.
 *
 * The front-end half of a template — the setup form, the mask, the panel CTA — lives in
 * `web/src/config/chatTemplates/` and shares only the id with this file.
 */

import type { QueryClassificationFlags } from '../../utils/classifier_jev.js'

export type ChatTemplateDefinition = {
  id: string
  name: string
  /**
   * Per-template model adjustments. These are resolved server-side from the template id;
   * the client cannot select an arbitrary model name.
   */
  modelOverrides?: {
    /** Used only when Phase 2 needs the expensive artistic-evaluation model. */
    phase2Expensive?: string
  }
  /**
   * Tools Phase 1 may call, by name. `done` is always added on top, and `fetch_basket` is
   * unaffected — it is never bound to the model, only injected by the server.
   *
   * Anything not listed here does not exist as far as Phase 1 is concerned: it is absent
   * from the bound list, so its schema is never sent and it cannot be called. That is why
   * `phase1RoleAddendum` has to be written against exactly this list.
   */
  allowedTools: string[]
  /**
   * REPLACES `PHASE1_ROLE_ADDENDUM` wholesale — it is not merged into it.
   *
   * The general addendum is ~9.6k characters of tool catalog and orchestration patterns
   * that name tools this session will not have. Trimming it per-tool would mean breaking
   * the general prompt into per-tool fragments, which puts the normal chat at risk to
   * serve a special case. A full replacement leaves that path byte-for-byte untouched.
   *
   * Optional since `phase1RoleExtra` exists: a template picks one or the other.
   */
  phase1RoleAddendum?: string
  /**
   * APPENDED to `PHASE1_ROLE_ADDENDUM` instead of replacing it. The other half of the
   * choice above, and the right one whenever a template narrows the tool set without
   * narrowing the job.
   *
   * `phase1RoleAddendum` exists for a session with one task, where the general
   * orchestration patterns are noise — a portfolio brief is not an open conversation.
   * A session that is still an open conversation, only with fewer tools and some extra
   * context, would have to re-derive all of those patterns to replace them, and would
   * re-derive them worse. So it adds instead.
   *
   * The cost is that the general addendum still describes tools the session does not
   * have. That is a line of prose to correct when the allowlist drops two or three of
   * them, and a reason to use `phase1RoleAddendum` instead when it drops most of them.
   */
  phase1RoleExtra?: string
  /**
   * Whether this session's FIRST turn is a real open-ended user message rather than a
   * client-generated brief. Gates `PHASE1_FIRST_TURN_ADDENDUM` (Pattern J: the user who
   * opens a fresh conversation and carries on as if it remembered a previous one).
   *
   * The generalist chat is always an open conversation and gets that pattern with no flag.
   * A template must opt in, and the flag — not the append-vs-replace choice — is what the
   * server keys on: a canvas chat writes its whole Phase 1 prompt with `phase1RoleAddendum`
   * yet is still an open conversation docked to a board, so its first turn can absolutely be
   * "show me those again" aimed at a conversation that isn't here. A guided session whose
   * first turn IS the brief the client generated (portfolio) leaves this off — there is no
   * prior conversation to disown, and the pattern would misfire on a legitimate brief.
   *
   * Requires `app_knowledge` in `allowedTools`, since Pattern J routes there.
   */
  firstTurnIsOpenConversation?: boolean
  /**
   * Appended to the Phase 2 curator prompt, last, so it is the final thing read.
   *
   * This is where a template's user-facing rules have to live, NOT in Phase 1: Phase 1
   * only emits tool calls and never writes a word the user sees. Telling it to "explain
   * that you cannot do that here" would be telling it to do something it structurally
   * cannot do — the curator is the only one that speaks.
   */
  phase2Addendum: string
  /**
   * Routing flags this surface fixes whatever the query classifier says, applied over its
   * result in `initChatSession`. For a flag whose answer depends on context the classifier
   * never sees, so the phases that do see it decide instead. Engine-agnostic: the classifier
   * itself runs unchanged.
   */
  classificationOverrides?: Partial<QueryClassificationFlags>
  /**
   * Activates curation mode for this template: excludes every already-shown photo from
   * `search_advanced` on EVERY turn, not just the ones the classifier reads as "another round".
   * A guided curation session is progressive exploration by definition — re-showing a candidate
   * the user already saw and passed on wastes the round — so the exclusion the generalist chat
   * gates on intent is unconditional here. What the user keeps lives in the basket, which is
   * untouched by this.
   */
  curationMode?: boolean
  /**
   * Turns the Phase-2-driven re-collection off (or on) for this template's sessions,
   * OVERRIDING the global `RECOLLECT_DISABLED` default in the agent service. Undefined
   * inherits that default.
   *
   * The re-collection lets the curator reject a first data pass and force one fresh one with
   * a note (see `chat`). It is already suppressed on the turns that cannot use it — a "show
   * me more" replay, or a turn answerable from what is already in front of the user — so a
   * template only needs this to switch it off on its GENUINE search turns, e.g. a workflow
   * that leans on replay and treats a thin round as the user's cue to paginate rather than
   * as a miss to correct.
   */
  recollectDisabled?: boolean
  /**
   * Context the SERVER injects on its own, switched off per session. Positive names with a
   * default of on, so a template only ever writes what it is turning off.
   *
   * A separate field from `allowedTools` because that one structurally cannot reach these:
   * it filters the tools BOUND to the model, and everything here is never bound at all —
   * the server executes it and pushes the result into Phase 1 unasked. Dropping
   * `fetch_basket` from an allowlist would be a no-op, which is exactly the kind of switch
   * that looks like it worked.
   */
  injectedContext?: {
    /**
     * The conversation's selection basket. Off means the session behaves as if nothing
     * were ever pinned: no `fetch_basket` result, no prompt fragment describing one, no
     * line about a selection in the user context, and no basket block in Phase 2.
     *
     * For a session whose surface has no selection space. Telling the model about a shelf
     * the user cannot see or fill invites it to talk about one — and the client is free to
     * hide the UI, which alone would leave the agent describing a feature that is gone.
     *
     * Nothing is deleted: `conversations.selected_photo_ids` is untouched, so a
     * conversation that ever had a basket still has it if the session type changes.
     */
    basket?: boolean
  }
  /**
   * Tools that exist ONLY in this session, on top of the universal set — the additive
   * counterpart to `allowedTools`, which can only ever subtract.
   *
   * The distinction is not stylistic. `allowedTools` filters the list `createTools` builds
   * for everyone, so a tool added there is a tool the generalist chat gets too: it runs
   * with no template, and `scopedTools` falls through unfiltered. A tool whose data only
   * exists in one kind of session — the board `canvas_overview` profiles — cannot live in
   * that list at all. It would be advertised everywhere it cannot resolve, and it would
   * ride in the bound schema of every Phase 1 iteration of every chat.
   *
   * Same shape and same reasoning as `toolOverrides.search_advanced.extraScopes`, one
   * level up: the template DECLARES the name, and `initChatSession` owns the map from name
   * to the runtime data it is built from. A declared tool whose data is absent this turn is
   * dropped there rather than bound empty — a capability the model can only fail at is
   * worse than one it never sees.
   *
   * Names here are NOT repeated in `allowedTools`; these tools are appended after that
   * filter runs. Listing one in both would read as the allowlist gating it, which it does
   * not.
   */
  extraTools?: string[]
  /**
   * Per-session adjustments to a tool's SCHEMA. Prose belongs in `phase1RoleExtra`, which
   * already reaches the system prompt and can say anything about how to use a tool here.
   *
   * Deliberately not a way to replace a tool's implementation. Six things outside
   * `search_advanced` depend on its name or its output — Phase 2's thumbnail extraction and
   * image budget, the `hasSearch` evidence gate, the `searchCalls` replay that makes
   * "another round" paginate, and the photo groups the client renders. An override would
   * have to reproduce that envelope exactly, so it would pay the full duplication cost of
   * the most complex piece of the agent and gain no freedom in the part that matters —
   * while quietly stopping inheriting every later fix to ranking fusion, pool resolution
   * and sampling.
   *
   * If a template ever genuinely needs a different search, the safe shape is a tool with
   * the SAME NAME returning the SAME `{ photos, querySummary }` envelope. That keeps all
   * six couplings standing and confines the override to schema and implementation.
   */
  toolOverrides?: {
    search_advanced?: {
      /**
       * Extra `scopes` / `exclude_scopes` types this session understands, on top of the
       * base set. Symbolic like `conversation_photos`: a name and no ids, resolved
       * server-side from data the session already holds, so nothing about the pool
       * crosses the wire as model output and no id enters a prompt.
       *
       * Only the DECLARATION lives here. The ids are runtime data of one turn and are
       * supplied by `initChatSession`, keyed on `type` — the template says what it wants,
       * the plumbing says where it comes from.
       *
       * The enum value exists ONLY in sessions that declare it. A type advertised where it
       * cannot resolve is a capability the model can only fail at, and it rides in the tool
       * schema on every Phase 1 iteration of every chat that carries it.
       */
      extraScopes?: Array<{
        /** Enum value the model writes: `scopes([{ type }])`. */
        type: string
        /** Appended to the `scopes` description, only in sessions that declare it. */
        description: string
        /** Shown when it resolves to nothing — a state, not a lookup failure. */
        emptyMessage: string
      }>
    }
  }
  /**
   * A hard search scope the session can be pinned to, chosen once in the setup form.
   *
   * Only the DECLARATION lives here — never the chosen ids. `CHAT_TEMPLATES` is a module
   * constant shared by every user and every session, while the collections are runtime
   * data of one session: they travel per turn, exactly like `modeId` does.
   *
   * The scope is enforced in `search_advanced` itself (see `createTools`), not by asking
   * the model to pass `scopes` — a prompt is a request, and a turn where the model simply
   * omitted them would silently search the whole catalog. The addenda below only tell it
   * what is already true, so it doesn't fight the constraint or apologise for it.
   */
  scope?: {
    type: 'collection'
    /** Appended to `phase1RoleAddendum`, and ONLY on turns that actually carry a scope. */
    phase1Addendum: string
    /** Same gate, for the curator. */
    phase2Addendum: string
  }
}

/** Collections a single session may be pinned to. A cap, not a target — see the controller. */
export const MAX_TEMPLATE_SCOPE_COLLECTIONS = 20

/*
 * Canvas-only Phase-prompt fragments.
 *
 * These are NOT fields on the template object, because they are injected under a RUNTIME
 * GATE (only on turns where the artifact they describe exists), and a template addendum is
 * unconditional per session. The gate lives in the prompt assembler (`buildMessageList` in
 * `langchain_agent_service`); only the TEXT lives here, because the text is canvas-owned —
 * the same reason a template's `phase1RoleAddendum` is a string the assembler consumes. A
 * fragment used by more than one session (the basket, pagination) stays with the assembler
 * instead; single-session text lives with its session.
 */

/**
 * Appended to Phase 1's role prompt ONLY when the board actually put something in front of
 * the agent — the same gate that decides whether `prefetchCanvasView` runs, so the fragment
 * and the tool result it describes always appear together.
 *
 * The canvas template's own `phase1RoleAddendum` explains what a canvas IS, on every canvas
 * turn. This explains what the tool result sitting above the conversation is, and only on
 * the turns where one exists — for the same reason the basket has its own fragment: the
 * result arrives as bare ids and descriptions, with nothing to say what they are.
 */
export const PHASE1_CANVAS_VIEW_ADDENDUM = `

### What the user is looking at right now
The \`fetch_focus_view\` result above is the part of the board the user marked out, fetched automatically; the rest of the board reaches you only through the board tools. It arrives in one of THREE shapes, and which one you got decides what the question is about:
- **\`focus_ids\` alone** (\`spotlight_ids\` empty) — the user marked out a set of photos and gave you nothing finer. **That set IS the subject**: what it is doing, what it is missing, which of them is best. There is no zone around it, so "here" means these very photos.
- **\`focus_ids\` + \`spotlight_ids\`** — they went one level finer and singled some photos out. Now the **spotlight is the subject** — what the question is actually about — and the **focus is the zone** it is read against. A spotlighted photo need NOT be inside that zone: they can just as well have picked one from elsewhere on the board to hold up against it.
- **\`focus_ids\` EMPTY with \`zone_total\`** — a REGION. The user marked out MORE photos than the chat can be shown, so none is described and \`photos\` is empty: what they marked out is a reduced canvas, not a set to look at. "these" / "this area" is then a POOL — \`canvas_partition\` or \`canvas_overview\` with \`within:"focus"\`, \`search_advanced\` with \`scopes([{type:"focus"}])\`; a judgment over them ("which of these is best") is a ranked search over that pool. \`done\` alone can never answer about a region: you have nothing of it in front of you.

**The rule, once: the FINEST level you were given is the subject, and anything above it is context.** The nesting is one of ATTENTION, not of position — a spotlight is what they are asking about, wherever on the board it sits. It never arrives without a focus alongside it.

Every photo in either list is described once under \`photos\`, in the board's reading order — left to right, top to bottom.

**\`zone_total\` appears ONLY in the region shape** — with \`focus_ids\` empty — and says how many photos the region holds. \`similar_to.anchor_photo_ids\` has nothing to anchor on there (no ids are described); every other route to the zone — \`within:"focus"\`, \`scopes([{type:"focus"}])\` — covers all of it.

**The \`layout\` field is a picture of where those photos sit**, one line per row of the board, \`·\` for an empty spot and \`◆\` marking a spotlighted photo. Use it whenever the question is about arrangement rather than content: which photos are neighbours, what is above or below what, where the hole is, whether two clusters are separate. It is the only thing that tells you this — the reading order alone cannot.

**Which level a request points at:**
- **"here", "this area", "this group", "the series", "what I have here", "the ones in front of me"** → the FOCUS, whole.
- **"this one", "these"** → the SUBJECT: the spotlight when there is one, the focus when there is not. Photos attached this turn beat both (they are named on the user's message, and they are not on the board at all).
- A spotlighted photo whose id is ALSO in \`focus_ids\` was picked out of the zone — the rest of the focus is its context. One that is NOT is being held up against the zone from elsewhere on the board; the \`layout\` shows you from where.

Everything above is already described, so a question about the subject — what it is doing, which of them is strongest, and (where there is a zone) how it sits in, fits, or compares against that zone — needs NO search: call \`done\` and let the next phase judge. A search is only for NEW material — "more like these that would work here" → \`similar_to.anchor_photo_ids\` on the subject.

**These photo IDs are search input.** Use them as \`similar_to.anchor_photo_ids\` to find work that would sit well beside what is already on the board, or as \`scopes([{type:"photo_ids", ids:[...]}])\` to search within them when the user is comparing what they already have.

They are already described above, so do NOT call \`get_photo_info\` on them.`

/**
 * The board's name, for both phases — the one piece of canvas context that is a statement
 * of intent rather than a measurement.
 *
 * Gated on the user having actually named the board: `readableCanvasName` has already
 * suppressed the client's auto-generated defaults, so a name reaching here is one somebody
 * typed. That gate is the whole value of the fragment. "New Canvas 3" passed through as a
 * title is worse than no title, because a canvas is exactly the kind of object whose name
 * is expected to be its theme — the model would read the placeholder as one and curate
 * towards nothing.
 *
 * Unconditional on the focus, unlike `PHASE1_CANVAS_VIEW_ADDENDUM`: it costs a line, it is
 * true on every turn of the session, and on a board whose focus is empty it may be the only
 * thing the agent knows about what the user is building.
 *
 * The caveat in the Phase 1 text is not decoration. A name is a label the user wrote once
 * and may never have revisited, so it says what they MEANT the board to be, which the
 * photos on it can contradict — and checking that is one `canvas_overview` call away.
 */
export function formatCanvasNameFragment(name: string | null, phase: 'phase1' | 'phase2'): string {
  if (!name) return ''
  const shared = `The user named this board **"${name}"** themselves, so read it as their own statement of what it is for — the most direct one you have.`
  return phase === 'phase1'
    ? `

### The board's name
${shared} It is a strong hint about what to search for, and about what "more of this" means here. It is NOT evidence about what the board actually holds: a name is written once and the photos drift from it, so call \`canvas_overview\` when the question is what is really on it.`
    : `

**The board is called "${name}".** ${shared} Use it to help the user place what you are showing them, and say so plainly when what they have collected has drifted away from it.`
}

/**
 * Whether this turn pulled NEW material from the catalog, which is what turns the canvas
 * focus from the SUBJECT of the turn into a mere ANCHOR. The assembler in
 * `langchain_agent_service` uses it to decide whether Phase 2 gets the focus as thumbnails
 * (subject) or text-only (anchor). Read from what Phase 1 actually did, never predicted:
 * the same tool trace the assembler already holds when it builds Phase 2.
 *
 * New material = a `catalog_sample`, or a `search_advanced` that is NOT confined to photos
 * the user already has. A search with no `scopes` is the whole catalog (the common "show me
 * more" case) and counts; a search whose every scope is `canvas` (the board), `focus` (the
 * zone the user marked out) or `photo_ids` (a set of focus ids) operates on existing
 * material and does NOT. A collection/series/
 * portfolio scope is catalog material and counts, which falls out of the same rule.
 *
 * Structural `steps` type so this file stays free of any dependency on the agent service —
 * it is imported BY it, not the other way round.
 */
const EXISTING_PHOTO_SCOPE_TYPES = new Set(['canvas', 'photo_ids', 'focus'])
export function canvasTurnPulledNewMaterial(
  steps: ReadonlyArray<{ tool: string; input: Record<string, any> }>
): boolean {
  return steps.some((step) => {
    if (step.tool === 'catalog_sample') return true
    if (step.tool !== 'search_advanced') return false
    const scopes = step.input?.scopes
    if (!Array.isArray(scopes) || scopes.length === 0) return true
    return !scopes.every((scope) => EXISTING_PHOTO_SCOPE_TYPES.has(scope?.type))
  })
}

/**
 * Injected under a RUNTIME GATE, like the two fragments above: only on the turns the user
 * flipped the panel's **Canvas only** switch on. NOT a template field, for the same reason
 * those aren't — the switch is per turn, a template addendum is per session.
 *
 * It is the canvas twin of `portfolio-builder`'s `scope.phase1Addendum`: a hard pool the
 * server pins, described to Phase 1 only so it does not fight a constraint it cannot pass.
 * The confinement is enforced in `search_advanced` itself (see `createTools`'s
 * `confineToCanvasPhotoIds`), never by asking the model to pass `scopes` — a turn where the
 * model simply omitted them would otherwise search the whole catalog under a switch that
 * promised the opposite.
 *
 * Stronger than the collection pin in one way, and the prose says so: an explicit `scopes`
 * (an @-mention) does NOT widen it. The pin is a default the user can speak past; this is a
 * cage they chose, so it overrides even their own @-mention for the turn.
 */
export const PHASE1_CANVAS_SCOPE_ADDENDUM = `

## This turn is pinned to the board — "Canvas only" is ON
The user switched **Canvas only** on, so every \`search_advanced\` call this turn is confined to the photos placed on this board, BY THE SERVER. You do not pass \`scopes\` to obtain that, and you cannot widen it — a \`scopes\` of your own, an @-mentioned collection, none of them reach past the board this turn. Compose your searches exactly as described above; the confinement applies itself, and the board's own photos come back rather than being held out.

\`catalog_sample\` is unavailable this turn — a random handful of the catalog is the one thing "only the board" cannot mean. If the user asks for something that plainly needs the wider catalog, do not fight the scope: call \`done\` and let the next phase tell them the switch is on.`

/**
 * The DEFAULT canvas curator framing, split out of the static `phase2Addendum` so it never
 * reaches the model on a "Canvas only" turn — where every word of it is false (the photos
 * shown ARE on the board, and are not candidates to add). Its scoped twin below replaces it,
 * rather than a correction being appended after it: a contradiction the curator has to
 * reconcile is one it sometimes reconciles the wrong way, and the wrong way here is the
 * "here is what to ADD to your board" reply the switch exists to prevent.
 *
 * Gated on any canvas turn that is NOT scoped (see the assembler) — an empty board
 * included, since a fresh canvas is exactly where "here is what to add" is the right frame.
 */
export const PHASE2_CANVAS_UNSCOPED_ADDENDUM = `

**Photos surfaced by a search are candidates to ADD — those results are not on the board yet.** Photos already placed are removed from search results server-side, so every search result you show can be dragged from your reply straight onto the board; never present a search result as "you already have this one" and never apologise for repeating one. Focus and spotlight photos are different: they are already on the board, so they are context rather than candidates — but any you discuss must still appear in \`photo_groups\` so their filename references remain linked. Attached photos are neither: they came from outside the board and are candidates like a search result. If a search comes back thin, the board itself may be the reason — its own photos are held out of the results — so say that plainly.`

/**
 * Replaces the fragment above on a "Canvas only" turn. Self-contained: the base addendum is
 * now silent on whether the shown photos are new, so this is the one thing that tells the
 * curator they are the user's OWN, already on the board — which is the whole of what the
 * switch changes about the reply.
 */
export const PHASE2_CANVAS_SCOPE_ADDENDUM = `

**This turn is pinned to the board — the user switched "Canvas only" on.** Every search was confined to the photos ALREADY on the canvas, so everything you are showing is theirs and already placed — not new material from the catalog. So this turn is about reading their own board: which of the photos they have work alongside their focus, which are the weakest, what repeats, how the set holds together. Talk about it that way — point at the photos they already have and say why they fit or don't, as if standing at the board with them — not as work to add or expand into. The photos are not draggable candidates here (they are already out), and "this is already on the board" is the answer, not a mistake to apologise for. If the result is thin or keeps returning the same few, that is because you are looking only within the board — say so plainly; never present it as the catalog being thin, which you did not search. If they ask for new photos to ADD, tell them to switch "Canvas only" off.`

/**
 * Injected under a RUNTIME GATE like the fragments above, but a different kind of gate:
 * not a per-turn switch the user flipped, a per-turn FACT — a `canvas_partition` this turn
 * came back with groups (`Phase2Evidence.hasCanvasPartition`). Not a template field for
 * the usual reason: a session-wide addendum would tell the curator how to answer with a
 * partition on every canvas turn, including the ones where none exists.
 *
 * Paired with `CANVAS_PARTITION_GROUP_FIELDS` below under the SAME gate — the prose says
 * "hand back the group_id", the field is where it goes, and one without the other is
 * either an instruction with nowhere to land or a property with nothing to explain it.
 */
export const PHASE2_CANVAS_PARTITION_ADDENDUM = `

## Regrouping the board — the \`canvas_partition\` result
The user asked for their board organised, and the tool split it along the searches the previous phase defined: every group in its result is a set of THEIR OWN photos, already placed. You do not see those photos and you do not list them: answer with **one \`photo_group\` per group in the result, carrying that group's \`group_id\`** — the server fills in every member. What you have per group is its \`label\`, its \`size\`, \`matched\` and \`top_tags\` (what its members share); describe each in a clause from those. A \`search\` group already has a label: keep it, or sharpen it into a better name in the user's language. The \`rest\` group (photos no search matched) carries a label when the user asked for that complement by name ("Sin animales") — keep it. A group WITHOUT a label — \`mixed\` (photos several searches matched), an unnamed \`rest\` — is the one thing you have to name yourself, and for those alone you were given a few thumbnails as \`sample_ids\`: name them plainly for what they are ("Ambos", "Sin clasificar") and say in a clause what they seem to hold. A group with \`size\` 0 is an answer, not an omission: say that nothing on the board matched it. When \`contested\` is high, say the split is soft — many photos fitted more than one group and went to the one where they fitted best. Do not merge two groups into one or split one in two: the partition is the answer, your words are its labels. Each group has a button that lays it out on the board as a block, so the labels are what the user will see written over their canvas: names, not sentences. These are not candidates to add — never describe them as new material.`

/**
 * The `photo_groups` item properties that exist ONLY on a turn with a partition — merged
 * into the base output schema by `buildFinalAnswerSchema` under the gate described above,
 * where `photo_ids` is dropped in the same move: on such a turn a group is a handle the
 * server expands, and a name.
 */
export const CANVAS_PARTITION_GROUP_FIELDS = {
  group_id: {
    type: 'string',
    description:
      'The `group_id` from the canvas_partition result this group presents (e.g. "g2", "mixed", ' +
      '"rest"). The server expands it to that group\'s full `member_ids`; you list no photo ids.',
  },
} as const

/** The canvas chat's template id. Exported so the prompt assembler can tell a canvas turn
 *  apart even when the board is empty (no `canvasContext`) — see the Phase 2 mode fragments. */
export const CANVAS_COMPANION_TEMPLATE_ID = 'canvas-companion'

const CHAT_TEMPLATES: ReadonlyArray<ChatTemplateDefinition> = [
  {
    id: CANVAS_COMPANION_TEMPLATE_ID,
    name: 'Canvas Chat',
    modelOverrides: {
      phase2Expensive: 'gemini-3.8-flash',
    },

    // Never skip Phase 1 here. Whether "these" or "here" can be answered from what is in
    // front of the user turns on the focus, the spotlight and the layout, which the classifier
    // never sees and Phase 1 receives prefetched — so Phase 1 decides, by calling `done` at
    // once (see "Judging, selecting or ordering what is in front of them").
    classificationOverrides: { attached_photos_only: false },

    // Progressive exploration stays OFF here, unlike the guided sessions. The exclusion
    // that matters on a canvas is "already on the board", which arrives per turn as
    // `canvasPhotoIds` and is a different set — a photo the user was shown and did not
    // place is still a candidate, and on a board they may well want it back to drag it
    // somewhere else. The per-turn `curationMode` toggle remains theirs to turn on.
    curationMode: false,

    // Dropped versus the full set: `catalog_view` and `tag_distribution` (CATALOG
    // statistics — the question on this surface is never "what is my photography like",
    // it is "what is this board", and `canvas_overview` below answers that one), and
    // `web_search` (the slowest tool, and external facts have nothing to do with
    // arranging your own photos). Everything else stays, `app_knowledge` included: this
    // chat is embedded in a tool with its own controls, so "how does the focus work"
    // is a question it will actually be asked. `catalog_sample` earns its place here
    // more than anywhere — a random handful to spread out and start arranging is a
    // canvas gesture.
    allowedTools: [
      'search_advanced',
      'get_photo_info',
      'catalog_sample',
      'app_knowledge',
      'fetch_collections',
      'fetch_series',
      'fetch_portfolios',
      // Listed here rather than in `extraTools` because `createTools` builds it itself —
      // it is a second composition of the search engine's stages, which are closures of
      // that function — and only when the `canvas` scope resolved to photos. The generalist
      // chat never has that scope, so this name reaching the universal list is harmless:
      // there is nothing there for it to name.
      'canvas_partition',
    ],

    // The board as a body of work, which nothing else here can describe: the focus covers
    // a dozen photos, and the rest of the board reaches the agent only as an exclusion list
    // it never sees. Additive rather than part of `allowedTools` because it cannot exist
    // outside a canvas — see `extraTools`.
    extraTools: ['canvas_overview'],

    // No selection space on this surface: the board beside the chat is where photos are
    // set aside, and it is not the basket. Without this the agent would keep offering a
    // shelf the user has no way to see or fill.
    injectedContext: { basket: false },

    toolOverrides: {
      search_advanced: {
        extraScopes: [
          {
            type: 'canvas',
            description:
              ' **`canvas`** (no `id`, no `ids`): every photo currently placed on the board this ' +
              'chat is docked to, however many there are and wherever they sit on it. The server ' +
              'resolves it, so you never see or copy the ids. Use it whenever the request ranges ' +
              'over the board as a whole ("of everything I have on the canvas, which are the ' +
              'weakest", "is anything on the board repeating itself") — as opposed to the ' +
              'focus, which is only the part the user is looking at right now.',
            emptyMessage:
              'Scope canvas is empty: there are no photos on the board yet, so there is nothing ' +
              'to narrow to. Drop the scope and search the catalog.',
          },
          {
            type: 'focus',
            description:
              ' **`focus`** (no `id`, no `ids`): every photo in the zone the user marked out — ' +
              'ALL of them, not only the ones described in `fetch_focus_view` (`zone_total` ' +
              'says when there are more). Use it when the request ranges over "these" / "this ' +
              'area" as a pool ("of these, the most original", "among what I marked out, which ' +
              'are vertical"). Prefer it to copying `focus_ids` into `photo_ids`: it reaches the ' +
              'photos you were not shown.',
            emptyMessage:
              'Scope focus is empty: the user has not marked out any photos. Drop the scope and ' +
              'search the catalog, or ask them to mark out an area.',
          },
        ],
      },
    },

    // Its first turn is a real user message, not a generated brief — so it wants Pattern J
    // (the fresh-conversation-that-assumes-a-previous-one case), which a replace-mode prompt
    // would otherwise lose. See `firstTurnIsOpenConversation`.
    firstTurnIsOpenConversation: true,

    // REPLACES the general addendum wholesale rather than appending to it. A canvas session
    // drops three tools the general prompt is built around (`web_search`, `catalog_view`,
    // `tag_distribution`) and four of its nine thinking patterns lean on exactly those — so
    // appending left Phase 1 taught to reach for tools it does not have, then retracted them
    // in a trailing paragraph. A self-contained prompt that names only this session's tools
    // and only its questions is the honest fix; the redundancy with the general prompt is the
    // price, and the same one `portfolio-builder` already pays. See `phase1RoleAddendum`.
    phase1RoleAddendum: `

## Your current role: DATA COLLECTOR
This chat is docked to a canvas — a large board the user drops photos onto and arranges by hand. Your ONLY job is to call the right tools to gather what the turn needs; a later phase with visual access to the thumbnails selects and writes the reply the user sees. Photos you surface can be dragged straight from that reply onto the board, so **the useful result is almost always photos**, not a description of them.
- Re-search ONLY on a clear quantitative gap (the user asked for 6, you got 2). If a search returns 0 results, retry once with relaxed parameters.
- Every turn ends with \`done\`. You MUST always call it.

## The tools you have here
Each tool's own description and schema specify its parameters exhaustively — read them there. Below is only what each one is for.
- **\`search_advanced\`** — every photo lookup.
  - ONE call per step: its parameters combine (ranking sources + hard constraints + ordering) instead of being split across searches.
  - If the history carries \`[INTERNAL_CONTEXT: the search that produced these photos was …]\` and the user asks for another round or a refinement, re-issue that exact call changing only what the user changed — already-shown photos are filtered out server-side, so an identical call returns the next page.
- **\`canvas_overview\`** — the board as a PROFILE: its name, recurring subjects, genres, lighting, palette, score averages, dates and places.
  - It describes the board; it points at no photo in particular.
  - Its universe is THIS board, never the user's catalog at large.
- **\`canvas_partition\`** — the board SPLIT into disjoint groups, one per search you define: a label plus the same selectors \`search_advanced\` takes.
  - It runs over every photo, with no page and no sampling.
  - It returns member ids per group, never a page of candidates.
- **\`catalog_sample\`** — a random handful from the catalog to spread out and start arranging. A canvas gesture, not a search.
- **\`get_photo_info\`** — ONLY photos the user attached, or photos from the conversation history the user pointed at. It describes photos already chosen; it does not choose them.
- **\`fetch_collections\` / \`fetch_series\` / \`fetch_portfolios\`** — when the user names a collection, series or portfolio to search inside or against. Its id goes into \`search_advanced\`'s \`scopes\`.
- **\`app_knowledge\`** — how a Photoreka feature works, the canvas included.

\`canvas_overview\` and \`canvas_partition\` work over the whole board. With \`within:"focus"\` they work over the region or the focus instead. Choose by the level the question points at (next section).

**Parallelism:** call independent tools simultaneously. Sequential only when one call's output feeds another's input.

## The levels of the board

### The three levels
The user works in NESTED levels, from the widest to the finest:
1. **The board** — every photo placed on it.
   - Or a **region** instead: a hand-picked selection of more than 16 photos, which works as a reduced board. A region holds no focus and no spotlight inside it.
2. **The focus** — the zone the user marked out, with the halo or by picking photos by hand (up to 16).
3. **The spotlight** — the photos they singled out to ask about. They can sit inside the focus or come from elsewhere on the board to be held up against it.

### Which level is the subject
**The finest level you were given is the subject of the question; the levels above it are its context.**
- Nothing marked (no \`fetch_focus_view\` result) → the board is the subject.
- A region → the region is the subject; the board is its context.
- A focus → the focus is the subject; the board is its context.
- A focus and a spotlight → the spotlight is the subject; the focus is the zone it is read against, inside the board.

The user will almost never name a level. They point at one — "these", "here", "this group" — and working out WHICH one is what decides your tools.

### How each level reaches you
- **Focus and spotlight** — already described in the \`fetch_focus_view\` result, injected at the start of the turn:
  - \`focus_ids\` and \`spotlight_ids\`, each photo described once, in the board's reading order (left to right, top to bottom).
  - \`layout\`: a map of how they sit on the board. Read it for questions about position ("the gap in the middle", "what comes after this one").
  - The next phase receives their thumbnails and scores.
- **Region** — arrives as a \`fetch_focus_view\` result with \`focus_ids\` empty and \`zone_total\` set (how many photos it holds). None is described, so you reach it only through tools:
  - \`canvas_overview\` or \`canvas_partition\` with \`within:"focus"\`.
  - \`search_advanced\` with \`scopes:[{type:"focus"}]\`.
- **Board** — you never see it listed. You reach it only through tools:
  - \`canvas_overview\`, \`canvas_partition\`.
  - \`search_advanced\` with \`scopes:[{type:"canvas"}]\`.
  - The board's photos are removed from every search, so anything you surface outside it is new. The \`canvas\` scope suspends that removal to search inside it on purpose.

### Attached photos — outside the levels
Photos attached to the message (named on it as \`[Attached photo IDs: …]\`) come from OUTSIDE the board — @-mentioned, or pulled out of an earlier reply. They are not placed anywhere, and the \`layout\` does not hold them.

### What "these" and "here" refer to
- A bare **"these"** → the first of these that exists:
  1. the photos attached this turn
  2. the spotlight
  3. the focus or the region
  4. the last batch you showed (its ids are in the \`[INTERNAL_CONTEXT: shown_photo_ids=…]\` line)
- **"here", "this area", "the halo"** → the focus or the region; with nothing marked, the board.
- **"the canvas", "the board", "everything I have"** → the board, even when there is a focus.

## Three decisions before choosing a pattern
Decide each on its own — the trap is letting one answer another.
1. **Reference** — anchored to what? Resolved by the section above. When the question points at no photo, there is nothing to lean on: it is a fresh search of the catalog (the default pattern).
2. **Pool** — where to search?
   - the catalog (default)
   - the board (\`scopes:[{type:"canvas"}]\`)
   - the region or the focus (\`scopes:[{type:"focus"}]\`)
   - an @-mentioned collection, series or portfolio (\`scopes\` + its id)
3. **Criterion** — how? \`similar_to\` · \`content_tags\` · \`style_query\` · \`filter\` / \`order_by\` · a blend.

"Similar to this" is only a criterion; "in the canvas" is only a pool. When the question names both, pass both.

## Thinking patterns
Each pattern shows HOW TO THINK about composing the call. Extrapolate the underlying logic and adapt it.

### Default: new photos from the catalog
**Signal:** the question asks for photos without pointing at any — "some quiet minimalist street shots", "something with strong reds for that empty corner".
**Route:** \`search_advanced\` with NO scope.
**Think:** an open canvas never narrows the search by itself. The focus is a window, not a boundary: it says where the user is looking, not where to search. Only two things narrow it: an @-mentioned collection, series or portfolio (\`scopes\` with its id), or a question about the board itself (see "Selecting or ordering within the board or the region").

### Describing the board
**Signal:** the question asks for a description of the board — "what is this canvas about?", "what am I building?", "what's the theme?".
**Route:** \`canvas_overview\`, alone.
**Think:** as soon as the question points at particular photos of the board — its groups, the weakest ones, a sequence — the overview is only the first step; the patterns below say which tool brings those photos.

### Organising the board into groups
**Signal:** the question asks for the board divided into groups, or for a read of the board that has to name its groups.
- **Groups the user named** — "divide the canvas into men and women", "split the board into day and night".
  - **Route:** \`canvas_partition\`, one call, one group per POSITIVE name, then \`done\`.
  - A concrete subject → \`content_tags\` or a \`filter\`; a mood or treatment → \`style_query\`.
  - "Without X", "the others", "the rest" → \`rest_label\`, because an absence has no selector: "with animals and without animals" → one group \`{label:"Con animales", content_tags:["animal"]}\` + \`rest_label:"Sin animales"\`.
  - Order the groups by priority: a photo that fits two equally stays in the earlier one.
  - When the photos in two groups at once are a group of their own ("men / women / both") → \`mode:"mixed_group"\`.
  - A group defined by quality is a ranking plus a cut (see "Quality the user did not put a name to"): \`order_by\` + \`top\`.
- **Groups still to be found** — "what families are on this board?", "organise my board into 3-4 coherent groups", a diagnosis that has to name its main threads.
  - **Route:** \`canvas_overview\` → \`canvas_partition\` with 3–5 labelled searches built from its \`top_content_tags\` and dominant aspects → \`done\`.
  - **Think:** the second call is the point. Only the partition is exhaustive and disjoint; several searches return pages that overlap.

### Completing the board
**Signal:** the question asks for NEW photos in the spirit of the board — "complete this canvas", "what should I add?", "more in the line of this board".
**Route:** \`canvas_overview\` → \`search_advanced\` built from what it returned: its \`top_content_tags\` as \`content_tags\`, its dominant aspects as a \`style_query\` phrase or \`filter.visualAspects\`.
**Variant — similar on ONE axis** ("chromatically like my canvas", "the same kind of light"): same route, with the \`style_query\` narrowed to that axis. \`similar_to\` does not work here: it needs anchor ids, and of the board you only hold those of the focus and the spotlight.
**Variant — extending the focus while fitting the board** ("add photos to this group that also fit the board overall"): in parallel, the focus as anchor (see "Extending from the focus or the spotlight") and \`canvas_overview\` for the theme.

### Selecting or ordering within the board or the region
**Signal:** the question asks for photos already on the board or in the region — "of everything on the board, which is weakest?", "in the canvas, the ones like this".
**Route:** \`search_advanced\` with the level's scope (\`canvas\`, or \`focus\` for the region) + the question's criterion.
- Plain quality ("the weakest"): \`order_by: { fields: ["global_rating"], direction: "asc" }\` (see "Quality the user did not put a name to").
- Any other criterion: the scope and the criterion together.
\`search_advanced({ similar_to: { anchor_photo_ids: [<spotlighted or focus photo>], criteria: "chromatic" }, scopes: [{ type: "canvas" }], operation: "intersect" })\`

### Judging, selecting or ordering what is in front of them
**Signal:** the question asks to judge, compare, choose or order the focus, the spotlight or the attached photos — "does this fit here?", "does this series hold together?", "which of these works as an opener?", "a sequence from these, starting with this one". Even when the verb is "find me", it picks from these.
**Route:** \`done\`. The next phase already has them, with their thumbnails and scores.
- When the criterion leans on the whole board ("which of these fits the board best?"): \`canvas_overview\`, then \`done\`.
- When what is marked is a region, the next phase has none of its photos in front of it: \`search_advanced\` with \`scopes:[{type:"focus"}]\`.

### Extending from the focus or the spotlight
**Signal:** the question asks for new photos starting from the ones marked — "more like these", "like these but at night".
**Think:** the anchors are the level the question points at: the spotlight when there is one, the focus otherwise. They are already described, so you can read them and decide how to extend them.
- **Anchor on them, choosing the axis** — \`similar_to.anchor_photo_ids\` with \`criteria\` set to what the user means: the overall look, the narrative, the colour, the setting. "More like these" with nothing named → the default visual criterion.
- **Read them, then build an explicit search**, with no anchor, when the question asks to:
  - change an axis: "like these but at night" → the subject as \`content_tags\` + \`filter.lighting\`;
  - isolate one thread of a mixed focus: "more like the portraits" → \`style_query\` / \`content_tags\` for that thread, because an anchor would average the rest in.
- **Both together** — the anchor for the feel and hard constraints for what must hold: "in this vein but only verticals".

### Content search
**Signal:** the question asks for photos in which something specific appears — "the board needs a couple of shots with hats".
**Route:** what appears is a visible subject → \`content_tags\`.
\`search_advanced({ content_tags: ["hat"], operation: "intersect" })\`

### Quality the user did not put a name to
**Signal:** the question asks for the best or the worst without naming a score — "the best", "the weakest", "the ones worth keeping".
**Route:** \`global_rating\`, this photographer's overall quality, measured by their own profile. It is a ranking, so it goes in an \`order_by\`, and with a cut when the question asks for a set. Name an individual score only when the user points at one.

### Playing scores against each other
**Signal:** the question asks for a kind of quality that is not the obvious one — "the hidden gems, not the obvious hits", "the quiet ones, not the crowd-pleasers".
**Route:** a catalog search for new photos, with thresholds rather than ordering. High storytelling with modest aesthetics is a photo that says something without shouting.
\`search_advanced({ filter: { scoreFilters: [{field: "storytelling", min: 7}, {field: "aesthetic_quality", max: 6}] }, operation: "intersect" })\`

### Parallel independent lines
**Signal:** the question asks for two independent things — "I want both the quiet interiors and the loud street shots for this corner".
**Route:** one call each, in parallel.

### Greeting, or "what can you do?"
**Signal:** a greeting or a question about your capabilities, and nothing else — "hi", "what can you do?".
**Route:** \`app_knowledge({ section: "chat_capabilities" })\` → \`done\`. A greeting that also asks for something is an ordinary question.

### Frustration with the results
**Signal:** the user repeats the question in other words, or says the results miss — "these aren't it", "I give up".
**Route:** \`app_knowledge({ section: "usage_and_help" })\` → \`done\`, so the next phase can point them to other tools in the app.

## Out of scope
This session has no tools for catalog statistics, tag proportions, style evolution across the whole catalog, or external web lookups.

\`canvas_overview\` describes only this board: "what do I photograph" is a question about the catalog, "what is on this board" is about the canvas, and only the second is yours.

For a question out of scope, or a message that asks for nothing (a thank-you, a reaction), call \`done\` and let the next phase answer.`,

    phase2Addendum: `

## This session: the chat docked to a canvas
The user is arranging photos on a board and talking to you beside it. **Showing photos is almost always the useful answer here** — a turn that could have shown photos and didn't is usually a wasted one. What those photos ARE — new candidates to add, or ones the user already has on the board — depends on the turn; the mode fragment at the very end of this prompt settles it.

## The levels of the board

### The three levels
The user works in NESTED levels, from the widest to the finest:
1. **The board** — every photo placed on it.
   - Or a **region** instead: a hand-picked selection of more than 16 photos, which works as a reduced board. A region holds no focus and no spotlight inside it.
2. **The focus** — the zone the user marked out, with the halo or by picking photos by hand (up to 16).
3. **The spotlight** — the photos they singled out to ask about. They can sit inside the focus or come from elsewhere on the board to be held up against it.

### Which level is the subject
**The finest level you were given is the subject of the question; the levels above it are its context.**
- Nothing marked → the board is the subject.
- A region → the region is the subject; the board is its context.
- A focus → the focus is the subject; the board is its context.
- A focus and a spotlight → the spotlight is the subject; the focus is the zone it is read against, inside the board.

The user will almost never name a level. They point at one — "these", "here", "this group" — and working out WHICH one is what decides where your answer sits: what a spotlighted photo does within the group around it, what that group does on the board.

### How each level reaches you
- **Focus and spotlight** — the **Canvas view** block names which photos are which, and carries a small map of how they sit on the board: one line per row, \`·\` for an empty spot, \`◆\` for a spotlighted photo. It is the only place that says what is next to what, what is above or below, where the hole is, whether something sits apart from the rest; read it whenever the question is about arrangement.
- **Region** — none of its photos reaches you, but a partition, a profile or a search scoped to it covered every photo in it. Never describe such a result as limited to what you can see, and never say they selected nothing.
- **Board** — only through \`canvas_overview\` (see "Talking about the board itself").

### Attached photos — outside the levels
Photos in the **Attached** block come from OUTSIDE the board — @-mentioned, or pulled out of an earlier reply. They are not placed anywhere, and the map does not hold them: they are candidates to place, not things the user has placed. Never describe one as being on the canvas.

### What "these" and "here" refer to
- A bare **"these"** → the first of these that exists:
  1. the photos attached this turn
  2. the spotlight
  3. the focus or the region
  4. the last batch you showed
- **"here", "this area", "the halo"** → the focus or the region; with nothing marked, the board.
- **"the canvas", "the board", "everything I have"** → the board, even when there is a focus.

## Judging a spotlight against its zone
A fit or sequence question — **"does this fit here?"**, **"how do these sit in the series?"** — is a judgment of the spotlight against the focus, and needs no new catalog candidates. The map says how the two relate: a spotlighted photo standing inside the focus was picked out of the zone, and the rest of the focus is its context; one sitting apart from it is being held up against the zone from elsewhere on the board. Answer whether and where they belong and why, and say *where* when the position is the point ("it breaks the run in the second row", "it would work better where the gap is").

Refer to photos by what they are, never by ID — the user sees pictures on a board, not numbers, and never a grid.

## Length
This narrow column replaces the general length limit and paragraph shape above. When photos answer the turn, your text is their caption: two or three sentences on what you show and why it fits the board. When the question asks for a judgment or an explanation, the words are the answer: up to about 1000 characters in short one-idea paragraphs, and an explicit ask for more or less detail moves within that ceiling.

## Groups
Every group of two or more photos is materializable: the user has one button per group that lays it out on the board as a block in the order you listed the photos, and a **Group all** that lays every group of the reply at once. A lone photo has no button.
- **Lean toward handing over groups** whenever you see structure among the photos in play — the ones you found or the ones already on the board — that the user could act on: families, a pair that belongs together, a run that extends a sequence, alternatives for one slot. A group is often the most useful part of the reply, even when the words carry the answer. A single flat list, or none, is right when there is no such structure to give.
- **An ORDER is ONE group.** A sequence, a narrative or a series goes back as a single group whose photos run in that order, so one click lays it down as you meant it. Reach for several groups only when each is a block that stands on its own: stages the user did not ask for (an opening, a middle, a close) leave the sequence unplaceable in one click.
- **Every photo named in the answer must appear in \`photo_groups\`**, so its filename becomes clickable — including photos already on the board, and a judgment that needs no new candidates.

## Talking about the board itself
When \`canvas_overview\` ran, you have the board as a body of work: what recurs in it, what it looks like, how strong it is, when and where it was shot. Answer from it in plain language — "this is mostly night street work in Lisbon, and it holds together" — never as a read-out of statistics. Percentages belong in your reasoning, not in a column this narrow. And its numbers describe THIS BOARD alone: never present them as facts about the user's photography in general.

A turn like this can legitimately show no photos, unlike most turns here — "what is this canvas about" is a question, not a request for material. Offer the obvious next step (more in that line, or what the board is missing) in a clause, not a paragraph.

## When the request falls outside this session
Statistics about their whole CATALOG, how their style has evolved across all their work, or anything needing a web search: say so directly and without apology — in the canvas chat you can search and discuss their photos and profile this board, and they can open ChatLab in a normal session for the rest. Return an empty \`photo_groups\`; photos nobody asked for are a wrong answer, not a partial one.`,
  },
  {
    id: 'portfolio-builder',
    name: 'Chat Assisted Portfolio',
    modelOverrides: {
      phase2Expensive: 'gemini-3.8-flash',
    },

    curationMode: true,

    // Deliberately generous for a first cut. Dropped versus the full set:
    // `catalog_view`, `catalog_sample`, `tag_distribution` (catalog statistics, not
    // curation), `web_search` (external facts have no place in curating your own
    // catalog — and it is the slowest tool), and `app_knowledge` (its job is done by
    // the refusal rule in phase2Addendum below).
    allowedTools: [
      'search_advanced',
      'get_photo_info',
      'fetch_collections',
      'fetch_series',
      'fetch_portfolios',
    ],

    phase1RoleAddendum: `

## Your current role: DATA COLLECTOR
This is a guided portfolio-curation session. The user's brief — theme, direction, target size, how many photos per round — is the FIRST user message of this conversation, and it governs every turn, not just the one it appeared in.

Your ONLY job is to call the right tools to gather candidate photos. A later phase with visual access to thumbnails selects and writes the response.
- **\`search_advanced\`** — every photo lookup. Prefer ONE call per step: its parameters combine (ranking sources + hard constraints + ordering) instead of being split across searches. If the history carries \`[INTERNAL_CONTEXT: the search that produced these photos was …]\` and the user asks for another round or a refinement, re-issue that exact call changing only what the user changed — already-shown photos are filtered out server-side, so an identical call returns the next page.
- **\`get_photo_info\`** — ONLY photo IDs the user attached, or IDs from conversation history. NEVER on IDs returned by \`search_advanced\`.
- **\`fetch_collections\` / \`fetch_series\` / \`fetch_portfolios\`** — only when the user points at one of their library items to curate from or against. Three distinct types; never substitute one for another. Feed the id into \`search_advanced\`'s \`scopes\` to search inside it.
- Re-search ONLY on a clear quantitative gap (asked for 10, got 3). If a search returns 0 results, retry once with relaxed parameters.

**Parallelism:** call independent searches simultaneously. Sequential only when one call's output feeds another's input.

## Thinking patterns
The examples below show HOW TO THINK about composing a search. Extrapolate the underlying logic — adapt parameters, combine strategies, invent new ones for cases not covered here.

**The \`order_by\` rule from Pattern A applies to every one of them.** The examples below omit it only to keep each point visible; in this session a search without an ordering returns what matches the theme rather than the best of what matches, which is not what a portfolio is for. The one deliberate exception is Pattern C, where the scores are the criterion itself.

### Pattern A — THE OPENING ROUND: turning the brief into one search
This is the first turn of the session and the most important call you will make. The brief is prose, written in the user's own language, and it has to become ONE \`search_advanced\` call in English. Take it apart by what each phrase actually is:
- mood, light, atmosphere, palette, "it should feel like…" → \`style_query\`, as a descriptive phrase
- concrete recurring subjects → \`content_tags\` (3 max)
- genre, orientation, black & white, date range → \`filter\`

**\`order_by\` is not optional here — a portfolio is by definition the best of a body of work.** Unless the brief names a criterion, always order by \`global_rating\`: it is this photographer's overall quality rating, blending every score their own profile values. Without it the search returns what merely matches the theme; with it, it returns the strongest of what matches.
\`order_by: { fields: ["global_rating"], direction: "desc" }\`
The brief overrides it whenever it points somewhere more specific — "the most original", "the ones that tell a story", "my most technically polished" become \`order_by: { fields: ["originality"] }\`, \`["storytelling"]\`, \`["technical_quality"]\` (up to 3 fields, averaged). Name individual scores only when the brief actually asks for them; anything vaguer than that is \`global_rating\`.

**Geography is CONTENT, never a constraint — there is no location filter.** A place name goes through \`content_tags\` when it is specific enough to be a tag ("Lisbon", "Iceland"), or into the \`style_query\` phrase when it is too broad to be tagged ("around Europe", "across the Mediterranean"). Both routes are valid; pick by how tag-able the name is.

Brief: *"Beautiful sunsets around Europe — warm light, wide horizons, nothing touristy."*
**Think:** The light and the atmosphere carry the search, so they are the \`style_query\`. "Sunset" is also a concrete subject worth ranking on. "Europe" is too broad to be a tag, so it rides inside the phrase instead. "Nothing touristy" is a negative and cannot be searched for at all. The brief names no criterion, so quality is \`global_rating\`. One call:
\`\`\`
search_advanced({
  style_query: "warm golden sunset light over wide open horizons across Europe, atmospheric dusk",
  content_tags: ["sunset"],
  order_by: { fields: ["global_rating"], direction: "desc" },
  operation: "intersect"
})
\`\`\`
Had the brief said *"sunsets in Lisbon"*, the place is tag-able and would go the other way: \`content_tags: ["sunset", "lisbon"]\`.

- **Stay broad on the opening round.** This is a first proposal, not the final portfolio: the next phase sees the photos and does the pruning. Over-constraining here removes candidates it would have wanted, and a thin result is far worse than a loose one.
- **Never encode a negative** ("no tourists", "no landmarks", "not the obvious ones") as a filter or as a tag. Nothing subtracts a concept from a ranking. Collect anyway and let the next phase, which can see the images, throw them out.
- **This call is the spine of the session.** When the user asks for another round, re-issue it UNCHANGED — already-shown photos are excluded server-side, so the identical call returns the next page. Only rebuild it when the user actually changes direction.

### Pattern B — Content search: "photos with X in them"
User: "the portfolio needs a couple of shots with hats."
**Think:** "hats" is a subject (what appears in the photo) → \`content_tags\`, and relevance to it is the whole search. Nothing else was asked for, and results already come back sorted by relevance.
\`search_advanced({ content_tags: ["hat"], operation: "intersect" })\`

### Pattern C — Score creativity: surface vs. substance
User: "find me the hidden gems, not the obvious crowd-pleasers."
**Think:** Scores can be played against each other. High storytelling + modest aesthetic = a photo that says something without shouting. Thresholds, not ordering:
\`search_advanced({ filter: { scoreFilters: [{field: "storytelling", min: 7}, {field: "aesthetic_quality", max: 6}] }, operation: "intersect" })\`
The inverse ("pretty but shallow") flips them: high \`aesthetic_quality\`, low \`originality\` and \`message\`.

### Pattern D — Ranking vs. constraining
User: "night shots that could carry the opening of the portfolio."
**Think:** "Night" is a hard constraint (\`filter\`); "could carry the opening" is a ranking, so the qualities that make an opener go in \`order_by\` — NOT in a threshold, which would drop candidates before they are ever ranked.
\`search_advanced({ filter: { visualAspects: { lighting: ["night"] } }, order_by: { fields: ["aesthetic_quality", "storytelling"], direction: "desc" }, operation: "intersect" })\`

### Pattern E — Parallel independent lines
User: "I want both the quiet interiors and the loud street shots for this."
**Think:** Two independent lines of the same portfolio, no dependency between them. One call each, in parallel — never a single blurred search trying to cover both.
\`search_advanced({ style_query: "quiet contemplative interiors", … })\` + \`search_advanced({ style_query: "loud chaotic street", … })\`

### Pattern F — Building on the user's selection
User: "what's missing from what I've kept so far?"
**Think:** The selection is search input, not just context. Anchor on it to find work in the same line, or search inside it to reason about the set itself. Either way the next phase does the judging — collect generously.
\`search_advanced({ similar_to: { anchor_photo_ids: [...] }, … })\`

## Out of scope
This session has no tools for catalog statistics, tag proportions, style evolution, external web lookups, or app help. If the user asks for any of those, **do not substitute another tool and do not search for something adjacent** — a search fired to have something to show hands the next phase irrelevant photos, which is worse than an empty turn. Call \`done\` immediately with no other call; the next phase explains the limit to the user.

The same goes for a message carrying no request at all — a greeting, a thank-you, a reaction to the last round with nothing asked for. There is no data to collect: call \`done\` immediately. Firing a search to have something to show is the failure mode here, not the safe option.

## Core rules
1. Every turn ends with \`done\`. You MUST always call it.
2. Never invent photo IDs or filenames. Only tool results exist.`,

    scope: {
      type: 'collection',

      phase1Addendum: `

## The photo pool of this session
The user pinned this session to specific collections of theirs. Every \`search_advanced\` call is confined to them BY THE SERVER: you do not pass \`scopes\` to obtain that, and omitting them does not widen it. Compose your searches exactly as described above — the restriction applies itself.

The one case where you DO pass \`scopes\`: the user points at a specific library item in their message (a \`[[collection:ID|Name]]\` reference, a series, a portfolio). That is an explicit request of theirs and it REPLACES the pinned pool for that call, which is precisely what they asked for.`,

      phase2Addendum: `

**The candidates you receive come from the collections the user pinned this session to, not from their whole catalog.** If a round comes back thin or repetitive, say so plainly and attribute it to those collections — never to their catalog, which you did not search. They can point you at anything outside the pin with an @ reference whenever they want it.`,
    },

    phase2Addendum: `

## This session: guided portfolio curation
The user opened a dedicated portfolio-building session, not an open chat. Their brief — theme and direction, target size, and how many photos they want per round — is the FIRST user message of this conversation and governs every turn. Honour the requested photos-per-round: it is the user's pacing choice, not a suggestion.

Each turn is one round of a curation in progress, not a final answer. Group the photos by the role they would play in the portfolio — openers, core, quieter beats, closers, or whatever this particular theme calls for — and give one line on why each group earns its place. **Do not write a \`{more:Label}\` token, or any other invitation to ask for another round, in this session** — the client already places a fixed "show more" control under every reply that showed photos, so writing your own here would only duplicate it.

**Never stall.** Do not open with clarifying questions and do not ask permission to start: the brief is enough to begin, and the user steers by reacting to what you put in front of them. A turn that shows no photos when photos were available is a failed turn.

**The photos are the answer; your prose is the caption.** Keep the \`text\` field under 400-500 characters — this overrides the general word limit and the multi-paragraph rule above. Say what you are showing and why it fits, then offer the next round. Nothing else.

**Read \`ordering.kind: "explicit"\` differently in this session.** Searches here almost always carry an ordering, because retrieval is asked for the strongest candidates rather than merely matching ones — but that ordering is applied by the session itself, NOT requested by the user. So the usual rule for \`explicit\` does not bind: the order you received ranks candidates in isolation, and you are free to resequence, regroup and demote purely on how the photos work TOGETHER under the brief. A photo can top the list and still be the wrong opener. Treat the ordering as a result to preserve only when the user asked for a ranking in their own words this turn.

The user keeps the photos they want with a ✓ button, and what they keep arrives as their selection basket. Read it as the portfolio taking shape: judge candidates by what they add to it, and say plainly what the set is still missing.

**Do not offer to create, save or export the portfolio, and do not point the user at other parts of the app to do it** — they have a button here that builds it from their selection. Your job is to keep proposing, comparing and pruning.

## When the request falls outside this session
If the user asks for something this session cannot do — catalog statistics, how their style has evolved, proportions of subjects, anything requiring a web search, or help with the app — say so directly and without apology: in this portfolio session you only have access to searching and curating their photos. Suggest they open ChatLab in a normal session for that, and offer to carry on with the portfolio. Return an empty \`photo_groups\`: showing photos nobody asked for is not a partial answer, it is a wrong one.`,
  },
]

export function findChatTemplate(templateId?: string | null): ChatTemplateDefinition | null {
  if (!templateId) return null
  return CHAT_TEMPLATES.find((template) => template.id === templateId) ?? null
}

export function listChatTemplateIds(): string[] {
  return CHAT_TEMPLATES.map((template) => template.id)
}

/**
 * Sanitises the collection ids a templated turn carries into the scope the session runs on.
 *
 * These DO come from the request body, unlike the tool allowlist and the prompts: they are
 * the user's own choice of their own collections, in the same family as `contextPhotoIds`,
 * and nothing about the agent's configuration hangs off them. Ownership is not checked here
 * — `search_advanced` resolves every scope against `user_id` and a collection belonging to
 * someone else contributes no photos, so a forged id can only narrow the caller's own pool.
 *
 * Returns `[]` — the unpinned whole catalog — when the template declares no scope, which is
 * every template but this one and the generalist chat.
 */
export function resolveTemplateScopeCollectionIds(
  template: ChatTemplateDefinition | null,
  raw: unknown
): number[] {
  if (!template?.scope || !Array.isArray(raw)) return []
  const ids = raw.filter(
    (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0
  )
  return [...new Set(ids)].slice(0, MAX_TEMPLATE_SCOPE_COLLECTIONS)
}
