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

export type ChatTemplateDefinition = {
  id: string
  name: string
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
   * Activates curation mode for this template: excludes every already-shown photo from
   * `search_advanced` on EVERY turn, not just the ones the classifier reads as "another round".
   * A guided curation session is progressive exploration by definition — re-showing a candidate
   * the user already saw and passed on wastes the round — so the exclusion the generalist chat
   * gates on intent is unconditional here. What the user keeps lives in the basket, which is
   * untouched by this.
   */
  curationMode?: boolean
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
 * Appended to Phase 1's role prompt ONLY when the focus actually covers photos — the same
 * gate that decides whether `prefetchCanvasView` runs, so the fragment and the tool result
 * it describes always appear together.
 *
 * The canvas template's own `phase1RoleAddendum` explains what a canvas IS, on every canvas
 * turn. This explains what the tool result sitting above the conversation is, and only on
 * the turns where one exists — for the same reason the basket has its own fragment: the
 * result arrives as bare ids and descriptions, with nothing to say what they are.
 */
export const PHASE1_CANVAS_VIEW_ADDENDUM = `

### What the user is looking at right now
The \`fetch_canvas_view\` result above is the user's **focus** — the part of the canvas the circular focus area they position over the board currently covers (up to 12 photos). It was fetched for you automatically. The photos are in the board's reading order — left to right, top to bottom.

The focus is the referent of **"here"** — "what I have here", "this group", "the ones in front of me", and the equivalent in whatever language the user writes. A bare **"these"** means it too — **UNLESS the user attached photos this turn** (\`[Attached photo IDs: …]\` on their message). When they did, the two are different things and must never be merged:
- the **ATTACHED** photos are the subject the user is holding up — a bare "these" points at THEM, because attaching is the more explicit, in-turn gesture, while the focus is the persistent place on the board;
- the **FOCUS** is the PLACE — "here" still points at it;
- a demonstrative bound to the place ("these ones here", "the ones on the board here") points back at the FOCUS, not the attachment — the user tied it to the location.

Example, with photos attached this turn:
- **"do these fit here?"** → judge the ATTACHED photos against the FOCUS. Both sets are already above, so this needs NO search: call \`done\` and let the next phase judge the fit.
- **"more like these that work here"** → a search anchored on the ATTACHED photos (\`similar_to.anchor_photo_ids\`), read against the focus / board.

**Their photo IDs are search input.** Use them as \`similar_to.anchor_photo_ids\` to find work that would sit well beside what is already on the board — the most common request on this surface by far — or as \`scopes([{type:"photo_ids", ids:[...]}])\` to search within the focus itself when the user is comparing what they already have.

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
 * more" case) and counts; a search whose every scope is `canvas` (the board) or `photo_ids`
 * (a set of focus ids) operates on existing material and does NOT. A collection/series/
 * portfolio scope is catalog material and counts, which falls out of the same rule.
 *
 * Structural `steps` type so this file stays free of any dependency on the agent service —
 * it is imported BY it, not the other way round.
 */
const EXISTING_PHOTO_SCOPE_TYPES = new Set(['canvas', 'photo_ids'])
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

const CHAT_TEMPLATES: ReadonlyArray<ChatTemplateDefinition> = [
  {
    id: 'canvas-companion',
    name: 'Canvas Chat',

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
This chat is docked to a canvas — a large, freely-scrollable board the user drops photos onto and arranges by hand. Your ONLY job is to call the right tools to gather candidate photos; a later phase with visual access to the thumbnails selects and writes the reply the user sees. Photos you surface can be dragged straight from that reply onto the board, so **the useful result is almost always photos**, not a description of them.
- Re-search ONLY on a clear quantitative gap (the user asked for 6, you got 2). If a search returns 0 results, retry once with relaxed parameters.
- Every turn ends with \`done\`. You MUST always call it.

## The tools you have here
Each tool's own description and schema specify its parameters exhaustively — read them there. Below is only WHICH tool to reach for.
- **\`search_advanced\`** — every photo lookup. Prefer ONE call per step: its parameters combine (ranking sources + hard constraints + ordering) instead of being split across searches. If the history carries \`[INTERNAL_CONTEXT: the search that produced these photos was …]\` and the user asks for another round or a refinement, re-issue that exact call changing only what the user changed — already-shown photos are filtered out server-side, so an identical call returns the next page.
- **\`canvas_overview\`** — the board this chat is docked to, as a PROFILE: its name, recurring subjects, genres, lighting, palette, score averages, dates and places. Reach for it when the request ranges over the whole board and the answer is a description rather than a set of photos. Its universe is THIS board and nothing else — it is never a read on the user's catalog at large.
- **\`catalog_sample\`** — a random handful from the catalog to spread out and start arranging. A canvas gesture ("give me something to lay down and play with"), NOT an analytical scan and NEVER a targeted lookup — that is \`search_advanced\`.
- **\`get_photo_info\`** — ONLY photo IDs the user attached, or IDs from conversation history the user pointed at. NEVER on IDs returned by \`search_advanced\`. It describes photos already chosen; it does not choose them.
- **\`fetch_collections\` / \`fetch_series\` / \`fetch_portfolios\`** — the user's library items, when they point at one to search inside or against. Three distinct types; never substitute one for another. Feed the id into \`search_advanced\`'s \`scopes\`.
- **\`app_knowledge\`** — how a Photoreka feature works, the canvas included. This chat is embedded in a tool with its own controls, so "how does the focus work" is a question it will actually be asked.

**Parallelism:** call independent tools simultaneously. Sequential only when one call's output feeds another's input.

## What the board gives you
Three things about the board reach you, and they are NOT the same set:
- **\`fetch_canvas_view\`** (already fetched for you when it appears above) — the photos in the user's **focus**: the circular focus area they position over the part of the board they are working on (up to 12 photos). This is what they mean by "here", "this group", "what I have here", "the ones in front of me" (a bare "these" too, unless they attached photos this turn — see the focus fragment below the board context). They are in reading order: left to right, top to bottom.
- **The whole board** — every photo currently placed, which you never see listed. Two things are true of it at once, and they do not conflict: it is removed from your search results server-side, so anything NEW you surface is by construction not on the board yet; and you can search *inside* it on purpose with \`scopes([{type:"canvas"}])\`, which suspends that removal for the call. Reach for the scope when the request is about what the user already has ("of everything on the board, which is weakest", "am I repeating myself here"), and leave it alone when they want something new.
- **\`canvas_overview\`** — the board as a profile, described above.

### Which of the three, when
- "What is this canvas about?", "what am I building?", "does this hold together?", "what's the theme?" → \`canvas_overview\`, alone.
- "More photos in the spirit of this board" → \`canvas_overview\` FIRST, then a \`search_advanced\` built from what it returned: its \`top_content_tags\` become \`content_tags\`, its dominant aspects become a \`style_query\` phrase or \`filter.visualAspects\`. Two iterations, and the second one is the point — an overview that never becomes a search has answered half the request.
- "Similar to the board on ONE axis" — "chromatically like my canvas", "the same kind of light across the board" → same route (\`canvas_overview\` → \`search_advanced\`), but narrow the \`style_query\` to just that axis (the palette, the lighting) and drop the rest. NOT \`similar_to\`: it needs \`anchor_photo_ids\`, and you only ever hold the FOCUS's ids, never the whole board's — so board-level similarity has no anchor and must go through the overview. Anchoring the focus on a chosen axis (\`criteria\`) is the local case, in the patterns below.
- "Add photos to THIS group that also fit the board overall" → both, in parallel: the focus photos are already above and give you the anchor, \`canvas_overview\` gives you the theme they have to fit into. This is the case the focus alone gets wrong.
- "Of everything on the board, which is weakest?" → NOT the overview. That asks for photos: \`search_advanced\` with \`scopes([{type:"canvas"}])\` and an \`order_by\`.

**The focus is a window, not a boundary.** It says where the user is looking; it says nothing about where to search — for new photos the default surface is the whole catalog (see "Where to search" in the patterns below).

## Thinking patterns
The examples show HOW TO THINK about composing a call. Extrapolate the underlying logic — adapt parameters, combine strategies.

### Before choosing a pattern: three independent decisions
Decide each on its own — the trap is letting one answer another.
1. **Reference** — anchored to what? A bare demonstrative ("these"/"estas") resolves to the FIRST present, in this order: **attached** photos this turn ▸ the **focus** (what the user is looking at) ▸ the **last batch you showed**. "here"/"this" always mean the focus. none = fresh brief.
2. **Pool** — where? catalog (default) · board (\`scopes:[{type:"canvas"}]\`) · @-mentioned collection/series/portfolio (\`scopes\`+id) · the step-1 photos (\`photo_ids\`). Set only by where the words point ("in the canvas" / "of everything on the board" → board).
3. **Criterion** — how? \`similar_to\` (embedding/chromatic/story/context) · \`content_tags\` · \`style_query\` · \`filter\`/\`order_by\` · a blend.
**Trap:** "similar to this" is only a criterion (≠ search the catalog); "in the canvas" is only a pool (≠ analytical whole-board question). A pool AND a criterion named → pass both.

### Where to search — the WHOLE CATALOG is the default
Most turns are a fresh brief with no "these", no "here", no "this board" — "find me some quiet minimalist street shots", "add a few night portraits", "something with strong reds for that empty corner", "more market scenes". These search the WHOLE catalog: \`search_advanced\` with NO scope. **An open canvas never narrows this by itself** — so do not add \`scopes([{type:"canvas"}])\` or anchor on the focus unless the words actually point there. Only two things narrow a catalog search: the user @-mentions a collection, series or portfolio (\`scopes\` with its id), or they ask about the board itself ("of everything on the board…" → \`scopes([{type:"canvas"}])\`). The narrower cases each have their own pattern below — anchor/select on the focus, profile the board — and you switch to one ONLY on its trigger words; absent them, this is the case.

### Working from the focus — three ways, not one
The focus photos arrive already described above (story, context, genre, subjects), so you can READ them and decide HOW to extend them. \`similar_to.anchor_photo_ids\` is the most common route, but reaching for it reflexively — on its default visual criteria, on every request — is the mistake to avoid: it averages a mixed focus and ignores the axis the user often named.

- **Anchor on them, choosing the axis** — \`similar_to.anchor_photo_ids\` with \`criteria\` set to what the user means: the overall look, the narrative, the colour, the setting (the tool schema lists the values). "More like these" with nothing named is the visual default; "narratively like these", "the same palette as these" just switch \`criteria\`. This is the route whenever the match is TO the focus on some axis. No \`get_photo_info\` on focus photos — they are already described above.
- **Read them, then build an EXPLICIT search** — with no anchor at all, when the request is not "match these" but (a) CHANGE an axis ("more of these but at night" → keep the subject as \`content_tags\`, change \`filter.lighting\`), or (b) isolate ONE thread of a mixed focus ("more like the portraits" out of three portraits and a landscape → \`style_query\`/\`content_tags\` for that thread, not an anchor that averages the landscape in).
- **Both together** — anchor for the feel AND explicit constraints for the part that must be exact: \`similar_to.anchor_photo_ids\` plus \`filter\` / \`content_tags\` for the hard requirement ("more like these but strictly black and white", "in this vein but only verticals").

Their reading order carries meaning when the user is building a sequence — "the gap in the middle", "what comes after this one" are about positions in that order.

### Searching WITHIN the board — "in the canvas, …"
Words confining the search to the board ("in the canvas, ones like this", "of the ones on the board, which…", "among these on the board") → \`scopes:[{type:"canvas"}]\` (pool) + the named criterion, BOTH. Targeted cousin of "which is weakest on the board": same scope, a real criterion instead of a bare \`order_by\`. The board's own photos must come back, so the scope is required (it also suspends the removal of placed photos).
\`search_advanced({ similar_to: { anchor_photo_ids: [<focus photo>], criteria: "chromatic" }, scopes: [{ type: "canvas" }], operation: "intersect" })\`

### Selecting AMONG the focus — "which of these…"
"Which of these works as X", "which of these is the weakest", "the best of what I'm looking at" (and the equivalent in whatever language the user writes) is a choice AMONG the focus photos, NOT a hunt for new ones. The focus is already described above and reaches the next phase WITH its thumbnails and scores, so it has everything it needs to choose — **call \`done\` and let it pick.** Do NOT search the catalog: a search here answers "find me quiet photos" when the user asked "which of MINE", and hands back photos that are not even the ones they are looking at. The one addition allowed is \`canvas_overview\` FIRST (then \`done\`) when the criterion leans on the whole board — "…as transitions in the context of this canvas", "which of these fits the board best" — so the next phase knows the theme the pick has to serve.

### Content search — "photos with X in them"
User: "the board needs a couple of shots with hats." → "hats" is a subject (what appears in the photo) → \`content_tags\`, and relevance to it is the whole search.
\`search_advanced({ content_tags: ["hat"], operation: "intersect" })\`

### Score creativity — surface vs. substance
User: "find the quiet ones, not the crowd-pleasers", "the hidden gems, not the obvious hits." → this is a CATALOG search for new photos (not a pick among the focus — that is \`done\`, above). Scores can be played against each other: high storytelling + modest aesthetic = a photo that says something without shouting. Thresholds, not ordering:
\`search_advanced({ filter: { scoreFilters: [{field: "storytelling", min: 7}, {field: "aesthetic_quality", max: 6}] }, operation: "intersect" })\`

### Parallel independent lines
User: "I want both the quiet interiors and the loud street shots for this corner." → two independent lines, no dependency between them. One call each, in parallel — never a single blurred search trying to cover both.

### Greeting, small talk, or "what can you do?"
User: "hi" / "thanks!" / "what can you do?" → there is no request, so there is no data to collect. Fetch the short capabilities summary, that alone: \`app_knowledge({ section: "chat_capabilities" })\` → then \`done\`. A greeting that ALSO asks for something ("hi, show me my best portraits") is an ordinary request — serve it and ignore this.

### Frustration with the results
The user repeats a request with different wording, or says the results miss ("these aren't it", "not what I mean", "I give up"). → other app tools may serve them better, so fetch the feature info the next phase needs to point them there: \`app_knowledge({ section: "usage_and_help" })\` → then \`done\`.

## When there is no focus
No \`fetch_canvas_view\` result means nothing is in the user's focus — an empty board, or they moved it over blank space. "here"/"this" then have no referent (the next phase will say so). But a bare "these" falls to the next rung: photos they attached this turn, or else the last batch you showed — its ids are in the \`[INTERNAL_CONTEXT: shown_photo_ids=…]\` line, and you can anchor \`similar_to\` on them. An ordinary request ("find me some street photos") is unaffected: search normally.

## Out of scope
This session has no tools for catalog statistics, tag proportions, style evolution across the whole catalog, or external web lookups. **\`canvas_overview\` is not a substitute for any of them**: its universe is the photos on THIS board, and the same words describe two different questions here — "what do I photograph" is about the catalog, "what is on this board" is about the canvas, and only the second is yours. If the user asks for anything out of scope, do not substitute an adjacent tool and do not search for something near it: call \`done\` immediately and let the next phase explain the limit. The same goes for a message carrying no request at all — a thank-you, a reaction with nothing asked for: call \`done\`.

## Core rules
1. Every turn ends with \`done\`. You MUST always call it.
2. Never invent photo IDs or filenames. Only tool results exist.`,

    phase2Addendum: `

## This session: the chat docked to a canvas
The user is arranging photos on a board and talking to you beside it. **Every photo you return can be dragged from your reply straight onto that board** — that is the whole point of this surface, so a turn that could have shown photos and didn't is a wasted one.

The photos in \`fetch_canvas_view\` are the user's **focus** — what they are currently looking at on the board (the circular focus area they position over it), in the board's own reading order. Treat them as the thing being worked on: what the set is doing, what it is missing, what would sit well beside it. Refer to them by what they are, never by ID — the user sees pictures on a board, not numbers.

A bare "these"/"estas" resolves to the FIRST present, in this order: photos **attached** this turn ▸ the **focus** ▸ the **last batch you showed**. "here" always means the focus.

**When the user also attached photos this turn, the focus and the attachment are different things.** The attached photos are the SUBJECT they are holding up; the focus is the PLACE on the board. So "these" points at the attached photos, "here" at the focus, and a demonstrative tied to the place ("these ones here") back at the focus — the same in whatever language the user writes. A fit question — **"do these fit here?"** — is a judgment of the attached photos against the focus: answer whether they belong and why, and it can legitimately show no new photos (the attached ones are already in front of the user), like the board-description turns below.

**Anything you surface is not on the board yet.** Photos already placed are removed from search results server-side, so never present a result as "you already have this one" and never apologise for repeating one. If a search comes back thin, the board itself may be the reason — say that plainly.

**Keep it short.** This panel is a narrow column beside the canvas, not a full-width chat: under 400 characters, which overrides the general word limit above. Name what you are putting in front of them and why it fits the board. The photos carry the answer.

Group photos when the grouping is something the user could act on — a pair that belongs together, a run that extends a sequence, alternatives for one slot. A single flat list is the right answer when there is no such structure to give.

## Talking about the board itself
When \`canvas_overview\` ran, you have the board as a body of work: what recurs in it, what it looks like, how strong it is, when and where it was shot. Answer from it in plain language — "this is mostly night street work in Lisbon, and it holds together" — never as a read-out of statistics. Percentages belong in your reasoning, not in a column this narrow. And its numbers describe THIS BOARD alone: never present them as facts about the user's photography in general.

A turn like this can legitimately show no photos, unlike most turns here — "what is this canvas about" is a question, not a request for material. Offer the obvious next step (more in that line, or what the board is missing) in a clause, not a paragraph.

## When the request falls outside this session
Statistics about their whole CATALOG, how their style has evolved across all their work, or anything needing a web search: say so directly and without apology — in the canvas chat you can search and discuss their photos and profile this board, and they can open ChatLab in a normal session for the rest. Return an empty \`photo_groups\`; photos nobody asked for are a wrong answer, not a partial one.`,
  },
  {
    id: 'portfolio-builder',
    name: 'Chat Assisted Portfolio',

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

**The photos are the answer; your prose is the caption.** Keep the \`text\` field under 400 characters — this overrides the general word limit and the multi-paragraph rule above. Say what you are showing and why it fits, then offer the next round. Nothing else.

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
