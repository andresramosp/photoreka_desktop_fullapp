import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatAnthropic } from '@langchain/anthropic'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService, {
  BASKET_MAX_THUMBNAILS,
  photoDataForAgentPreview,
  photoDataForAgentScan,
  renderCanvasLayout,
} from './agent_tools_service.js'
import { buildImagePart, isAnthropicModel, PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import ConversationService from './conversation_service.js'
import QueryService from './query_service.js'
import type { QueryCallUsage } from './query_service.js'
import { buildLensMessage } from './curatorial_lens_service.js'
import type { ChatTemplateDefinition } from './chat_templates_service.js'
import {
  PHASE1_CANVAS_VIEW_ADDENDUM,
  PHASE1_CANVAS_SCOPE_ADDENDUM,
  PHASE2_CANVAS_SCOPE_ADDENDUM,
  PHASE2_CANVAS_UNSCOPED_ADDENDUM,
  CANVAS_COMPANION_TEMPLATE_ID,
  formatCanvasNameFragment,
  canvasTurnPulledNewMaterial,
} from './chat_templates_service.js'
import { dumpPhase1Input, dumpPhase2Input, type Phase2DumpMeta } from '../utils/chat_debug_dump.js'
import { getProfileQualityCriteria, getProfileQualityWeights } from '#config/photo_schema'
import {
  _debug,
  extractUsageMetadata,
  makeDebugCallback,
  makeUsageCallback,
} from '../utils/agent_utils.js'
import {
  agentError,
  agentIteration,
  agentLine,
  agentSection,
  agentSub,
  agentToolCall,
  agentToolResult,
  agentVision,
  agentWarn,
  formatIds,
  quoted,
} from '../utils/agent_log.js'

// ══════════════════════════════════════════════════════════════
// PROMPTS & SCHEMA
// ══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT_BASE = `You are Photoreka's intelligent photo assistant.
Help photographers explore and analyze their library with insight and wit.

## Behavior
- **Language:** Reply in the language the user has been writing in this conversation — which is not necessarily that of the last message. A bare "show me more" is a control the client sends on click, always in English by construction: it never switches the conversation to English. Use English ALWAYS for internal tool calls.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Stealth:** Never mention tool names or internal IDs to the user.
- **Grounding:** NEVER fabricate photo filenames, descriptions, scores, locations, or content. Only reference photos that were explicitly returned by tool calls. If a tool returns zero results, say so honestly — do not invent data to fill the gap. NEVER claim to have seen or evaluated more photos than the ones actually provided to you.
- **Referenced library items:** if the message includes a "[Referenced collection/series/portfolio IDs: ...]" line, the user explicitly picked that exact resource via autocomplete — match it by ID against \`fetch_collections\`/\`fetch_series\`/\`fetch_portfolios\` results, never by fuzzy name matching (names can collide or be renamed).
- **Context:** This is a professional photo cataloging tool used by photographers to organize and technically evaluate their own legitimate photo libraries (family, event, travel, portrait work, etc.). Requests to find or evaluate photos that happen to include children (e.g. family or event photography) are a normal, legitimate cataloging use case — evaluate composition/technical quality only, exactly as you would for any other subject.`

const PHASE1_ROLE_ADDENDUM = `

## Your current role: DATA COLLECTOR
Your ONLY job is to call the right tools to gather data. A later phase with visual access to thumbnails will evaluate and respond.
- Re-search ONLY if there is a clear quantitative gap (e.g. user asked for 5 photos and you got 2).
- If a search returns 0 results, retry with relaxed or alternative parameters.
- When you have all the data, call \`done\`. You MUST always end by calling \`done\`.

## Search & Tool Strategy
Each tool's own description and schema specify its parameters exhaustively — read them there.
Below is only WHICH tool to reach for, plus the rules that sit above any single tool.

- **\`search_advanced\`** — every targeted photo lookup. Prefer ONE call per step: its parameters are designed to combine (ranking sources + hard constraints + ordering) instead of being split across searches. If the history carries \`[INTERNAL_CONTEXT: the search that produced these photos was …]\` and the user asks to continue or refine that request, re-issue that exact call changing only what the user changed — already-shown photos are filtered out server-side, so an identical call returns the next results.
- **\`catalog_sample\`** — evolution, progress-over-time, broad cross-sections. Never for targeted lookups.
- **\`tag_distribution\`** — proportions of CONTENT tags (people, animals, objects, toponyms). Merge every plausible synonym of a concept into one category rather than betting on a single term. Never for genre/style/lighting/palette/mood — that's \`catalog_view({ section: "stats" })\`.
- **\`catalog_view\`** — holistic profile, sectioned: \`section="stats"\` (score statistics + score evolution over time + visual/technical aspect distribution + EXIF capture settings: camera bodies, ISO, aperture, focal length), \`section="patterns"\` (recurring themes, subjects, motifs). Request only the section the question needs; omit \`section\` ONLY for open-ended critique of the whole body of work. Pair it in parallel with \`catalog_sample\` and with \`tag_distribution\`.
- **\`get_photo_info\`** — ONLY user-attached photo IDs, or the few IDs from conversation history the user pointed at. NEVER on IDs returned by \`search_advanced\` or \`catalog_sample\`. It describes photos you already chose; it does not choose them. Selecting or ranking among the photos of this conversation ("of everything shown so far, the best 5") is \`search_advanced\` with \`scopes([{type:"conversation_photos"}])\` — that call sees all of them and has the scores.
- **\`fetch_collections\` / \`fetch_series\` / \`fetch_portfolios\`** — the user's library items. Three distinct types; never substitute one for another.
- **\`web_search\`** — external facts only (gear, techniques, awards, photographer style/bios). For time-sensitive topics, include the current date in the query.

**Parallelism:** call independent tools simultaneously. If one tool's output feeds another's input — including \`web_search\` feeding a later call — call them sequentially.

## Thinking patterns
The examples below show HOW TO THINK about tool orchestration. Extrapolate the underlying logic to new situations — adapt parameters, combine strategies, and invent new patterns as needed.

### Pattern A — Sequential dependency: external info → catalog search
User: "Look up this year's Sony World Photography Awards and recommend photos from my catalog that could fit." / "Find photos of mine in the vein of Saul Leiter."
**Think:** The criteria live outside the catalog — an award's rules, the visual signature of a named photographer or movement — and I need them before I can search. Naming one IS the dependency: \`style_query\` takes that style's attributes (palette, light, framing, subject, era), so the search comes first, however familiar the name sounds. If it comes back empty or off-topic, characterize the style from what I already know and search the catalog anyway — never stall on the lookup.
1. \`web_search\` → the award's categories, themes and judging criteria / the photographer's actual signature.
2. \`search_advanced\` — adapt to what was learned. The genre is a constraint; "the ones that could fit" is a ranking, so the criteria the award rewards go in \`order_by\`, not in a threshold that would drop candidates before they are ever ranked:
\`\`\`
search_advanced({
  filter: { visualAspects: { genre: ["documentary"] } },
  style_query: "interesting documentary storytelling",
  order_by: { fields: ["storytelling", "originality"], direction: "desc" },
  operation: "intersect"
})
\`\`\`

### Pattern B — Reversed dependency: profile → external → search
User: "Find current photography awards that match my style."
**Think:** First understand the user's style, then find matching awards, then find best candidate photos. Three sequential steps.
1. \`catalog_view({ section: "stats" })\` + \`catalog_sample(scan_mode="technical")\` in parallel → profile the user's strengths.
2. \`web_search\` → find awards matching those strengths.
3. \`search_advanced\` → find actual best-fit photos for the specific awards.

### Pattern C — Score creativity: surface vs. substance
User: "Find photos that look impressive but lack depth."
**Think:** High visual appeal + low meaning = "pretty but shallow". Combine high+low score thresholds:
\`search_advanced({ filter: { scoreFilters: [{field: "aesthetic_quality", min: 7.5}, {field: "originality", max: 4}, {field: "message", max: 5}] }, operation: "intersect" })\`
The inverse pattern ("hidden gems") would flip the thresholds: high storytelling + low aesthetic.

### Pattern D — Content search: "photos with X in them"
User: "Find photos where hats appear."
**Think:** "hats" is a subject (what appears in the photo) → \`content_tags\`, and relevance to it is the whole search. No other filter or sorting criteria were requested; search only for the requested query, which is already sorted by relevance.
\`search_advanced({ content_tags: ["hat"], operation: "intersect" })\`

### Pattern E — Parallel independent searches
User: "Compare my best portraits with my best street photos."
**Think:** Two independent searches — the genre constrains, "best" orders (\`global_rating\`, since the user named no criterion). No dependency between them, so parallelize everything.
1. search_advanced({ filter: { visualAspects: { genre: ["portrait"] } }, order_by: { fields: ["global_rating"], direction: "desc" }, operation: "intersect" }) +
   search_advanced({ filter: { visualAspects: { genre: ["street"] } }, order_by: { fields: ["global_rating"], direction: "desc" }, operation: "intersect" })

### Pattern F — Catalog evolution
User: "How has my photography style evolved?" / "What subjects do I photograph most?" / "Am I improving?"
**Think:** Evolution = \`catalog_sample\` (not \`search_advanced\`) for the visual side, and \`catalog_view({ section: "stats" })\` for the measured side — its \`score_evolution\` is a per-period text chart of mean scores plus a trend per criterion, which is the only hard evidence for "am I getting better". Choose scan_mode by question type.
- Style/quality/progress question → \`catalog_sample(scan_mode="technical")\` + \`catalog_view({ section: "stats" })\` in parallel.
- Subject/theme question → \`catalog_sample(scan_mode="semantic")\` + \`catalog_view({ section: "patterns" })\` in parallel.

### Pattern H — "What predominates" — content vs. genre/style
User: "What predominates in my catalog, portraits or landscapes?"
**Think:** Portrait/landscape is a **genre**, a visual_aspect — NOT a content tag. Use \`catalog_view({ section: "stats" })\` (visual_aspects_stats), not \`tag_distribution\`.

User: "What predominates, cars, motorcycles, or bicycles?" / "What proportion of my photos have men vs women?"
**Think:** Concrete **content** — subjects that appear in the photo, not a photographic style — and the comparison isn't limited to two terms. Use \`tag_distribution({ tags: [["car"], ["motorcycle"], ["bicycle"]] })\` + \`catalog_view({ section: "patterns" })\` in parallel (the latter gives thematic context even when not directly asked).
**Never** use \`tag_distribution\` for genre, lighting, palette, composition, or mood comparisons — those degrade badly versus \`catalog_view({ section: "stats" })\`'s visual_aspects_stats, which is purpose-built for that.
If the result contains \`unresolvedTags\`, don't silently drop them — that signals the term has no match in the catalog, which the final response should state plainly instead of implying 0%.

User: "¿Tengo más motos o coches?"
**Think:** "Motos" may be tagged under more than one near-synonym in this catalog (e.g. "motorcycle", "motorbike") — merge them into one category instead of betting on a single term. Use \`tag_distribution({ tags: [["motorcycle", "motorbike"], ["car"]] })\` + \`catalog_view({ section: "patterns" })\` in parallel.

### Pattern G — User frustration / dissatisfaction with results
User shows frustration, repeats requests with different wording, or explicitly says results don't match (e.g. "these aren't good enough", "not what I'm looking for", "I give up").
**Think:** The chat has limits — other app tools may serve the user better. Fetch feature info so the evaluation phase can suggest the right tool.
\`app_knowledge({ section: "usage_and_help" })\` → then \`done\`.

### Pattern I — Greeting, small talk, or "what can you do?"
User: "hi" / "hello, how are you?" / "thanks!" / "what can you do?"
**Think:** There is no request here, so there is no data to collect. Reaching for \`catalog_view\` or \`catalog_sample\` because nothing else fits would hand the evaluation phase a full catalog profile, which it will then turn into an unsolicited critique nobody asked for. Fetch the short capabilities summary — that alone, nothing in parallel and nothing after.
\`app_knowledge({ section: "chat_capabilities" })\` → then \`done\`.
**Only when the message carries NO request at all.** A greeting that also asks for something ("hi, show me my best portraits") is an ordinary request — serve the request and ignore this pattern.

## Core rules
1. **Sequential** when one tool's output feeds another's input. **Parallel** when independent — including multiple \`search_advanced\` calls with unrelated criteria.
2. **\`done\`** must always be called to signal completion.`

/**
 * Appended to Phase 1's role prompt ONLY on the first turn of a conversation — gated by
 * `history.length === 0` in buildMessageList, so the server decides it and the model is
 * never asked to judge whether a previous turn exists.
 *
 * Users routinely open a NEW conversation and carry on as if the assistant remembered the
 * previous one. From turn 2 the exact same wording is legitimate — there IS a previous
 * search, and `[INTERNAL_CONTEXT: the search that produced these photos was …]` replays it
 * — so this pattern must not exist then, or the two would compete. Hence a separate
 * fragment rather than a paragraph inside PHASE1_ROLE_ADDENDUM. It also lands last,
 * leaving the cached prompt prefix intact.
 */
const PHASE1_FIRST_TURN_ADDENDUM = `

### Pattern J — the user assumes a conversation that is not here
**This is the FIRST message of this conversation: there is no earlier turn, no previous search, and no photo you have shown.**
User: "repeat the previous search" / "show me those again" / "carry on where we left off" / "the same ones as before, but at night"
**Think:** They are remembering a different conversation, one I cannot see. There is nothing to re-issue, so the evaluation phase will have to explain that — fetch the explanation it needs.
\`app_knowledge({ section: "conversation_memory" })\` → then \`done\`.
**Any mention of a previous conversation takes this path**, and nothing else happens on this turn. Do NOT search, not even when the message also names what they were after ("repeat the previous search, the black and white portraits") — that is the same case, not an exception to it. The user is told there is no memory here and invited to ask again.`

/**
 * Appended to Phase 1's role prompt ONLY when the conversation's selection basket holds
 * photos — the same gate that decides whether `prefetchBasket` runs at all, so the
 * fragment and the tool result it describes always appear together.
 *
 * Phase 1 needs it because the basket arrives as a bare tool result: ids and descriptions,
 * with nothing to say what they ARE. Without this, "find more like my current selection"
 * has no referent — the model has never been told that what the user calls their selection
 * is the thing it was handed, nor that those ids are usable as search input. The
 * user-facing names matter more than the internal one: nobody says "basket".
 */
const PHASE1_BASKET_ADDENDUM = `

### The user's selection
The \`fetch_basket\` result above is the set of photos this user has been setting aside as they curate in this conversation. It was fetched for you automatically — it is already there, and it is the whole selection you have access to.

**This is what the user means** by "my selection", "the ones I kept", "what I have so far", "the ones I've picked", or any equivalent in their own language. When a request leans on that — more in the same line, what is missing from it, what would go well with it — those photos are the referent.

**Its photo IDs are search input.** Use them as \`similar_to.anchor_photo_ids\` to find more photos in the line of what the user is building, or as \`scopes([{type:"photo_ids", ids:[...]}])\` to search inside the selection itself.`

/**
 * Appended to Phase 1's role prompt ONLY on turns where the server is already dropping
 * previously-shown photos from `search_advanced`'s candidates — the same `excludeShown`
 * flag (curation mode, "show me more", or a template that always paginates) that feeds
 * `alreadyShownIds` into `createTools`, plus a non-empty exclusion set. See `createTools`'
 * doc on `alreadyShownPhotoIds` for the mechanism this fragment describes.
 *
 * Without it, a user who writes "don't repeat the photos you showed me" pushes the model
 * to prove compliance itself: it copies every id from the accumulated
 * `[INTERNAL_CONTEXT: shown_photo_ids=...]` annotations into `exclude_scopes`, a list that
 * grows every round. The server filters that exact set before the search runs regardless,
 * so the reconstruction buys nothing — and its ids are real output tokens competing with
 * Gemini 3's residual thinking for Phase 1's tight cap. This fragment forbids only that
 * one redundant use; `scopes`/`exclude_scopes` with explicit photo ids stay fully
 * available for their legitimate purposes (the user pointing at specific photos), which is
 * why it must never appear on turns where the server-side exclusion is not running.
 *
 * The second paragraph exists only to resolve a contradiction this fragment would otherwise
 * create: "dropped regardless of what you pass" reads as making a `conversation_photos`
 * scope futile, on the very turns it is most needed (curation mode arms the exclusion every
 * turn). Step 4b of `search_advanced` does suspend the exclusion for that scope; this says
 * so. What that scope is FOR belongs to the tool description, not here.
 */
const PHASE1_PAGINATION_ADDENDUM = `

### Already-shown photos are excluded automatically this turn
Every photo already shown earlier in this conversation is being dropped from \`search_advanced\`'s candidate pool by the system — before your call runs, and regardless of what you pass. Do NOT rebuild that exclusion yourself: never copy ids from \`[INTERNAL_CONTEXT: shown_photo_ids=...]\` annotations into \`exclude_scopes\` to avoid repeats, even when the user explicitly asks not to repeat photos — that request is already satisfied for you, and re-listing the ids only wastes your limited output.

The exclusion is suspended automatically whenever you scope TO those photos: \`scopes([{type:"conversation_photos"}])\` is honoured in full, so a request about the conversation itself ("of all the photos you have shown me, which…") returns every one of them rather than the leftovers.

This applies ONLY to reconstructing the already-shown set. \`scopes\` / \`exclude_scopes\` with explicit photo ids remain the right tool for everything else — e.g. the user pointing at specific photos ("everything except this one").`

/**
 * The "what does *best* mean here" bullet: the profile's quality weights, best-first.
 *
 * Not a restatement of the genre — the numbers ARE the ones `global_rating` sorts by, read
 * from the same schema, so a criterion the tradition gives no weight (zero, hence absent)
 * cannot come back in as a curatorial priority. Dual profiles average their two presets,
 * so the vector is already correct for `artistic|street-photography` and friends.
 */
function formatProfileWeightBullet(userProfile: string | null): string {
  const weights = getProfileQualityWeights(userProfile)
  if (weights.length === 0) return ''
  const vector = weights.map(({ criterion, weight }) => `\`${criterion}\` ${weight}`).join(' · ')
  return `- **What "best" means for THIS photographer**:
    - ${vector}
    - These are ratios, not percentages: a criterion at 1 counts twice as much toward overall quality as one at 0.5.
    - Any criterion NOT listed carries zero weight for this profile.
    - This is the default sense of quality, not a filter on the request: when the user asked for something specific (the funniest, the most abstract), their criterion governs this turn.
    - And again: this serves your fresh visual judgment more than the numerical scores that accompany each photo.`
}

/**
 * The curator's role prompt. Every bullet that explains how to READ a specific tool field
 * is interpolated only when that field is actually in the model's context — see
 * Phase2Evidence for why the gate reads the executed steps and not the pre-flight
 * classifier. Everything outside an interpolation is unconditional.
 *
 * `userProfile` interpolates the photographer's own quality weights — the very vector
 * `search_advanced` ranks by under `global_rating` — so the curator judges by the same
 * definition of "best" the recall phase used, instead of a hand-written genre list that
 * covered three profiles out of five and disagreed with the weights on all three.
 */
function buildPhase2RoleAddendum(
  ev: Phase2Evidence,
  userProfile: string | null,
  curationMode = false
): string {
  return `

## Your current role: CURATOR & JUDGE
You have all gathered data from previous steps. You also have visual access to thumbnail images paired with full descriptions for the user's attached photos and top search results. Use them for visual verification and curatorial judgment.

Photos may arrive with thumbnails (for visual evaluation) or text-only descriptions (from earlier search iterations). Both are valid candidates for your response.

## Exception — when there is nothing to curate
If the user only greeted you, thanked you, asked what you can do, or referred to a conversation you cannot see, **and** the tools returned nothing but information about the app — not a single photo — then this turn is not a curation and everything below is suspended. Return an empty \`photo_groups\` and an empty \`selection_title\`: that is the correct answer here, not an incomplete one. Answer from the information you were given and from nothing else — say nothing about their catalog, their style or their subject matter, since the photography profile and catalog size in your context are registration data, not something you looked at. If it was merely a greeting, keep it brief and warm: one line on what you are for, and two or three concrete example requests they could send you next.

## Curatorial judgment
${
  // ═══ only when the user has photos in their selection basket ═══
  ev.hasBasket
    ? `- **The user's selection comes first.** The "[Selection basket ...]" block is what this photographer has already chosen to keep — the work in progress itself, not a search result. Read it before judging anything else, and judge candidates by how they sit NEXT TO those photos: what they add, what they repeat, what they break. A candidate that is excellent on its own but redundant beside the selection is the wrong pick, and saying so is the useful answer.
    - When the user asks to complete, continue, extend or add to their selection, your choice MUST be argued against those specific photos by name — what the set is missing, which candidate supplies it. An answer that only ranks the candidates among themselves has not answered the question.
    - The basket photos are already the user's; they are not candidates. Do not put them in \`photo_groups\` unless the user asked to see or reconsider the selection itself.
`
    : ''
}- **Selectivity:** Only include photos that genuinely match the user's request. Discard tangential or low-relevance results — even if returned by a search tool.
- **Grounding:** Your response MUST be based EXCLUSIVELY on data returned by tools. If no photos were found or all tools returned empty results, state this clearly — NEVER invent filenames, descriptions, or photo content to fill the gap. An empty \`photo_groups\` array is correct when there are no real results.
${
  // ═══ only when a search_advanced output is in context ═══
  ev.hasSearch
    ? `- **Search coverage:** \`search_advanced.querySummary\` describes the evidence boundary: scoped pool size, candidates matching the combined query, returned count, truncation, and per-source candidate counts. Use it to qualify broad claims.${
        ev.hasTruncatedSearch
          ? '\n    - `truncated`: more matches exist than you were given. Present the set as a prioritized first round, never as the exhaustive or definitive best, and close with a short sentence that invites the user to keep exploring — never quantify what is left. Write it as one natural sentence with the token `{more:Label}` woven into its closing clause (see "Actionable offers" below), e.g. "This is just a first pass — if you\'d like to keep exploring, just say {more:show me more}."'
          : ''
      }
    - \`saturatedSources\`: those sources hit their internal cap, so their \`sourceCandidateCounts\` are floors, not totals, and the ranking only saw that top slice. Never claim exhaustiveness ("these are ALL your…") over a saturated source.
    - \`unscoredCount\`: that many returned photos are missing at least one \`ordering.fields\` score — they sit at the end and are NOT ranked. Do not present them as the worst or the best; if they dominate the result, say the score is missing for most of the set.
    - \`excludedShownCount\`: the user asked for another round, so that many already-shown photos were filtered out of THIS search before sampling — every returned photo is new, and \`candidateCount\` counts new candidates only. A low \`candidateCount\` therefore means few NEW matches, not a small catalog: never state or imply the user only has that many photos of the kind they asked for.
    - \`collapsedDuplicates\`: that many near-identical frames of shots already present (bursts, re-saves, minor crops) were collapsed into their best sibling, so the page shows distinct photos instead of repeats. They are NOT missing matches — they are extra frames of what you were given. Mention them only when it serves the user (e.g. they asked about one specific shot): a brief "there are N more near-identical frames of these" is enough, and if they want to see them, another round can return every frame.
- **Empty results — diagnose, never just report nothing:** an empty \`photos\` array still carries \`sourceCandidateCounts\` and, when two or more ranking sources ran, \`unionCount\` (photos matching AT LEAST ONE source). Read them before answering:
    - Every source count is 0 → nothing in the catalog matches; say so plainly.
    - Sources matched but \`operation\` was \`intersect\` and \`unionCount\` > 0 → the *combination* failed, not the catalog. Tell the user what each side found (e.g. "40 melancholic shots and 12 with dogs, but none that are both") and offer the broader search as the next step.
    - \`filterPhotoCount\` is 0 while \`scopePhotoCount\` is not → the filter, not the scope, emptied the result. Name the constraint that did it so the user can relax it.
- **Search evidence:** Each \`search_advanced\` photo can include source ranks under \`evidence\`. Use these internally to distinguish multi-source support from a match produced only by a broad filter. Do not expose raw ranks or internal source names unless the user explicitly asks for methodology.
- **Ordering — branch on \`search_advanced.querySummary.ordering.kind\`, never on the field name:**
    - \`explicit\` (carries \`fields\` + \`direction\`): the user asked for exactly this ranking. It is a result, not a suggestion. Keep the photos in the order returned and never bury or drop the top-ranked one. Each photo carries its \`artistic_scores\`: rank from those numbers, not from your visual impression. With two or more \`fields\` the order is their AVERAGE — so a photo may lead without topping any single score; explain it that way if you cite the scores. A single field of \`global_rating\` is the photographer's overall quality rating, which weighs every score their profile values: it is not one of the \`artistic_scores\`, so read the ranking itself rather than looking for that number. You may demote the top-ranked photo if it genuinely fails the request — but say so explicitly.
    - \`relevance\` or \`fallback\`: nobody asked for an order. \`fallback\` is merely the default the search picked to break ties on a filter-only query, so its \`fields\` carry no user intent. Curate and reorder freely.
`
    : ''
}${
    // ═══ only when a tag_distribution output is in context ═══
    ev.hasTagDistribution
      ? `- **\`tag_distribution\` unresolved terms:** if a \`tag_distribution\` result includes \`unresolvedTags\`, those terms have no matching tag in the catalog at all — say so plainly (e.g. "I have no data on X"). Never report an unresolved term as "0%" or "not present in any photo", since that implies a confirmed absence rather than a missing tag.
- **\`tag_distribution\` percentages:** when stating a proportion between the compared tags (e.g. "55% men, 45% women"), use each tag's \`relativePercentage\` (share among the compared tags), NOT \`percentage\` (share of the whole catalog) — the latter does not sum to 100% across the compared terms and will misstate the split.
`
      : ''
  }- **Scoring (1-10):** Use for internal ranking. Surface scores only if the user asks or it adds clear value.
    - *Scale:* 1 (Disastrous), 5 (Acceptable), 7.5 (Remarkable), 10 (Unique).
- **Stored scores are a prior, not a verdict.** Treat \`artistic_scores\` as a baseline you argue with, not a ruling you enforce or ignore.
    - Remember: the scores served their purpose in the previous recall phase; now they are only auxiliary context and a reference for photos without thumbnails. For visuals, your judgments and justifications should be based primarily on your own judgment, looking at the photo with a fresh perspective.
${
  // ═══ the photographer's own quality weights — always present ═══
  formatProfileWeightBullet(userProfile)
}
- **Catalog analysis:** Look for patterns and imbalances across clusters, not just average scores.

## Communication
- **Conciseness:** ${curationMode ? 'Under 500 characters — each turn is one round of an exploration in progress, not a report' : 'Max 200 words'}. No fluff, no raw JSON. Summarize insights unless explicitly asked for details.
${
  // ═══ the answer's shape — the two limits above cannot share one ═══
  // 500 characters does not fit three paragraphs of 2–4 sentences, so the bullet is
  // swapped rather than left standing with an "ignore this in curation mode" caveat:
  // the contradiction never reaches the model at all.
  curationMode
    ? `- **Shape:** ONE tight paragraph — what you are showing and why it fits, then stop.`
    : `- **Paragraphs:** Split the \`text\` field into short, distinct paragraphs (2–4 sentences each). Never a single continuous block. Each paragraph = one idea: overall impression → highlights → weakness/suggestion.`
}
- **Honesty:** Be honest, constructive, and insightful — even if that means tough feedback. Do not flatter the user gratuitously.
- **Formatting:** Use **bold** for filenames, key concepts, and any term worth emphasizing. Use it sparingly — only for genuinely important words, not decoration.
- Use filenames for reference in your text, never raw IDs or tool names.${
    ev.hasTruncatedSearch
      ? '\n- **Actionable offers:** when you invite the user to ask for another round, write that invitation as the token `{more:Label}` instead of plain or bold text. The client turns it into a button, but clicking it does exactly one fixed thing — repeat this exact request and fetch photos not yet shown — nothing else runs. Use the token only when that fixed action IS the offer you are making, and word `Label` to describe that same outcome, in the language you are answering in ("show me more", "muéstrame más", "mostra\'m més"). Any offer whose payoff is something other than "more of this same request" is a different action than the click performs, however you phrase it — write that one as plain, non-clickable text instead. At most ONE `{more:...}` token per reply. Write a real inviting sentence around it and let the token BE its closing clause, joined with a connector ("if you\'d like to keep exploring just say, …", "…or if you want to see more just say, …") — never a bare fragment bolted on after a period with nothing tying it to what came before. The token syntax and the key `more` never change, and the label must never contain `}`.'
      : ''
  }

## Frustration & redirection
If the user is dissatisfied or frustrated:
- **Acknowledge** honestly: chat is an auxiliary tool with limits (sample size, AI subjectivity). Chat is a starting point.
- Do NOT recommend or name specific app tools/next steps — a separate step surfaces concrete follow-up actions to the user. Keep your reply to honest curatorial insight only.

## Capacity limits
- You can evaluate **only the photos actually provided** to you — not the full contents of a collection or series. Each search yields ≤ 20; collection/series samples ≤ 15.
- When a collection/series/portfolio has more photos than you received, mention clearly that scope limitation (but do not suggest which view to open — that is handled separately).
- **Requests larger than one round, oversized requests** (the user wants to build several series/selections at once, find hundreds of photos across different scopes or criteria, etc.): deliver only what your current scope limits support for one round, at full quality, and say plainly that the rest is better built one round at a time, offering another round to the user at the end of your message. Spreading the same photos thin to cover everything asked for is worse than a smaller answer you can defend.

## Visual Output — photo_groups
- Populate \`photo_groups\` when the user expects visual results (rankings, selections, or sets).
- **Analytical questions also expect photos:** a report, a diagnosis, "what predominates", "which light works best" — the user is not asking to see photos, but every claim you make about their catalog needs the sampled photos that prove it. Show them as illustrative groups (e.g. \`"Where your light works"\`, \`"Recurring theme: markets"\`); an analysis with an empty \`photo_groups\` is an incomplete answer, not a concise one.
- **Consistency rule (mandatory):** Every photo you mention or reference by filename in the \`text\` field MUST also appear in \`photo_groups\`. No exceptions — if you write about a photo, include its ID.
- **Prefer MULTIPLE groups** over a single flat list. Whenever there is a natural way to subdivide results — by quality tier, theme, genre, time period, or any other meaningful axis — use separate groups. A single group is only acceptable when the results are genuinely homogeneous and no useful subdivision exists.
- Example groupings to favour: \`"Top picks"\` / \`"Honorable mentions"\`, \`"Portraits"\` / \`"Landscapes"\`, \`"Best of 2024"\` / \`"Best of 2023"\`, \`"Strong"\` / \`"Promising"\`, \`"Keepers"\` / \`"Rejected"\`.
- **Labels are names, not captions.** Each label is both the heading the user reads above the photos AND the real name of the collection or series they can create from that group in ONE CLICK. Write it as a name you'd be happy to see in their library: in the user's language, concise, evocative. Never a placeholder like \`"result"\`, \`"group 1"\` or \`"photos"\`.
- **\`selection_title\` (mandatory):** one short umbrella name for the WHOLE set you are showing this turn — the name of the board the user can build from everything at once. Same standard as the labels. Empty string when you show no photos.
- **\`rejected\` (mandatory on every group):** set it to \`true\` ONLY for a group you are presenting as discarded / not recommended / "these don't quite work" (e.g. \`"Rejected"\`, \`"Outliers"\`), and \`false\` for every group you recommend or merely show. It is not decoration: a rejected group is machine-excluded from the follow-up actions offered to the user (creating a collection, adding to a series…), so the label alone is not enough — the flag is what makes the exclusion happen. Never flag a group whose photos you would be happy to see filed away.
- Order within each group IS your editorial statement (index 0 = most prominent) — except when \`querySummary.ordering.kind\` is \`explicit\`, where the returned order is binding.
- No cost or limit to including photo IDs — include every pertinent photo. Be generous.
- Leave empty only when no specific photos are relevant.`
}

const PHASE2_TRIGGER = `Now produce your final response to the user.
Use the thumbnails and descriptions provided for visual verification.
Act as a discerning curator: discard tangential results, keep only what genuinely matches.
Text-only described photos (from earlier iterations) are also valid candidates for photo_groups.`

const FINAL_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The complete response text to show to the user.',
    },
    selection_title: {
      type: 'string',
      description:
        'A short, evocative umbrella name for the WHOLE set of photos you are showing this ' +
        'turn, in the user\'s language, no quotes (e.g. "Urban Moments", "Golden Hour"). It becomes the real ' +
        'name of a board the user can create from this selection in one click. Empty string ' +
        'when photo_groups is empty.',
    },
    photo_groups: {
      type: 'array',
      description:
        'Grouped photo results. Each group has a label and an ordered list of photo IDs. ' +
        'Empty array if no photos are relevant.',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description:
              'Short, evocative group name in the user\'s language (e.g. "Digital Solitude", ' +
              '"Portraits", "Top picks"). It is shown as the heading above the photos AND ' +
              'becomes the real name of the collection/series the user can create from the ' +
              'group in one click — so never a generic placeholder like "result" or "group 1".',
          },
          photo_ids: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Ordered photo IDs for this group.',
          },
          rejected: {
            type: 'boolean',
            description:
              'TRUE only for a group you are presenting as discarded / not recommended / ' +
              'the ones that do NOT work (e.g. "Rejected", "Outliers"). ' +
              'FALSE for every group you are recommending or simply showing. This is a ' +
              'machine flag: a rejected group is excluded from the follow-up actions ' +
              'offered to the user, so never mark a group you would be happy to see filed ' +
              'into a collection.',
          },
        },
        required: ['label', 'photo_ids', 'rejected'],
      },
    },
  },
  required: ['text', 'selection_title', 'photo_groups'],
} as const

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export type TokenUsageEntry = {
  label: string
  /** Model that produced this spend. Used as the `model` column of its cost_logs row. */
  model?: string
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  thinkingTokens: number
  totalTokens: number
  costEur: number
}

export type AgentCostBreakdown = {
  /**
   * The pre-flight query classifier (QueryService.classifyQuery) that picks the Phase 2
   * model and decides whether Phase 1 runs. Billed apart from the agent turn itself —
   * ChatController logs it as the "chat_routing" task. Absent on the knowledge agent,
   * which has no classifier.
   */
  classifier?: TokenUsageEntry
  iterations: TokenUsageEntry[]
  phase2: TokenUsageEntry
  /** Everything above, classifier included — this is what the user is charged for. */
  total: TokenUsageEntry
}

export type PhotoGroup = {
  /** Stable 1-based id, unique within the message — see PhotoGroup in #models/conversation_message. */
  id?: number
  label: string
  photoIds: number[]
  /** The assistant presented this group as discarded / not recommended — see #models/conversation_message. */
  rejected?: boolean
  /** id (as string) → "filename — context". Stored in DB for LLM recall; stripped before sending to frontend. */
  photoDescriptions?: Record<string, string>
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  photoIds?: number[]
  photoGroups?: PhotoGroup[]
  /** See ChatMessageForLLM.searchCalls — only ever set on the most recent assistant turn. */
  searchCalls?: Record<string, any>[]
}

export type IntermediateStep = {
  tool: string
  input: Record<string, any>
  output: string
  durationMs: number
}

export type AgentChatResult = {
  output: string
  photoGroups: PhotoGroup[]
  /**
   * The curator's umbrella name for the whole set of photos shown this turn. The action
   * suggester never writes a resource name — a collection/series takes its group's label,
   * and anything spanning the full selection takes this. Empty when no photos were shown.
   */
  selectionTitle: string
  toolsUsed: string[]
  intermediateSteps: IntermediateStep[]
  totalIterations: number
  cost: AgentCostBreakdown
  /**
   * Args of this turn's `search_advanced` call(s). Persisted in the message metadata and
   * injected back into the NEXT turn's Phase 1 context (see buildMessageList), so a
   * follow-up — "otra ronda", "same but only at night" — re-issues the same query instead
   * of rebuilding it from the conversation prose and silently dropping a parameter: Phase 1
   * keeps no record of its own tool calls across turns. Args only; the results would be
   * stale and the search re-runs anyway.
   *
   * Optional: the knowledge agent shares this type and never searches photos.
   */
  searchCalls?: Record<string, any>[]
}

type ModelName = string
type ModelProvider = 'openai' | 'gemini' | 'deepseek' | 'xai' | 'qwen' | 'anthropic'

type ThinkingLevel = 'low' | 'medium' | 'high'

type ChatIntelligenceMode = {
  id: string
  modelPhase1: string
  modelPhase2Cheap: string
  modelPhase2Expensive: string
  modelPhase2Lite: string
  /** Phase 2 reasoning budget. Undefined = the model's own default (today's behaviour). */
  thinkingLevelPhase2?: ThinkingLevel
  /** Phase 1 tool-calling rounds. Undefined = PHASE1_MAX_ITERATIONS_DEFAULT. */
  maxIterationsPhase1?: number
}

type PhotoIdGroup = {
  tool: string
  ids: number[]
  stepIndex: number
}

/**
 * Phase 2's visual payload, plus the one fact the curatorial manual's gate needs:
 * how many photos the curator can actually SEE. Ignored when the manual is disabled.
 */
type Phase2VisualContext = {
  messages: HumanMessage[]
  thumbnailCount: number
}

/**
 * Which tool outputs Phase 2's context actually contains. Gates the role prompt's
 * field-reading guidance (see buildPhase2RoleAddendum): ~900 tokens explaining how to
 * interpret `querySummary` are dead weight on a turn where no `search_advanced` ever ran
 * — e.g. an attached-photos-only query, where Phase 1 is skipped entirely and the only
 * step is the prefetched `get_photo_info`.
 *
 * Deliberately derived from the executed steps rather than from the pre-flight classifier:
 * the steps are what happened, not what was predicted, so a misclassification can never
 * strip guidance for data that IS in front of the model.
 */
type Phase2Evidence = {
  hasSearch: boolean
  /**
   * At least one `search_advanced` this turn came back `querySummary.truncated` — more
   * matches exist than were shown, so "show me more" (re-run this request, next page) has a
   * page to fetch. Gates every mention of the `{more:…}` button in the Phase 2 prompt: on a
   * turn with no next page the model never sees the machinery, so it cannot offer a button
   * that would do nothing.
   */
  hasTruncatedSearch: boolean
  hasTagDistribution: boolean
  hasBasket: boolean
}

/**
 * The board a canvas chat sits beside: its name, and three id lists doing different jobs.
 *
 * - `name` — what the user called the board, already filtered of the client's
 *   auto-generated defaults (see `CanvasChatService.readableCanvasName`). Null means they
 *   never named it, which is a real state and not a missing lookup. The one piece of the
 *   board that is a statement of INTENT rather than a measurement, which is why it is
 *   worth more per token than anything else here: "Serie nocturna Lisboa" settles a
 *   thematic question that a tag histogram can only approximate.
 * - `photoIds` — everything currently PLACED. It never enters a prompt: it is subtracted
 *   from search candidates so the agent cannot propose a photo the user already has out,
 *   and it is the set every description of the board is computed over. Unbounded on
 *   purpose, since it costs one query and no tokens.
 * - `discardedIds` — photos dropped in the board's trash zone. Subtracted from search
 *   candidates alongside `photoIds` (re-proposing what the user just threw away is the
 *   worst repeat there is) but excluded from everything that describes the board: the
 *   `canvas` scope and `canvas_overview` both run on `photoIds` alone. The two lists are
 *   separate precisely because one question is "what must not come back" and the other is
 *   "what is this board", and the discards answer yes to the first and no to the second.
 * - `focusIds` — the user's focus: what the halo covers or what they picked by hand, in
 *   the board's reading order. These ARE described to Phase 1 and shown to Phase 2, so
 *   they are capped (CANVAS_VIEW_MAX_PHOTOS) and carry a real per-turn price.
 */
export interface CanvasChatContext {
  name: string | null
  photoIds: number[]
  discardedIds: number[]
  /** The ZONE the user is working in — under the halo, or picked by hand. Reading order. */
  focusIds: number[]
  /**
   * The photos the user spotlighted on the board — the SUBJECT of the turn, and the finest
   * of the nested levels. Reading order, like the focus.
   *
   * **Never arrives without a focus around it.** A turn hands the agent one of exactly two
   * shapes: a focus alone, or a focus with a spotlight inside it. Photos marked with nothing
   * else around them are a focus, because that is what they are — a set the user singled out
   * and gave no finer level within. The client owns that rule; nothing here restates it, and
   * the prompts are written against the two shapes rather than against three.
   *
   * A level of the board, NOT an attachment: `contextPhotoIds` carries photos brought into
   * the chat from outside the board (an @-mention, a card from the transcript), and the two
   * are described to the agent as the different things they are. It may overlap the focus
   * (a photo picked out of the zone) or sit outside it (one held up against the zone from
   * elsewhere on the board); both are ordinary, and the grid says which.
   */
  spotlightIds: number[]
  /**
   * Focus and spotlight as the user sees them arranged: rows top to bottom, cells left to
   * right, `null` where the board is empty.
   *
   * The reading order says which photo follows which; it cannot say that two sit side by
   * side while a third hangs alone below them, or that a gap separates two clusters — which
   * is what "does this fit here" and "what goes in the hole" actually turn on. Every id in
   * it is also in `focusIds` or `spotlightIds`, so the grid can only place a photo the turn
   * already describes, never introduce one.
   *
   * The client resolves the geometry and sends cells: no coordinate reaches the server.
   * Empty when the board sent none.
   */
  layout: Array<Array<number | null>>
  /**
   * The user flipped the panel's **Canvas only** switch on for this turn: every
   * `search_advanced` is confined to `photoIds` (the placed photos), overriding any scope
   * the model passes, and the board is NOT subtracted from its own results. A per-turn
   * choice, not a session mode — it arrives on each request like `curationMode` does.
   *
   * Only ever true with a non-empty `photoIds`: scoping to a board with nothing placed is a
   * cage around an empty pool, so `buildContext` treats that as off (see canvas_chat_service).
   */
  scopedToBoard: boolean
}

/**
 * Every photo the board puts in front of the agent this turn: the focus and the spotlight
 * inside it, deduplicated, focus first so the reading order survives.
 *
 * One helper rather than the union spelled out at each site, because the sites have to
 * agree. It decides whether the view is injected at all, which ids `get_photo_info` may
 * skip as already described, and whether the turn can bypass Phase 1 — three answers that
 * are only correct while they are the same answer.
 */
function canvasViewIds(canvas: CanvasChatContext | null): number[] {
  if (!canvas) return []
  return [...new Set([...canvas.focusIds, ...canvas.spotlightIds])]
}

type ChatSession = {
  userId: number
  modeId: string
  message: string
  history: ChatMessage[]
  modelName: ModelName
  provider: ModelProvider
  modelNamePhase2: ModelName
  providerPhase2: ModelProvider
  /** Phase 2 reasoning budget, from the selected intelligence mode. */
  thinkingLevelPhase2?: ThinkingLevel
  /** Phase 1 tool-calling rounds, from the selected intelligence mode. */
  maxIterationsPhase1: number
  /** Gates the Phase 2 curatorial lens (see CuratorialLensService). */
  needsArtisticEvaluation: boolean
  /**
   * True → the query targets ONLY the attached photo(s), so the prefetched
   * get_photo_info is all the data needed and Phase 1 is skipped entirely.
   */
  skipPhase1: boolean
  /**
   * True → this turn has no photographic work at all: every classifier intent is negative
   * (no photo intent, no artistic evaluation, not about the attached/present photos, not
   * another round). A greeting, a thank-you, "what can you do", an out-of-scope aside.
   *
   * The generalist chat handles this emergently — Phase 1 fetches only `app_knowledge`, so
   * Phase 2's "nothing to curate" exception fires on an empty context. A canvas never got
   * there: `prefetchCanvasView` injects the focus photos unconditionally, so the curator,
   * handed the board plus the previous turn's grouping, just re-emits it. This flag gates
   * the focus/attached prefetches off (see `chat`) so the canvas lands on the same
   * empty-context path. Phase 1 still runs — it may still want `app_knowledge`.
   */
  suspendCuration: boolean
  /**
   * The user's curation toggle for this turn, exactly as it arrived — NOT the effective
   * exclusion state, which also fires on "another round" and on a template that pins it
   * (see `excludeShown`). Phase 2 reads it for the shorter answer shape only: a template
   * states its own brevity in `phase2Addendum`, which lands last and overrides this, so
   * folding the template in here would only put a looser limit in front of a tighter one.
   */
  curationMode: boolean
  /** Stored UserProfile — lens fallback when photos carry no usable genre. */
  userProfile: string | null
  /**
   * The guided session this turn belongs to, or null for the generalist chat. Held on the
   * session because Phase 2 needs it too — its user-facing rules are the half of a template
   * that only the curator can carry out.
   */
  template: ChatTemplateDefinition | null
  /**
   * Collections this guided session is pinned to, when its template declares a scope.
   * Empty everywhere else. Held on the session because Phase 2 also has to know the
   * candidates came from a slice of the catalog rather than from all of it.
   */
  templateScopeCollectionIds: number[]
  /**
   * The canvas this chat is docked to, or null everywhere else. Held on the session
   * because Phase 2 needs the visible ids too — it shows their thumbnails, which is what
   * lets the curator talk about the board it is being asked about.
   */
  canvasContext: CanvasChatContext | null
  userContext: string
  messages: any[]
  /**
   * Every tool the server can execute, INCLUDING ones the model was never offered
   * (`fetch_basket`). Ask `boundToolNames` when the question is what the model could see.
   */
  toolMap: Record<string, any>
  /** The tools actually bound to the model, `done` included. */
  boundToolNames: string[]
  /** 'any' | 'required' | 'auto', per provider. Kept for the Phase 1 debug dump. */
  toolChoice: string
  modelWithTools: any
  foundPhotoIds: number[]
  toolsUsed: string[]
  intermediateSteps: IntermediateStep[]
  /** Spend of the pre-flight classifier call. Zero-valued on cache hit or failure. */
  classifierUsage: TokenUsageEntry
  iterationUsages: TokenUsageEntry[]
  totalIter: number
}

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

// Phase 1 tool-calling rounds when the intelligence mode does not override it. This is
// the value every mode ran on before `maxIterationsPhase1` existed, so leaving the field
// unset on a mode is exactly today's behaviour.
const PHASE1_MAX_ITERATIONS_DEFAULT = 4

/**
 * Vision fidelity for the thumbnails handed to an OpenAI/xAI curator. Gemini has no
 * equivalent knob on this path — it gets the raw base64 — so this only governs those
 * two providers.
 *
 * 'low' downsamples to 512x512 for a flat 85 tokens, and our thumbnails are stored at
 * 800px on the long side: that setting was throwing away information we already had,
 * and handing the model bought for its eye LESS to look at than the one it replaced.
 * 'high' tiles the image instead (~425 tokens for a thumbnail this size). The extra
 * ~7k tokens across a full 20-thumbnail turn is around 3 cents on Sol — far below what
 * one wrong verdict costs. It is also not obviously a loss even on paper: 'low' has
 * been measured to INCREASE reasoning tokens (1.6x on gpt-5.5) because the model
 * spends them straining to see.
 */
const PHASE2_IMAGE_DETAIL = 'high'

const PHASE2_MAX_PHOTOS = 80 // total photos sent to the model (with or without thumbnail)
const PHASE2_MAX_THUMBNAILS = 20 // how many of those can carry a thumbnail image
// ↳ mirrored by SEARCH_PAGE_SIZE in agent_tools_service.ts, so one page of search
//   results is exactly what the curator can look at. Change both together.
// → the remaining (PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS = 60) are text-only

/** Tools whose Phase 2 photo results are eligible for thumbnail images. */
const IMAGE_ELIGIBLE_TOOLS = new Set(['search_advanced', 'get_photo_info'])

/** How many of a turn's `search_advanced` calls are carried into the next turn's context. */
const MAX_REPLAYED_SEARCH_CALLS = 3

/**
 * An already-injected `[[photo:ID|filename]]` token. Every pass of injectPhotoTokens
 * alternates on this FIRST so a token is consumed whole and its innards — the numeric
 * ID, and the filename, both of which the passes below would otherwise match — can
 * never be rewritten into a second token nested inside the first.
 */
const PHOTO_TOKEN_SOURCE = String.raw`\[\[photo:\d+\|[^\]]*\]\]`

/** Score keys as prose: `a`, `b` and `c`. */
function formatCriteriaList(criteria: string[]): string {
  if (criteria.length <= 1) return criteria.join('')
  return `${criteria.slice(0, -1).join(', ')} and ${criteria[criteria.length - 1]}`
}

// ══════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════

export default class LangchainAgentService {
  private photoManager: PhotoManager
  private searchService: SearchTextService
  private toolsService: AgentToolsService
  private queryService: QueryService

  constructor() {
    this.photoManager = new PhotoManager()
    this.searchService = new SearchTextService()
    this.toolsService = new AgentToolsService(this.photoManager, this.searchService)
    this.queryService = new QueryService()
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * @param forceCheapModel  When true, Phase 2 always uses the cheap model
   *                         regardless of classification (e.g. user ran out of credits).
   * @param basketPhotoIds   The conversation's selection basket, in pin order. Empty means
   *                         the whole feature stays dark: no tool, no prompt line, no cost.
   * @param template         Guided session this turn belongs to, already resolved by the
   *                         controller. Null is the generalist chat, which is unaffected by
   *                         every branch this parameter opens.
   * @param templateScopeCollectionIds Collections the session is pinned to, already
   *                         sanitised by the controller. Meaningful only alongside a
   *                         template that declares a scope; empty is the whole catalog.
   * @param curationMode     The user turned on progressive exploration (or is actively
   *                         curating): every turn excludes already-shown photos, not only
   *                         the ones the classifier reads as "another round".
   * @param canvasContext    The board this chat is docked to, already sanitised by the
   *                         controller. Null is every other chat, and nothing this
   *                         parameter opens runs then.
   */
  public async chat(
    userId: number,
    conversationId: number,
    message: string,
    contextPhotoIds: number[] = [],
    selectedMode: ChatIntelligenceMode,
    forceCheapModel = false,
    basketPhotoIds: number[] = [],
    template: ChatTemplateDefinition | null = null,
    templateScopeCollectionIds: number[] = [],
    curationMode = false,
    canvasContext: CanvasChatContext | null = null
  ): Promise<AgentChatResult> {
    // A session whose template switched the basket off behaves as if nothing were ever
    // pinned. One place rather than five, because every use downstream — the injected tool
    // result, the Phase 1 fragment, the user-context line, the Phase 2 block — is already
    // gated on this array being non-empty. The stored basket itself is untouched.
    const injectedBasketPhotoIds = template?.injectedContext?.basket === false ? [] : basketPhotoIds
    if (injectedBasketPhotoIds.length === 0 && basketPhotoIds.length > 0) {
      agentLine('basket', `${basketPhotoIds.length} pinned, suppressed by ${template?.id}`)
    }

    const session = await this.initChatSession(
      userId,
      conversationId,
      message,
      contextPhotoIds,
      selectedMode,
      forceCheapModel,
      injectedBasketPhotoIds,
      template,
      templateScopeCollectionIds,
      curationMode,
      canvasContext
    )
    agentSection('🔍', 'PHASE 1 · data collection')
    // Before anything else: the selection and the board are context for planning, not
    // something to go and look up mid-plan.
    // On a no-work turn (greeting / thanks / out-of-scope — see `suspendCuration`) the
    // selection basket, the board's focus and any attached photo are all deliberately kept
    // out of context, so Phase 2 lands on the same empty-context "nothing to curate" path
    // as the generalist chat instead of re-curating what the user is only looking at. Phase
    // 1 still runs below — it may still want `app_knowledge`. Not canvas-specific: the flag
    // is derived from the generic classifier intents and gates the generic prefetches.
    if (!session.suspendCuration) {
      await this.prefetchBasket(session, injectedBasketPhotoIds)
      await this.prefetchCanvasView(session)
      await this.prefetchAttachedPhotos(session, contextPhotoIds)
    }
    if (session.skipPhase1) {
      agentLine('skipped', 'query targets only the attached photo(s) — prefetch is enough')
    } else {
      await this.runPhase1Loop(session)
    }

    const structured = await this.runPhase2(session, contextPhotoIds)

    return this.finalizeResult(session, structured, contextPhotoIds)
  }

  // ── Session init ─────────────────────────────────────────────

  private async initChatSession(
    userId: number,
    conversationId: number,
    message: string,
    contextPhotoIds: number[],
    selectedMode: ChatIntelligenceMode,
    forceCheapModel: boolean,
    basketPhotoIds: number[],
    template: ChatTemplateDefinition | null,
    templateScopeCollectionIds: number[],
    curationMode: boolean,
    canvasContext: CanvasChatContext | null
  ): Promise<ChatSession> {
    const convService = new ConversationService()
    // Sequential on purpose: the classifier condenses elliptical follow-ups
    // ("ahora con esta") against the recent turns, so it needs the history first.
    const history = await convService.getLLMContext(conversationId)
    // A template may bring its own classifier prompt (same output contract). The prompt names
    // the runtime keys it reads in `classifierContextKeys`; this registry owns where each
    // resolves from — the declare-here / wire-there split of `EXTRA_SCOPE_SOURCES` below, so a
    // template with a classifier but no focus is never handed a phantom key.
    const CLASSIFIER_CONTEXT_SOURCES: Record<string, unknown> = {
      focus_photo_count: canvasContext?.focusIds.length ?? 0,
      spotlight_photo_count: canvasContext?.spotlightIds.length ?? 0,
    }
    const classification = await this.queryService.classifyQuery(
      message,
      contextPhotoIds.length,
      LangchainAgentService.buildClassifierTurns(history),
      template?.classifierPrompt
        ? {
            prompt: template.classifierPrompt,
            context: Object.fromEntries(
              (template.classifierContextKeys ?? []).map((k) => [k, CLASSIFIER_CONTEXT_SOURCES[k]])
            ),
          }
        : undefined
    )
    const classifierUsage = LangchainAgentService.usageEntryFromQueryCall(
      'classifier',
      classification.usage
    )
    const {
      has_photo_intent,
      needs_artistic_evaluation,
      attached_photos_only,
      wants_more_results,
    } = classification
    // "Another round" ("otra ronda", "more", "sigue buscando"): server-side pagination by
    // exclusion. Every photo already shown in this conversation is dropped from
    // search_advanced's candidates before sampling, so re-running the same search yields
    // the next-best NEW page. Phase 1 never knows pagination exists — the classifier flags
    // the intent, the server enforces it. get_photo_info and attached photos are untouched,
    // so re-references ("compare with the ones before") keep working even on a false positive.
    //
    // Beyond that explicit intent, active curation makes the same exclusion the DEFAULT:
    // someone who turned on curation mode, or who is in a session that pins it, almost never
    // wants to re-see a candidate they passed on. A non-empty basket is deliberately NOT a
    // trigger here — keeping a photo ("save this") is a different intent from paginating
    // ("don't repeat"), and letting it force exclusion would silently override an explicit
    // curation-mode OFF. The basket only nudges the user toward the toggle, in the client.
    const excludeShown = wants_more_results || curationMode || template?.curationMode === true
    const alreadyShownIds = excludeShown
      ? [...new Set(history.flatMap((m) => m.photoGroups?.flatMap((g) => g.photoIds) ?? []))]
      : []
    // Backs `scopes: [{type:"conversation_photos"}]`, and read unconditionally rather than
    // off `history`: the model can only see a 5-turn window, so "of all the photos in this
    // conversation" is a question it cannot answer from context once the window has slid.
    // Wider than `alreadyShownIds` on both axes on purpose — the whole conversation, not
    // the window, and attachments as well as shown photos. One indexed read per turn.
    const conversationPhotoIds = await convService.getConversationPhotoIds(conversationId)
    // Short-circuit: everything the query needs is already prefetched and Phase 1 has nothing
    // to add. In the generalist chat that means the query is exclusively about the attached
    // photo(s) (prefetchAttachedPhotos ran get_photo_info on them, Phase 2 builds their
    // thumbnails from contextPhotoIds). On a canvas the same flag means "answerable from what
    // is present" = attached OR the board's view — the focus and the spotlight, which
    // `fetch_canvas_view` already prefetched — so the guard widens to accept either with no
    // attachment: a judgment about the group, or about the photo they singled out, needs no
    // Phase 1 either. The guard is the presence half of the safety rule: even a hallucinated
    // `true` cannot skip when nothing is present.
    const skipPhase1 =
      attached_photos_only &&
      (contextPhotoIds.length > 0 || canvasViewIds(canvasContext).length > 0)
    // No photographic work this turn — see ChatSession.suspendCuration. All four classifier
    // intents negative = a greeting / thanks / "what can you do" / out-of-scope aside.
    const suspendCuration =
      !has_photo_intent &&
      !needs_artistic_evaluation &&
      !attached_photos_only &&
      !wants_more_results
    const modelName = selectedMode.modelPhase1 as ModelName
    let modelNamePhase2: ModelName
    if (forceCheapModel) {
      modelNamePhase2 = selectedMode.modelPhase2Lite as ModelName
    } else if (!has_photo_intent) {
      modelNamePhase2 = selectedMode.modelPhase2Lite as ModelName
    } else if (needs_artistic_evaluation) {
      modelNamePhase2 = (template?.modelOverrides?.phase2Expensive ??
        selectedMode.modelPhase2Expensive) as ModelName
    } else {
      modelNamePhase2 = selectedMode.modelPhase2Cheap as ModelName
    }
    const foundPhotoIds: number[] = []
    const provider: ModelProvider = LangchainAgentService.getProviderFromModel(modelName)
    const providerPhase2: ModelProvider =
      LangchainAgentService.getProviderFromModel(modelNamePhase2)

    // ── Run header: everything decided before the first model call ──
    agentSection('🚀', `CHAT · user ${userId} · mode ${selectedMode.id}`)
    agentLine('query', quoted(message, 100))
    if (classification.self_contained_query !== message) {
      agentLine('condensed', quoted(classification.self_contained_query, 100))
    }
    const yn = (v: boolean) => (v ? '✅' : '❌')
    // On a canvas the same flag means "answerable from what's present (attached ∪ focus)",
    // so label it accordingly — the dumps are how these sessions get diagnosed.
    const skipFlagLabel = 'attached-only'
    agentLine(
      'class',
      `photo ${yn(has_photo_intent)}  artistic ${yn(needs_artistic_evaluation)}  ` +
        `${skipFlagLabel} ${yn(attached_photos_only)}  more ${yn(wants_more_results)}` +
        (excludeShown ? ` (excluding ${alreadyShownIds.length} already shown)` : '')
    )
    agentLine(
      'models',
      `phase1 ${modelName} (${provider}) · phase2 ${modelNamePhase2} (${providerPhase2})` +
        (forceCheapModel ? ' [forced lite]' : '')
    )

    if (canvasContext) {
      agentLine(
        'canvas',
        (canvasContext.name ? `"${canvasContext.name}" · ` : '') +
          `${canvasContext.photoIds.length} placed ` +
          `(${canvasContext.scopedToBoard ? 'CONFINED to — "Canvas only" on' : 'excluded unless scoped to'}) · ` +
          `${canvasContext.discardedIds.length} discarded (excluded, never described) · ` +
          `${canvasContext.focusIds.length} in focus · ` +
          `${canvasContext.spotlightIds.length} spotlighted`
      )
    }

    const userProfile = (await User.find(userId))?.profiles ?? null
    // The pinned collections go in here, not into the prompt: `search_advanced` applies them
    // itself, so a turn where Phase 1 forgot the session's scope is not a possible state.
    const scopeCollectionIds = template?.scope ? templateScopeCollectionIds : []
    // The board's photos go in here for the same reason the pinned collections do:
    // `search_advanced` subtracts them itself, so a turn where Phase 1 forgot the canvas
    // and re-proposed photos already on it is not a possible state.
    // Symbolic scopes the session's template declared, paired with the ids each resolves
    // to. The template owns the declaration — the enum value, the prose, what to say when
    // it is empty — and this is the one place that knows where the ids actually live. A
    // declared type with nothing behind it is dropped inside `createTools`, so the model is
    // never offered a scope that cannot resolve.
    const EXTRA_SCOPE_SOURCES: Record<string, number[]> = {
      canvas: canvasContext?.photoIds ?? [],
    }
    const extraScopes = (template?.toolOverrides?.search_advanced?.extraScopes ?? []).map(
      (scope) => ({ ...scope, photoIds: EXTRA_SCOPE_SOURCES[scope.type] ?? [] })
    )

    // The user's "Canvas only" switch, resolved to the pool it pins. Non-empty ⇒ every
    // search is caged to the placed photos (see `createTools`); empty ⇒ the switch is off,
    // or there is nothing on the board to cage to (which `buildContext` already treats as
    // off). The placed set alone — never the discards — is what the board IS.
    const confineToCanvasPhotoIds = canvasContext?.scopedToBoard ? canvasContext.photoIds : []

    const tools = this.toolsService.createTools(
      userId,
      userProfile,
      foundPhotoIds,
      provider,
      alreadyShownIds,
      scopeCollectionIds,
      conversationPhotoIds,
      // The exclusion runs on the UNION: a discarded photo is not on the board any more,
      // but proposing back the one the user just threw in the trash is the worst repeat
      // this chat has. Everything that DESCRIBES the board uses `photoIds` alone — see
      // `EXTRA_SCOPE_SOURCES` above and `SESSION_TOOL_FACTORIES` below.
      canvasContext ? [...canvasContext.photoIds, ...canvasContext.discardedIds] : [],
      extraScopes,
      confineToCanvasPhotoIds
    )
    const doneTool = this.createDoneTool()
    // A template narrows what the model can even see. Filtering the built list is safe:
    // `createTools` returns plain closures with no cross-tool wiring — the only shared
    // state is `foundPhotoIds`, which `search_advanced` writes and no template drops.
    //
    // "Canvas only" drops `catalog_sample` on top: it is the one bound tool that pulls
    // material the confine cannot reach — a random handful of the CATALOG — so under a
    // switch that promises "only the board" it could only ever break the promise. Every
    // other tool either respects the confine (`search_advanced`), is board-only already
    // (`canvas_overview`), or returns no photos into the reply (`get_photo_info`, the
    // `fetch_*` library lookups). Dropped here, per turn, rather than in the template's
    // static allowlist, because the switch is per turn.
    const scopedTools = (
      template ? tools.filter((t) => template.allowedTools.includes(t.name)) : tools
    ).filter((t) => confineToCanvasPhotoIds.length === 0 || t.name !== 'catalog_sample')

    // Tools that exist ONLY in this kind of session, declared by the template's
    // `extraTools`. The mirror of `EXTRA_SCOPE_SOURCES` one level up: the template names
    // the capability, this knows where its runtime data lives. A factory returning null —
    // no board this turn — drops the tool instead of binding one that can only fail, which
    // is the same rule `resolvableExtraScopes` applies inside `createTools`.
    //
    // They are appended AFTER the allowlist filter on purpose: `allowedTools` subtracts
    // from the universal set and these were never in it, so passing them through it would
    // require listing them in two places to mean one thing.
    const SESSION_TOOL_FACTORIES: Record<string, () => any> = {
      canvas_overview: () =>
        canvasContext
          ? this.toolsService.createCanvasOverviewTool(
              userId,
              canvasContext.photoIds,
              canvasContext.name
            )
          : null,
    }
    const extraTools = (template?.extraTools ?? [])
      .map((name) => SESSION_TOOL_FACTORIES[name]?.() ?? null)
      .filter((t) => t !== null)

    const allTools = [...scopedTools, ...extraTools, doneTool]
    if (template) {
      agentLine(
        'template',
        `${template.id} · tools ${[...scopedTools, ...extraTools].map((t) => t.name).join(', ')}` +
          (scopeCollectionIds.length > 0
            ? ` · pinned to collections ${scopeCollectionIds.join(', ')}`
            : '') +
          (extraScopes.length > 0
            ? ` · scopes ${extraScopes
                .map((scope) => `${scope.type}(${scope.photoIds.length})`)
                .join(', ')}`
            : '')
      )
    }
    // 'any' = Gemini, 'required' = OpenAI/xAI (forces tool call, prevents phantom text), 'auto' = DeepSeek/Qwen
    const toolChoice =
      provider === 'deepseek' || provider === 'qwen'
        ? 'auto'
        : provider === 'xai'
          ? 'required'
          : 'any'
    // Phase 1 only emits tool calls — cap output tokens to avoid paying for phantom text.
    // Disable thinking for Phase 1: thinking models (e.g. gemini-3-flash) consume
    // maxOutputTokens for both thinking AND tool-call JSON. Gemini 3 cannot zero its
    // thinking (MINIMAL is a floor, not off — see createChatModel), and the tool-call JSON
    // itself grows with the session (the model may echo long photo-id lists into
    // exclude_scopes/scopes), so the two compete for this cap. At 500 that competition was
    // observed starving the JSON entirely: empty tool_calls despite tool_choice:'any',
    // which the loop then misreads as a premature "done". The cap is a ceiling, not a
    // spend — normal turns still stop at the size of their tool call.
    const PHASE1_MAX_OUTPUT_TOKENS = 2000
    const modelWithTools = LangchainAgentService.createChatModel(
      modelName,
      PHASE1_MAX_OUTPUT_TOKENS,
      'low',
      true // disableThinking — Phase 1 is tool-only, no reasoning needed
    ).bindTools(allTools, { tool_choice: toolChoice })
    // The basket tool is reachable for execution but never offered to the model: it is
    // absent from `allTools` above, so it is not bound and cannot be called. Only
    // prefetchBasket invokes it, which is why it still has to be in the map.
    const basketTool =
      basketPhotoIds.length > 0 ? this.toolsService.createBasketTool(userId, basketPhotoIds) : null
    // Same contract as the basket tool: executable, never bound. Only prefetchCanvasView
    // invokes it, which is why it has to be in the map without being in `allTools`.
    const canvasViewTool =
      canvasContext && canvasViewIds(canvasContext).length > 0
        ? this.toolsService.createCanvasViewTool(
            userId,
            canvasContext.focusIds,
            canvasContext.spotlightIds,
            canvasContext.layout,
            canvasContext.photoIds.length
          )
        : null
    const toolMap = Object.fromEntries(
      [
        ...allTools,
        ...(basketTool ? [basketTool] : []),
        ...(canvasViewTool ? [canvasViewTool] : []),
      ].map((t) => [t.name, t])
    )
    const boundToolNames = allTools.map((t) => t.name)

    const userContext = await this.buildUserContext(userId, basketPhotoIds)
    const currentUserMessage = this.buildCurrentUserMessage(
      message,
      contextPhotoIds,
      canvasContext?.spotlightIds ?? []
    )
    const messages = this.buildMessageList(
      history,
      currentUserMessage,
      userContext,
      // `hasBasket` / `hasCanvasView` describe a prefetch result. On a `suspendCuration`
      // turn those prefetches are skipped (see `chat`), so their prompt fragments have
      // to go too — the fragment and the tool result are either both there or neither is.
      basketPhotoIds.length > 0 && !suspendCuration,
      template,
      scopeCollectionIds.length > 0,
      excludeShown && alreadyShownIds.length > 0,
      (canvasContext?.focusIds.length ?? 0) > 0 && !suspendCuration,
      canvasContext?.name ?? null,
      confineToCanvasPhotoIds.length > 0
    )

    _debug.calls = []

    return {
      userId,
      modeId: selectedMode.id,
      message,
      history,
      modelName,
      provider,
      modelNamePhase2,
      providerPhase2,
      template,
      templateScopeCollectionIds: scopeCollectionIds,
      canvasContext,
      thinkingLevelPhase2: selectedMode.thinkingLevelPhase2,
      maxIterationsPhase1: selectedMode.maxIterationsPhase1 ?? PHASE1_MAX_ITERATIONS_DEFAULT,
      needsArtisticEvaluation: needs_artistic_evaluation,
      skipPhase1,
      suspendCuration,
      curationMode,
      userProfile,
      userContext,
      messages,
      toolMap,
      boundToolNames,
      toolChoice,
      modelWithTools,
      foundPhotoIds,
      toolsUsed: [],
      intermediateSteps: [],
      classifierUsage,
      iterationUsages: [],
      totalIter: 0,
    }
  }

  private createDoneTool() {
    return tool(async () => 'ok', {
      name: 'done',
      description:
        'Signal that data collection is complete. Call this (alone) when you have gathered all the information needed to answer the user. Do NOT call any other tool in the same step as done.',
      schema: z.object({}),
    })
  }

  /**
   * Puts the selection basket in front of Phase 1 before it plans anything, as a tool
   * result the model never asked for — the same trick `prefetchAttachedPhotos` uses.
   *
   * `fetch_basket` is in the session's toolMap but not in the bound tool list, so this is
   * the only way it ever runs. Costs no extra iteration: the server executes the call and
   * pushes the pair of messages, there is no model round-trip.
   */
  private async prefetchBasket(session: ChatSession, basketPhotoIds: number[]): Promise<void> {
    if (basketPhotoIds.length === 0) return
    const prefetchCallId = `prefetch-fetch_basket-${Date.now()}`
    const prefetchToolCall = {
      name: 'fetch_basket',
      args: {},
      id: prefetchCallId,
    }
    // The count injected is not restated here: the tool result logged right below
    // reports it as `returned`, and duplicating the slice in a log string is how a log
    // starts lying after someone edits the slice.
    agentLine('basket', `${basketPhotoIds.length} photo(s) pinned → injecting most recent`)
    const prefetchToolMsgs = await this.executeToolCalls(
      [prefetchToolCall],
      session.toolMap,
      session.toolsUsed,
      session.intermediateSteps
    )
    session.messages.push(
      new AIMessage({ content: '', tool_calls: [prefetchToolCall] }),
      ...prefetchToolMsgs
    )
  }

  /**
   * Puts what the user is looking at on the board — the focus, the spotlight and how they
   * are arranged — in front of Phase 1, exactly as `prefetchBasket` does with the selection.
   *
   * It has to be a prefetch rather than a tool the model can call: "what's missing here"
   * cannot be planned at all until the model knows what "here" contains, so leaving it to
   * a call would spend an iteration establishing something the server already knows — and
   * on a turn where the model didn't bother, it would answer about a board it never saw.
   * The same argument is why the grid rides inside this result instead of being a tool of
   * its own: Phase 2 calls no tools, so a spatial question would reach the phase that
   * answers it only when Phase 1 had guessed to ask.
   */
  private async prefetchCanvasView(session: ChatSession): Promise<void> {
    const canvas = session.canvasContext
    if (canvasViewIds(canvas).length === 0) return

    const prefetchCallId = `prefetch-fetch_canvas_view-${Date.now()}`
    const prefetchToolCall = {
      name: 'fetch_canvas_view',
      args: {},
      id: prefetchCallId,
    }
    agentLine(
      'canvas',
      `${canvas!.focusIds.length} in focus · ${canvas!.spotlightIds.length} spotlighted · ` +
        `${canvas!.layout.length} layout row(s) → injecting (board holds ${canvas!.photoIds.length})`
    )
    const prefetchToolMsgs = await this.executeToolCalls(
      [prefetchToolCall],
      session.toolMap,
      session.toolsUsed,
      session.intermediateSteps
    )
    session.messages.push(
      new AIMessage({ content: '', tool_calls: [prefetchToolCall] }),
      ...prefetchToolMsgs
    )
  }

  private async prefetchAttachedPhotos(
    session: ChatSession,
    contextPhotoIds: number[]
  ): Promise<void> {
    if (contextPhotoIds.length === 0) return
    // On a canvas turn the view has already described the focus and the spotlight, in the
    // same shape this call returns. An attached photo that is also one of those would
    // otherwise reach Phase 1 twice, as two unrelated sets.
    const alreadyDescribed = new Set(canvasViewIds(session.canvasContext))
    const photoIds = contextPhotoIds.filter((id) => !alreadyDescribed.has(id))
    if (photoIds.length === 0) {
      agentLine(
        'attached',
        `${contextPhotoIds.length} photo(s), all in the canvas view — already described`
      )
      return
    }
    const prefetchCallId = `prefetch-get_photo_info-${Date.now()}`
    const prefetchToolCall = {
      name: 'get_photo_info',
      args: { photoIds },
      id: prefetchCallId,
    }
    agentLine(
      'attached',
      `${photoIds.length} photo(s) → prefetching descriptions (text only)` +
        (photoIds.length < contextPhotoIds.length
          ? ` · ${contextPhotoIds.length - photoIds.length} in the canvas view, already described`
          : '')
    )
    const prefetchToolMsgs = await this.executeToolCalls(
      [prefetchToolCall],
      session.toolMap,
      session.toolsUsed,
      session.intermediateSteps
    )
    session.messages.push(
      new AIMessage({ content: '', tool_calls: [prefetchToolCall] }),
      ...prefetchToolMsgs
    )
  }

  // ── Message building ─────────────────────────────────────────

  /**
   * Compact "role: text" lines for the classifier's ellipsis resolution.
   * Only the last few turns matter — a follow-up like "ahora con esta" refers
   * to the immediately preceding request, not deep history. Assistant turns
   * carry a photo count so the classifier knows photos were shown (comparing
   * against them means the request is NOT attached-only).
   */
  private static buildClassifierTurns(history: ChatMessage[], maxTurns = 4): string[] {
    const turns: string[] = []
    for (const m of history.slice(-maxTurns)) {
      if (typeof m.content !== 'string' || m.content.trim().length === 0) continue
      let text = m.content.slice(0, 300)
      if (m.role === 'assistant') {
        const shownCount = m.photoGroups?.reduce((sum, g) => sum + g.photoIds.length, 0) ?? 0
        if (shownCount > 0) text += ` [showed ${shownCount} photos]`
      }
      turns.push(`${m.role}: ${text}`)
    }
    return turns
  }

  /**
   * Strips `[[collection:ID|Name]]` / `[[series:ID|Name]]` / `[[portfolio:ID|Name]]`
   * tokens (inserted by the frontend's @-mention autocomplete) out of the message text,
   * replacing each with its plain name so the sentence reads naturally, while collecting
   * the referenced IDs per type for exact-match grounding.
   */
  private stripMentionTokens(message: string): {
    text: string
    refs: Record<'collection' | 'series' | 'portfolio', number[]>
  } {
    const refs: Record<'collection' | 'series' | 'portfolio', number[]> = {
      collection: [],
      series: [],
      portfolio: [],
    }
    const seen = new Set<string>()
    const text = message.replace(
      /\[\[(collection|series|portfolio):(\d+)\|([^\]]+)\]\]/g,
      (_match, type: 'collection' | 'series' | 'portfolio', id: string, name: string) => {
        const key = `${type}:${id}`
        if (!seen.has(key)) {
          seen.add(key)
          refs[type].push(Number(id))
        }
        return name
      }
    )
    return { text, refs }
  }

  private buildCurrentUserMessage(
    message: string,
    contextPhotoIds: number[],
    // Canvas only: named separately from the attachments because they are a different
    // thing — photos already on the board that the user pointed at, versus photos brought
    // into the chat from outside it. One line each, so the model reads the roles rather
    // than deducing them from which ids happen to overlap.
    spotlightPhotoIds: number[] = []
  ): HumanMessage {
    const { text, refs } = this.stripMentionTokens(message)
    const prefixParts: string[] = []
    if (contextPhotoIds.length > 0) {
      prefixParts.push(`[Attached photo IDs: ${contextPhotoIds.join(', ')}]`)
    }
    if (spotlightPhotoIds.length > 0) {
      prefixParts.push(`[Spotlighted on the board: ${spotlightPhotoIds.join(', ')}]`)
    }
    if (refs.collection.length > 0) {
      prefixParts.push(`[Referenced collection IDs: ${refs.collection.join(', ')}]`)
    }
    if (refs.series.length > 0) {
      prefixParts.push(`[Referenced series IDs: ${refs.series.join(', ')}]`)
    }
    if (refs.portfolio.length > 0) {
      prefixParts.push(`[Referenced portfolio IDs: ${refs.portfolio.join(', ')}]`)
    }
    if (prefixParts.length === 0) return new HumanMessage(text)
    return new HumanMessage(prefixParts.join(' ') + '\n' + text)
  }

  private async buildUserContext(userId: number, basketPhotoIds: number[] = []): Promise<string> {
    const [user, photoCount, analyzedCount] = await Promise.all([
      User.find(userId),
      Photo.query()
        .where('user_id', userId)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0)),
      Photo.query()
        .where('user_id', userId)
        .whereNotNull('descriptions')
        .whereRaw(`descriptions->>'artistic_scores' IS NOT NULL`)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0)),
    ])
    if (!user) return ''

    const lines: string[] = ['## Current user context']
    lines.push(`- Current date: ${new Date().toISOString().slice(0, 10)}`)
    lines.push(`- Name: ${user.name}`)
    if (user.preferredSource) lines.push(`- Preferred upload source: ${user.preferredSource}`)
    if (user.profiles) {
      // The profile alone is inert: it names a tradition without saying what the tradition
      // ranks by. Ordering an unqualified "my best photos" is handled by the `global_rating`
      // field in the search tool; these are the criteria that weigh most inside it, stated
      // here because they also inform score filters and the curator's reading.
      const qualityCriteria = getProfileQualityCriteria(user.profiles)
      const criteriaClause =
        qualityCriteria.length > 0
          ? ` — this tradition reads quality mainly through ${formatCriteriaList(qualityCriteria)}.`
          : ''
      lines.push(`- Photography profile: ${user.profiles}${criteriaClause}`)
    }
    lines.push(
      `- Catalog size: ${photoCount} photo${photoCount !== 1 ? 's' : ''} (${analyzedCount} analyzed)`
    )

    // Read by BOTH phases, so it states the fact and nothing else. What to do with the
    // selection differs per phase and lives in each role addendum: PHASE1_BASKET_ADDENDUM
    // (its ids are search input) and the `ev.hasBasket` block in Phase 2 (judge candidates
    // against it). A single shared instruction would be wrong for one of them.
    if (basketPhotoIds.length > 0) {
      lines.push(
        `- Selection: this user is curating, and has set aside ${basketPhotoIds.length} photo(s) ` +
          `in this conversation, pinned oldest to newest. The most recent ones are already in ` +
          `front of you.`
      )
    }

    // Note: the 0-photos and 0-analyzed branches are handled upstream by ChatController
    // (routed to LangchainAgentKnowledgeService). This service is only reached when
    // analyzedCount > 0, so only the "early catalog" note is relevant here.
    const hasPatterns = user.catalogPatterns && Object.keys(user.catalogPatterns).length > 0
    if (analyzedCount < 100 || !hasPatterns) {
      lines.push(
        `- Note: this user is relatively new to the app and their catalog is still in its early stages. Be cautious with broad generalisations about their photography or overall style and mention the need for more photos in order to elaborate a better analysis.`
      )
    }

    return lines.join('\n')
  }

  private buildMessageList(
    history: ChatMessage[],
    currentUserMessage: HumanMessage,
    userContext: string = '',
    hasBasket = false,
    template: ChatTemplateDefinition | null = null,
    hasTemplateScope = false,
    hasAutoExclusion = false,
    hasCanvasView = false,
    canvasName: string | null = null,
    isScopedToCanvas = false
  ): any[] {
    // Gated here rather than inside the prompt: whether the assistant has ever spoken in this
    // conversation is a fact the server holds, and not one the model should be asked to judge.
    //
    // The test is "no assistant turn", NOT `history.length === 0`: ChatController persists the
    // incoming user message BEFORE invoking the agent, so getLLMContext always returns at least
    // that message and the length is never 0. Assistant turns are also the right thing to ask
    // about anyway — the case is a user referring to something the assistant supposedly did.
    const isFirstTurn = !history.some((m) => m.role === 'assistant')
    const phase1Prompt =
      SYSTEM_PROMPT_BASE +
      // A template either replaces the general addendum or adds to it — see the two
      // fields on ChatTemplateDefinition. Never both: a template that set both would be
      // appending canvas-shaped context to a prompt written for a different job.
      (template?.phase1RoleAddendum ?? PHASE1_ROLE_ADDENDUM + (template?.phase1RoleExtra ?? '')) +
      // Pattern J routes to `app_knowledge`, so it only makes sense where that tool is
      // actually bound. A template that REPLACES the role addendum is also excluded on
      // its own terms: its first turn is the brief the client generated, never a user
      // remembering a conversation that isn't here. One that merely adds to it — a canvas
      // chat — is an open conversation like any other, and gets the pattern.
      (isFirstTurn &&
      !template?.phase1RoleAddendum &&
      (!template || template.allowedTools.includes('app_knowledge'))
        ? PHASE1_FIRST_TURN_ADDENDUM
        : '') +
      // Only on turns that actually carry a scope: on the others the fragment would
      // describe a restriction that isn't there and invite the model to invent one.
      (hasTemplateScope ? (template?.scope?.phase1Addendum ?? '') : '') +
      // Same gate as prefetchBasket: the fragment and the tool result it describes are
      // either both there or neither is. Template-safe — everything it names is a
      // `search_advanced` parameter, and no template drops that tool.
      (hasBasket ? PHASE1_BASKET_ADDENDUM : '') +
      // Only on turns where the server-side exclusion is actually running AND has photos
      // to drop. On any other turn the fragment would describe a mechanism that isn't
      // there — telling the model an exclusion is handled when nothing handles it.
      (hasAutoExclusion ? PHASE1_PAGINATION_ADDENDUM : '') +
      // Same gate as prefetchCanvasView. The canvas template's own `phase1RoleExtra`
      // describes the board on every canvas turn; this describes the tool result, and only
      // on the turns where the radius actually produced one.
      (hasCanvasView ? PHASE1_CANVAS_VIEW_ADDENDUM : '') +
      // Gated on the name alone, not on the radius: it holds for the whole session, and on
      // a board whose radius is empty it can be all the agent knows about what it is for.
      formatCanvasNameFragment(canvasName, 'phase1') +
      // Last, so it is the final thing read: it overrides the "whole catalog is the default"
      // reasoning in the canvas role addendum for the turns the user pinned the board. Only
      // on those turns — otherwise it would describe a cage that is not there.
      (isScopedToCanvas ? PHASE1_CANVAS_SCOPE_ADDENDUM : '')
    const systemContent = userContext ? `${phase1Prompt}\n\n${userContext}` : phase1Prompt
    const messages: any[] = [new SystemMessage(systemContent)]

    for (const m of history) {
      if (typeof m.content !== 'string' || m.content.trim().length === 0) continue

      if (m.role === 'user') {
        const photoSuffix =
          m.photoIds && m.photoIds.length > 0 ? `\n[Photo IDs: ${m.photoIds.join(', ')}]` : ''
        messages.push(new HumanMessage(m.content + photoSuffix))
      } else {
        // Assistant messages: append photo IDs + per-photo descriptions so the LLM
        // can match user references like "la de la niña" to the correct photo.
        const shownIds = m.photoGroups?.flatMap((g) => g.photoIds) ?? []
        const photoNote =
          shownIds.length > 0 ? `\n[INTERNAL_CONTEXT: shown_photo_ids=${shownIds.join(',')}]` : ''

        let descNote = ''
        if (m.photoGroups && m.photoGroups.length > 0) {
          const descLines: string[] = []
          for (const group of m.photoGroups) {
            if (group.photoDescriptions && Object.keys(group.photoDescriptions).length > 0) {
              descLines.push(`Group "${group.label}":`)
              for (const [id, desc] of Object.entries(group.photoDescriptions)) {
                descLines.push(`  - ID ${id}: ${desc}`)
              }
            }
          }
          if (descLines.length > 0) {
            descNote = '\n[Photo references from this response:]\n' + descLines.join('\n')
          }
        }

        // The exact search behind this response. Phase 1 keeps no record of its own tool
        // calls across turns, so without this a follow-up has to rebuild the query from the
        // conversation prose — which loses parameters. Only the latest assistant turn
        // carries it (see getLLMContext).
        let searchNote = ''
        if (m.searchCalls && m.searchCalls.length > 0) {
          const calls = m.searchCalls
            .map((args) => `search_advanced(${JSON.stringify(args)})`)
            .join(' + ')
          searchNote = `\n[INTERNAL_CONTEXT: the search that produced these photos was ${calls}]`
        }

        messages.push(new AIMessage(m.content + photoNote + descNote + searchNote))
      }
    }

    // Push currentUserMessage BEFORE merging so it is included in the alternation fix.
    // This matters when an assistant error was filtered out (isError=true), leaving two
    // consecutive HumanMessages — the merge loop below will collapse them correctly.
    messages.push(currentUserMessage)

    // Gemini requires strict user/model alternation — merge consecutive same-role messages
    // to avoid an unstructured API error that LangChain's error handler cannot surface properly.
    const merged: any[] = [messages[0]] // always keep SystemMessage first
    for (let i = 1; i < messages.length; i++) {
      const prev = merged[merged.length - 1]
      const curr = messages[i]
      if (prev instanceof HumanMessage && curr instanceof HumanMessage) {
        const prevText = LangchainAgentService.extractTextContent(prev.content)
        const currText = LangchainAgentService.extractTextContent(curr.content)
        merged[merged.length - 1] = new HumanMessage(prevText + '\n' + currText)
      } else if (
        prev instanceof AIMessage &&
        curr instanceof AIMessage &&
        !(prev instanceof ToolMessage) &&
        !(curr instanceof ToolMessage)
      ) {
        const prevText = LangchainAgentService.extractTextContent(prev.content)
        const currText = LangchainAgentService.extractTextContent(curr.content)
        merged[merged.length - 1] = new AIMessage(prevText + '\n' + currText)
      } else {
        merged.push(curr)
      }
    }

    return merged
  }

  // ── Phase 1 ──────────────────────────────────────────────────

  private async runPhase1Loop(session: ChatSession): Promise<void> {
    const MAX_ITERATIONS = session.maxIterationsPhase1
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      session.totalIter = iter + 1
      agentIteration(session.totalIter, MAX_ITERATIONS)

      // Dumped here, not at build time: `session.messages` is the array actually handed
      // to the model, and the prefetch of attached photos has already appended to it by
      // now. Only iteration 0 — the later ones are this same array plus tool results.
      if (iter === 0) {
        await dumpPhase1Input(session.messages, {
          userId: session.userId,
          modeId: session.modeId,
          model: session.modelName,
          provider: session.provider,
          message: session.message,
          // NOT the toolMap keys: it also holds `fetch_basket`, which is executable by
          // the server but never offered to the model. Printing it here would claim the
          // model had a tool it cannot see — in the one file you read to find out what
          // the model actually received.
          toolNames: session.boundToolNames,
          toolChoice: session.toolChoice,
        })
      }

      let response: any
      try {
        response = await session.modelWithTools.invoke(session.messages, {
          callbacks: [makeDebugCallback(`phase1-iter-${iter}`)],
        })
      } catch (err: any) {
        // LangChain sometimes loses the original error and throws on undefined.message —
        // log the raw error object so we can see what actually went wrong.
        agentError(
          'error',
          `model invoke failed on iter ${session.totalIter}: ${err?.message ?? err}`
        )
        throw err
      }
      session.iterationUsages.push(
        LangchainAgentService.computeCallCost(
          `phase1-iter-${iter}`,
          session.modelName,
          extractUsageMetadata(response)
        )
      )
      const toolCalls = response.tool_calls ?? []
      const calledDone = toolCalls.some((tc: any) => tc.name === 'done')
      const realToolCalls = toolCalls.filter((tc: any) => tc.name !== 'done')

      this.logPhantomText(response.content, session.totalIter)

      if (calledDone && realToolCalls.length === 0) {
        agentLine('collected', `done after ${session.totalIter} iteration(s)`)
        break
      }

      if (toolCalls.length === 0) {
        agentWarn(
          'collected',
          `no tool calls returned despite tool_choice:'any' — treating as done`
        )
        break
      }

      if (realToolCalls.length > 0) {
        await this.executePhase1Iteration(session, toolCalls)
      }

      if (calledDone) {
        agentError(
          'error',
          `RECOVERED: done was called alongside ${realToolCalls.length} tool(s) on iter ${session.totalIter}; ignored terminal signal and continuing`
        )
        continue
      }
    }
  }

  private logPhantomText(content: any, iter: number): void {
    const phantomText = LangchainAgentService.extractTextContent(content).trim()
    if (!phantomText) return
    const estimate = Math.ceil(phantomText.length / 4)
    agentWarn(
      'phantom',
      `text in iter ${iter} — ~${estimate} tokens wasted · ${quoted(phantomText, 120)}`
    )
  }

  private async executePhase1Iteration(session: ChatSession, allTCs: any[]): Promise<void> {
    session.messages.push(new AIMessage({ content: '', tool_calls: allTCs }))
    const toolMsgs = await Promise.all(
      allTCs.map(async (tc: any) => {
        if (tc.name === 'done') {
          return new ToolMessage({
            content:
              'ignored: done must be called alone; inspect the other tool results and continue data collection',
            tool_call_id: tc.id,
          })
        }

        const results = await this.executeToolCalls(
          [tc],
          session.toolMap,
          session.toolsUsed,
          session.intermediateSteps
        )
        return results[0]
      })
    )
    session.messages.push(...toolMsgs)
    LangchainAgentService.compressPriorToolMessages(session.messages, toolMsgs.length)
  }

  private async executeToolCalls(
    toolCalls: any[],
    toolMap: Record<string, any>,
    toolsUsed: string[],
    intermediateSteps: IntermediateStep[]
  ): Promise<ToolMessage[]> {
    return Promise.all(
      toolCalls.map(async (tc: any) => {
        const t = toolMap[tc.name]
        if (!toolsUsed.includes(tc.name)) toolsUsed.push(tc.name)

        agentToolCall(tc.name, JSON.stringify(tc.args))
        const t0 = Date.now()

        let result: string
        if (t) {
          try {
            result = await t.invoke(tc.args)
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            result = JSON.stringify({ error: `Tool execution failed: ${errorMessage}` })
          }
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${tc.name}` })
        }

        const durationMs = Date.now() - t0
        agentToolResult(tc.name, durationMs, result)
        intermediateSteps.push({ tool: tc.name, input: tc.args, output: result, durationMs })

        return new ToolMessage({ content: result, tool_call_id: tc.id, name: tc.name })
      })
    )
  }

  // ── Phase 2 ──────────────────────────────────────────────────

  private async runPhase2(
    session: ChatSession,
    contextPhotoIds: number[]
  ): Promise<{
    text: string
    selection_title?: string
    photo_groups: Array<{ label: string; photo_ids: number[]; rejected?: boolean }>
    usage?: any
  }> {
    agentSection('🧠', 'PHASE 2 · curation')
    const phase2Messages = LangchainAgentService.buildPhase2Messages(
      session.messages,
      session.userContext,
      session.intermediateSteps,
      session.userProfile,
      (session.template?.phase2Addendum ?? '') +
        // Same gate as Phase 1's: the curator is told the pool was narrowed only when it
        // actually was, so it never explains away a thin round with a scope that is absent.
        (session.templateScopeCollectionIds.length > 0
          ? (session.template?.scope?.phase2Addendum ?? '')
          : '') +
        // The curator is the only one that speaks, so the board's name has to reach it too:
        // Phase 1 knowing what the board is called does nothing for how the reply reads.
        formatCanvasNameFragment(session.canvasContext?.name ?? null, 'phase2') +
        // The canvas curator's framing, in one of its two mutually exclusive forms — the
        // shown photos are candidates to ADD (default) or the user's own already on the
        // board ("Canvas only"). Split so the curator only ever reads the one that is true
        // this turn, instead of the default framing plus a correction it might not heed.
        // Keyed on the template, not on `canvasContext`, so an empty board (which carries no
        // context) still gets the default "what to add" framing — the right one there.
        (session.template?.id === CANVAS_COMPANION_TEMPLATE_ID
          ? session.canvasContext?.scopedToBoard
            ? PHASE2_CANVAS_SCOPE_ADDENDUM
            : PHASE2_CANVAS_UNSCOPED_ADDENDUM
          : ''),
      session.curationMode
    )
    // The focus is the SUBJECT on a judge/compare/describe turn and a mere ANCHOR on a turn
    // that pulled new photos — so it earns thumbnails only in the first case, and reaches
    // Phase 2 as text-only otherwise (it still SEES what the focus holds, it just does not
    // pay to LOOK at photos that are not the answer). Read from what Phase 1 actually did,
    // never predicted. Gated on there being a board at all: no canvas, no focus group in the
    // visual context, so this is a no-op for every other session.
    // "Canvas only" can never pull new material — every search was caged to the board — so
    // the focus stays the SUBJECT and keeps its thumbnails, whether or not Phase 1 bothered
    // to pass the (now redundant) canvas scope that `canvasTurnPulledNewMaterial` reads.
    const focusTextOnly =
      session.canvasContext != null &&
      !session.canvasContext.scopedToBoard &&
      canvasTurnPulledNewMaterial(session.intermediateSteps)
    // On a `suspendCuration` turn the prefetches were skipped, so `intermediateSteps` has no
    // canvas/attached group — but `contextPhotoIds` still arrives here from the caller, and
    // it would put the attachment's thumbnails back into context on its own. Pass nothing,
    // so Phase 2's "nothing to curate" exception fires on a genuinely empty context.
    const visual = await this.buildPhase2VisualContext(
      session.suspendCuration ? [] : contextPhotoIds,
      session.intermediateSteps,
      session.providerPhase2,
      session.modelNamePhase2,
      focusTextOnly,
      session.suspendCuration ? null : session.canvasContext
    )

    // Curatorial lens — disabled unless CURATORIAL_LENS_ENABLED=true, in which case
    // it lands last, immediately before PHASE2_TRIGGER, so the critique frame is the
    // final thing read before judgment. Returns null when the gate is closed.
    //
    // The gate needs no prediction: the visual context is already built, so we know
    // whether the curator ended up with photographs in front of it — including the ones
    // its own search surfaced, not just the ones the user attached.
    const lensMessage = buildLensMessage({
      needsArtisticEvaluation: session.needsArtisticEvaluation,
      thumbnailCount: visual.thumbnailCount,
      profile: session.userProfile,
    })
    if (lensMessage) {
      agentLine('lens', `curatorial manual injected · profile=${session.userProfile ?? 'none'}`)
    }

    return LangchainAgentService.invokeStructuredFinalAnswer(
      session.modelNamePhase2,
      [...phase2Messages, ...visual.messages, ...(lensMessage ? [lensMessage] : [])],
      session.thinkingLevelPhase2,
      {
        userId: session.userId,
        modeId: session.modeId,
        model: session.modelNamePhase2,
        thinkingLevel: session.thinkingLevelPhase2,
        message: session.message,
        lensInjected: lensMessage !== null,
      }
    )
  }

  private async buildPhase2VisualContext(
    contextPhotoIds: number[],
    intermediateSteps: IntermediateStep[],
    provider: ModelProvider,
    modelName: ModelName,
    // Canvas only: send the focus (`fetch_canvas_view`) as text-only, not thumbnails,
    // because it was an anchor this turn rather than the subject. Off everywhere else —
    // the general chat has no `fetch_canvas_view` group, so this never applies to it.
    focusTextOnly = false,
    // Canvas only: the board this turn is docked to, for the ids it already describes (so a
    // photo attached from outside the board is not framed as a second, unrelated copy of one
    // the view already carries, and does not spend the shared thumbnail budget on an image
    // that block pays for) and for the grid the view's header renders. Null everywhere else,
    // which leaves every other session byte-for-byte as it was.
    canvasContext: CanvasChatContext | null = null
  ): Promise<Phase2VisualContext> {
    const result: HumanMessage[] = []
    // How many photos the curator can actually SEE. Gates the curatorial manual, and
    // stays unused when it is disabled. Text-only photos are deliberately not counted:
    // the manual exists to read concrete frames, and a description cannot settle
    // whether an occlusion was a device.
    let thumbnailCount = 0

    // ── Helper: fetch photos with interleaved text + thumbnail ──
    const fetchWithImages = async (
      photoIds: number[],
      limit: number
    ): Promise<{ parts: any[]; count: number }> => {
      const idsToFetch = photoIds.slice(0, limit)
      const photos = await this.photoManager.getPhotosByIds(idsToFetch)
      const photoMap = new Map(photos.map((p) => [p.id, p]))
      const parts: any[] = []
      let count = 0

      for (const id of idsToFetch) {
        const photo = photoMap.get(id)
        if (!photo) continue

        parts.push({
          type: 'text',
          text: `[${photo.originalFileName} — id:${photo.id}]\n${JSON.stringify(photoDataForAgentPreview(photo, { includeScores: true }))}`, // compact: no whitespace to save tokens
        })

        // DeepSeek and Qwen Phase 1 models do not support vision — skip image parts entirely
        if (provider === 'deepseek' || provider === 'qwen') continue

        try {
          // URL vs base64 is decided per model inside buildImagePart: Gemini only fetches
          // URLs itself on some models, and 429s on the rest (see geminiAcceptsImageUrl).
          const imagePart = await buildImagePart({
            model: modelName,
            imageName: photo.thumbnailName,
            imageUrl: photo.thumbnailUrl,
            detail: PHASE2_IMAGE_DETAIL,
          })
          if (imagePart) {
            parts.push(imagePart)
            count++
          }
        } catch {
          // Image fetch failed — text description is still included
        }
      }
      thumbnailCount += count
      return { parts, count }
    }

    // ── Helper: fetch photos as text-only (no thumbnail) ──
    const fetchTextOnly = async (
      photoIds: number[],
      formatter: (photo: any) => Record<string, any> = (photo) =>
        photoDataForAgentPreview(photo, { includeScores: true })
    ): Promise<any[]> => {
      if (photoIds.length === 0) return []
      const photos = await this.photoManager.getPhotosByIds(photoIds)
      const photoMap = new Map(photos.map((p) => [p.id, p]))
      const parts: any[] = []

      for (const id of photoIds) {
        const photo = photoMap.get(id)
        if (!photo) continue

        parts.push({
          type: 'text',
          text: `[${photo.originalFileName} — id:${photo.id} (text-only)]\n${JSON.stringify(formatter(photo))}`, // compact: no whitespace to save tokens
        })
      }
      return parts
    }

    // ── 1. User's attached photos (always get images) ──
    const viewSet = new Set(canvasViewIds(canvasContext))
    if (contextPhotoIds.length > 0) {
      const { parts, count } = await fetchWithImages(contextPhotoIds, PHASE2_MAX_THUMBNAILS)
      if (parts.length > 0) {
        // Beside a board these are photos brought in from OUTSIDE it — an @-mention, a card
        // pulled out of the transcript — which is a different thing from the spotlight, and
        // the header has to say so or the curator reads them as photos the user has placed.
        const header =
          canvasContext !== null
            ? `[Attached — ${count} photo(s) the user brought into the chat from OUTSIDE the board, with description + thumbnail. They are not placed on the canvas. Any also present in the canvas view below is shown here once, not repeated there]`
            : `[User's attached photos — ${count} photo(s) with description + thumbnail for visual reference]`
        result.push(
          new HumanMessage({
            content: [{ type: 'text', text: header }, ...parts],
          })
        )
        agentVision('attached', count, 0, contextPhotoIds)
      }
    }

    // ── 2. Tool result photos (image-eligible vs text-only) ──
    const allGroups = LangchainAgentService.extractAllPhotoIdsGrouped(intermediateSteps)
    const seenIds = new Set(contextPhotoIds)
    // An attached photo that the canvas view also carries would have had a thumbnail under
    // that block's own reserved budget, so it does not charge the shared one — that would
    // take images away from this turn's search results for a picture already paid for.
    const attachedOutsideFocus = contextPhotoIds.filter((id) => !viewSet.has(id)).length
    let remainingThumbnails = Math.max(
      0,
      PHASE2_MAX_THUMBNAILS - Math.min(attachedOutsideFocus, PHASE2_MAX_THUMBNAILS)
    )
    let remainingTextOnlySlots = PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS

    if (allGroups.length > 0) {
      // Process most-recent groups first so they get image priority
      const orderedGroups = [...allGroups].reverse()
      // …except the basket, which always yields to the turn's real results. `seenIds` gives
      // whichever group runs first the payload for a shared photo, and a photo this turn's
      // search actually returned belongs under its search heading, not under the shelf.
      // Sort is stable, so everything else keeps the recency order above.
      // The canvas view yields for the same reason: a photo this turn's search returned
      // belongs under its search heading, not under "what's on the board".
      const yieldsToResults = (tool: string) =>
        tool === 'fetch_basket' || tool === 'fetch_canvas_view'
      orderedGroups.sort(
        (a, b) => Number(yieldsToResults(a.tool)) - Number(yieldsToResults(b.tool))
      )

      // Pre-calculate proportional thumbnail allocation for image-eligible tools
      const imageEligibleGroups = orderedGroups.filter(
        (g) => g.tool !== 'fetch_basket' && IMAGE_ELIGIBLE_TOOLS.has(g.tool)
      )
      const totalImageEligiblePhotos = imageEligibleGroups.reduce((sum, g) => {
        const ids = g.ids.filter((id) => !seenIds.has(id))
        return sum + ids.length
      }, 0)

      for (const group of orderedGroups) {
        const groupIds = group.ids.filter((id) => !seenIds.has(id))
        if (groupIds.length === 0) continue

        // ── Selection basket: reserved budget, newest photos get the images ──
        // Spends BASKET_MAX_* and never touches remainingThumbnails / remainingTextOnlySlots,
        // so consulting the shelf cannot leave this turn's search results without thumbnails.
        // The tail carries the images because a series or portfolio in progress grows from
        // its most recent additions — those are the frames worth looking at.
        if (group.tool === 'fetch_basket') {
          // No re-cap: fetch_basket already returned at most BASKET_MAX_PHOTOS. The only
          // number this branch owns is how many of them carry an image.
          const withImageIds = groupIds.slice(-BASKET_MAX_THUMBNAILS)
          const textOnlyIds = groupIds.slice(0, groupIds.length - withImageIds.length)

          // Text first, images last: the block then reads oldest → newest, ending on the
          // frames, which is the order the curator needs to see the selection evolve.
          const textParts = await fetchTextOnly(textOnlyIds)
          const { parts: imageParts, count: imageCount } = await fetchWithImages(
            withImageIds,
            BASKET_MAX_THUMBNAILS
          )
          const allParts = [...textParts, ...imageParts]

          if (allParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    // group.ids, not the deduped slice: a pinned photo this turn's search
                    // already delivered is skipped in the payload but must still be listed,
                    // or the record of what the user kept comes back with holes in it.
                    text:
                      `[Selection basket — photos the user pinned in this conversation, oldest first. ` +
                      `Pinned ids: ${group.ids.join(', ')}. ` +
                      `Showing ${imageCount} with thumbnail + ${textOnlyIds.length} text-only]`,
                  },
                  ...allParts,
                ],
              })
            )
            agentVision('fetch_basket', imageCount, textOnlyIds.length, groupIds)
          }

          for (const id of groupIds) seenIds.add(id)
          continue
        }

        // ── Canvas view: reserved budget, EVERY photo gets an image ──
        // Spends its own budget and leaves remainingThumbnails / remainingTextOnlySlots
        // alone, exactly like the basket: looking at the board must never cost this turn's
        // search results their thumbnails.
        //
        // Unlike the basket, there is no text-only tier for the SPOTLIGHT. The shelf is
        // context for a selection whose material came from this turn's search, so showing
        // its four most recent is enough; a spotlighted photo is the SUBJECT of the question
        // — "does this one fit here" cannot be answered from a filename. The focus around it
        // does drop to text on a turn that pulled new material (see `focusTextOnly`), which
        // is the one case where it is context rather than the answer.
        if (group.tool === 'fetch_canvas_view') {
          // group.ids rather than the deduped slice, same as the basket: a photo this turn's
          // search also returned is skipped in the payload but still has to be listed, or the
          // picture of the board comes back with holes.
          //
          // The attachment's ids are skipped here too, for the same reason — but those are
          // photos from outside the board, so the header says where they went.
          const focusIds = canvasContext?.focusIds ?? []
          const spotlightIds = canvasContext?.spotlightIds ?? []
          const spotlightSet = new Set(spotlightIds)
          const attachedHere = group.ids.filter((id) => contextPhotoIds.includes(id))
          // From the context's own lists, not partitioned out of `group.ids`: a photo the user
          // picked OUT of the zone belongs to both levels and has to appear in both, or the
          // zone reads as missing the very photo the question is about. Intersected with
          // what the tool actually returned, so a deleted photo is named nowhere.
          const returned = new Set(group.ids)
          const focusListed = focusIds.filter((id) => returned.has(id))
          const spotlightListed = spotlightIds.filter((id) => returned.has(id))

          const header =
            `[Canvas view — what the user is looking at on their board, in reading order ` +
            `(left to right, top to bottom). ` +
            (spotlightListed.length > 0
              ? `FOCUS (the zone they are working in): ${focusListed.join(', ')}. ` +
                `SPOTLIGHT (the photos they singled out to ask about — the SUBJECT; ` +
                `inside that zone or from elsewhere on the board, the map says which): ` +
                `${spotlightListed.join(', ')}. `
              : `FOCUS — the photos they marked out, and the SUBJECT of the question: ` +
                `${focusListed.join(', ')}. `) +
            (attachedHere.length > 0
              ? `Of these, ${attachedHere.join(', ')} were also attached — shown above with thumbnails, not repeated here. `
              : '') +
            (canvasContext && canvasContext.layout.length > 0
              ? `\nHow they sit on the board (` +
                (spotlightListed.length > 0 ? `◆ = spotlighted, ` : '') +
                `· = empty):\n` +
                renderCanvasLayout(canvasContext.layout, spotlightIds) +
                `\n`
              : '')

          // The spotlight keeps its thumbnails whatever the turn did: it is what the user
          // pointed at. Only the focus around it drops to text when the answer is elsewhere.
          const spotlightToFetch = groupIds.filter((id) => spotlightSet.has(id))
          const focusToFetch = groupIds.filter((id) => !spotlightSet.has(id))

          if (focusTextOnly) {
            const { parts: spotlightParts, count: spotlightCount } = await fetchWithImages(
              spotlightToFetch,
              spotlightToFetch.length
            )
            const textParts = await fetchTextOnly(focusToFetch)
            if (spotlightParts.length > 0 || textParts.length > 0) {
              result.push(
                new HumanMessage({
                  content: [
                    {
                      type: 'text',
                      text:
                        header +
                        `Showing ${spotlightCount} spotlighted with thumbnail; the focus is ` +
                        `text-only — this turn is about new photos, so the zone is context, ` +
                        `not the result.]`,
                    },
                    ...spotlightParts,
                    ...textParts,
                  ],
                })
              )
              agentVision('fetch_canvas_view', spotlightCount, textParts.length, groupIds)
            }
          } else {
            const { parts: imageParts, count: imageCount } = await fetchWithImages(
              groupIds,
              groupIds.length
            )
            if (imageParts.length > 0) {
              result.push(
                new HumanMessage({
                  content: [
                    { type: 'text', text: header + `Showing ${imageCount} with thumbnail]` },
                    ...imageParts,
                  ],
                })
              )
              agentVision('fetch_canvas_view', imageCount, 0, groupIds)
            }
          }

          for (const id of groupIds) seenIds.add(id)
          continue
        }

        const isImageEligible = IMAGE_ELIGIBLE_TOOLS.has(group.tool)

        if (isImageEligible) {
          // ── Image-eligible tool: proportional thumbnail allocation ──
          const thumbsForThisGroup =
            totalImageEligiblePhotos > 0
              ? Math.floor(remainingThumbnails * (groupIds.length / totalImageEligiblePhotos))
              : 0
          const withImageIds = thumbsForThisGroup > 0 ? groupIds.slice(0, thumbsForThisGroup) : []
          const textOnlyIds = groupIds.slice(withImageIds.length)
          const cappedTextOnlyIds = textOnlyIds.slice(0, remainingTextOnlySlots)

          const { parts: imageParts, count: imageCount } = await fetchWithImages(
            withImageIds,
            thumbsForThisGroup
          )
          const textParts = await fetchTextOnly(cappedTextOnlyIds, (photo) =>
            photoDataForAgentPreview(photo, { includeScores: true })
          )
          const allParts = [...imageParts, ...textParts]

          if (allParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${imageCount} photo(s) with thumbnail + ${cappedTextOnlyIds.length} text-only]`,
                  },
                  ...allParts,
                ],
              })
            )
            agentVision(group.tool, imageCount, cappedTextOnlyIds.length, [
              ...withImageIds,
              ...cappedTextOnlyIds,
            ])
          }
          remainingThumbnails -= imageCount
          remainingTextOnlySlots -= cappedTextOnlyIds.length

          for (const id of [...withImageIds, ...cappedTextOnlyIds]) seenIds.add(id)
        } else {
          // ── Text-only tool (catalog_sample, etc.) ──
          if (remainingTextOnlySlots <= 0) continue
          const cappedIds = groupIds.slice(0, remainingTextOnlySlots)

          let formatter: (photo: any) => Record<string, any>
          if (group.tool === 'catalog_sample') {
            const scanMode = (intermediateSteps[group.stepIndex]?.input?.scan_mode ??
              'technical') as 'technical' | 'semantic'
            formatter = (photo) => photoDataForAgentScan(photo, scanMode)
          } else {
            formatter = (photo) => photoDataForAgentPreview(photo, { includeScores: true })
          }

          const textParts = await fetchTextOnly(cappedIds, formatter)
          if (textParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${cappedIds.length} photo(s), detailed text-only descriptions]`,
                  },
                  ...textParts,
                ],
              })
            )
            agentVision(group.tool, 0, cappedIds.length, cappedIds)
          }
          remainingTextOnlySlots -= cappedIds.length
          for (const id of cappedIds) seenIds.add(id)
        }
      }
    }

    return { messages: result, thumbnailCount }
  }

  // ── Result finalisation ──────────────────────────────────────

  private async finalizeResult(
    session: ChatSession,
    structured: {
      text: string
      selection_title?: string
      photo_groups: Array<{ label: string; photo_ids: number[]; rejected?: boolean }>
      usage?: any
    },
    _contextPhotoIds: number[]
  ): Promise<AgentChatResult> {
    const rawOutput = structured.text ?? ''
    const cleaned = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()

    // Build photoGroups first so their IDs feed the filename→token replacement.
    // Filter out IDs that exceed PostgreSQL integer range — the LLM may hallucinate
    // numeric filenames (e.g. "18385876675018230") as photo_ids in structured output.
    const MAX_PG_INT = 2_147_483_647
    const photoGroups: PhotoGroup[] = (structured.photo_groups ?? []).map((g, i) => ({
      // 1-based id, stable for the lifetime of the message: it's what Phase 3 uses to
      // scope an action to specific groups without having to echo their labels.
      id: i + 1,
      label: g.label,
      photoIds: (g.photo_ids ?? []).filter((id) => Number.isFinite(id) && id <= MAX_PG_INT),
      // The curator's own verdict on the group, carried as a flag instead of being
      // re-derived from the label downstream: it's what lets the action suggester
      // exclude a discard pile without having to interpret the words "Descartadas".
      rejected: g.rejected === true,
    }))
    await this.enrichPhotoGroupsWithDescriptions(photoGroups)
    const allPhotoIds = photoGroups.flatMap((g) => g.photoIds)
    session.foundPhotoIds.push(...allPhotoIds)

    const output = await this.injectPhotoTokens(cleaned, session.userId, allPhotoIds)

    const phase2Usage = LangchainAgentService.computeCallCost(
      'phase2',
      session.modelNamePhase2,
      structured.usage
    )
    const classifierUsage = session.classifierUsage
    const costEntries = [classifierUsage, ...session.iterationUsages, phase2Usage]
    const cost: AgentCostBreakdown = {
      classifier: classifierUsage,
      iterations: session.iterationUsages,
      phase2: phase2Usage,
    } as AgentCostBreakdown

    cost.total = LangchainAgentService.sumUsageEntries(costEntries)
    const total = cost.total

    agentSection('🏁', 'RESULT')
    agentLine('tools', session.toolsUsed.join(', ') || 'none')
    agentLine('groups', `${photoGroups.length} group(s) · ${allPhotoIds.length} photo(s)`)
    for (const g of photoGroups) {
      agentSub(`#${g.id} ${quoted(g.label, 40)} · ${g.photoIds.length} ${formatIds(g.photoIds)}`)
    }
    agentLine(
      'cost',
      `€${total.costEur.toFixed(6)} (routing €${classifierUsage.costEur.toFixed(6)}) · ` +
        `in ${total.inputTokens} (${total.cachedTokens} cached) · out ${total.outputTokens} · think ${total.thinkingTokens}`
    )
    agentLine('output', quoted(output, 110))

    // History persistence is now handled by ChatController via ConversationService
    return {
      output,
      photoGroups,
      selectionTitle: (structured.selection_title ?? '').trim().slice(0, 100),
      toolsUsed: session.toolsUsed,
      intermediateSteps: session.intermediateSteps,
      totalIterations: session.totalIter,
      cost,
      searchCalls: LangchainAgentService.extractSearchCalls(session.intermediateSteps),
    }
  }

  /**
   * Post-processing pass: inject [[photo:ID|filename]] tokens into the output text.
   *
   * Primary path  — scan for known filenames (from photo_groups). The model almost
   *   always writes filenames directly, so this is the common case. Also strips
   *   surrounding ** bold markers so the token becomes the sole formatting.
   * Fallback path — scan for bare numeric IDs in case any leaked through.
   *
   * The fallback only considers IDs present in photo_groups. A bare number in the prose
   * is far more often a year or a count ("tus mejores fotos de 2024") than a photo
   * reference, and matching it against the whole catalog made every such number a
   * candidate. photo_groups is the intent signal — the prompt already requires every
   * photo named in the text to appear there. This narrows the collision to a year that
   * equals an ID the model actually grouped; it does not close it.
   *
   * @param knownPhotoIds  IDs already present in photo_groups (pre-fetched, cheap).
   */
  private async injectPhotoTokens(
    text: string,
    userId: number,
    knownPhotoIds: number[]
  ): Promise<string> {
    if (knownPhotoIds.length === 0) return text

    const photos = await Photo.query()
      .whereIn('id', knownPhotoIds)
      .where('user_id', userId)
      .select(['id', 'original_file_name'])

    if (photos.length === 0) return text

    const idToFilename = new Map<number, string>(photos.map((p) => [p.id, p.originalFileName]))
    const filenameToId = new Map<string, number>(photos.map((p) => [p.originalFileName, p.id]))

    let result = text

    // ── 1. Replace known filenames (possibly wrapped in **bold**) with tokens ──
    // Sort longest-first to avoid partial matches on filenames that share a prefix.
    const filenames = [...filenameToId.keys()].sort((a, b) => b.length - a.length)
    for (const filename of filenames) {
      const id = filenameToId.get(filename)!
      const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match the filename with 0–2 surrounding asterisks on each side
      const pattern = new RegExp(`${PHOTO_TOKEN_SOURCE}|\\*{0,2}${escaped}\\*{0,2}`, 'g')
      result = result.replace(pattern, (match) => {
        if (match.startsWith('[[photo:')) return match // already tokenised
        return `[[photo:${id}|${filename}]]`
      })
    }

    // ── 2. Fallback: replace any remaining bare numeric IDs ──
    const bareIdPattern = new RegExp(`${PHOTO_TOKEN_SOURCE}|\\b(\\d{3,})\\b`, 'g')
    result = result.replace(bareIdPattern, (match, bareId?: string) => {
      if (bareId === undefined) return match // matched a token from step 1, leave it whole
      const filename = idToFilename.get(Number(bareId))
      if (filename) {
        return `[[photo:${bareId}|${filename}]]`
      }
      return match
    })

    return result
  }

  /**
   * For each photo group, fetch `descriptions.context` + `originalFileName` and
   * store them as a compact string map so the LLM can recall photos by content
   * across conversation turns.
   */
  private async enrichPhotoGroupsWithDescriptions(photoGroups: PhotoGroup[]): Promise<void> {
    const allIds = photoGroups.flatMap((g) => g.photoIds)
    if (allIds.length === 0) return
    const photos = await this.photoManager.getPhotosByIds(allIds)

    /** Split text into sentences (splitting on '. ', '! ', '? '). */
    const firstSentences = (text: string, n: number): string => {
      if (!text) return ''
      const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
      return sentences.slice(0, n).join(' ').trim()
    }

    const descMap = new Map<number, string>()
    for (const photo of photos) {
      const filename = photo.originalFileName ?? ''
      const contextSnippet = firstSentences(photo.descriptions?.context ?? '', 1)
      const storySnippet = firstSentences(photo.descriptions?.story ?? '', 1)
      const parts = [contextSnippet, storySnippet].filter(Boolean).join(' | ')
      if (filename || parts) {
        descMap.set(photo.id, parts ? `${filename} — ${parts}` : filename)
      }
    }
    for (const group of photoGroups) {
      const descriptions: Record<string, string> = {}
      for (const id of group.photoIds) {
        const desc = descMap.get(id)
        if (desc) descriptions[String(id)] = desc
      }
      if (Object.keys(descriptions).length > 0) {
        group.photoDescriptions = descriptions
      }
    }
  }

  // ── Model management ─────────────────────────────────────────

  private static getProviderFromModel(model: ModelName): ModelProvider {
    if (model.startsWith('gemini')) return 'gemini'
    if (model.startsWith('deepseek')) return 'deepseek'
    if (model.startsWith('grok')) return 'xai'
    if (model.startsWith('qwen')) return 'qwen'
    if (isAnthropicModel(model)) return 'anthropic'
    return 'openai'
  }

  private static createChatModel(
    model: ModelName = 'gpt-5.1',
    maxTokensOverride?: number,
    effortOverride?: 'low' | 'medium' | 'high',
    disableThinking = false,
    thinkingLevel?: ThinkingLevel
  ) {
    const provider = LangchainAgentService.getProviderFromModel(model)
    if (provider === 'gemini') {
      // Gemini 2.5 disables thinking via thinkingBudget:0; Gemini 3+ uses thinkingLevel.
      // When thinking is enabled, includeThoughts surfaces the reasoning in the response
      // for cost-tracking verification (total_tokens still includes thinking either way).
      //
      // `thinkingLevel` raises the reasoning budget explicitly (curator_plus). It only
      // applies to Gemini 3+; on 2.5 the level has no equivalent and we keep the default.
      // Left undefined, every branch below is exactly what it was before this parameter
      // existed — so existing modes are untouched.
      const isGemini3 = model.startsWith('gemini-3')
      const thinkingConfig = disableThinking
        ? isGemini3
          ? { thinkingLevel: 'MINIMAL' as any } // LangChain types lag behind the API. MINIMAL is Gemini 3's real floor — ModelsService already defaults to it — and LOW here still burned thinking tokens inside Phase 1's tight output cap.
          : { thinkingBudget: 0 }
        : isGemini3 && thinkingLevel
          ? { includeThoughts: true, thinkingLevel: thinkingLevel.toUpperCase() as any }
          : { includeThoughts: true }
      return new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        maxOutputTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        thinkingConfig,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      })
    }
    if (provider === 'anthropic') {
      // Claude no tiene presupuesto de tokens de pensamiento: el razonamiento es
      // "adaptive" y su profundidad se regula con `output_config.effort`. Pasar
      // `budget_tokens` da 400 en Opus 5 — @langchain/anthropic lo valida antes de
      // salir a red (utils/params.validateInvocationParamCompatibility).
      //
      // El pensamiento se factura como output y consume `max_tokens`, la misma trampa
      // que documentan Gemini y OpenAI aquí arriba, así que el presupuesto que calculan
      // los callers se aplica igual.
      //
      // `disableThinking` apaga el razonamiento de verdad, no lo baja a 'low', y es
      // obligatorio que así sea: Anthropic RECHAZA un tool_choice forzado ('any'/'tool')
      // cuando el razonamiento está activo, y la Fase 1 se apoya justamente en ese
      // tool_choice para no emitir texto fantasma. Adaptive + 'any' sería un 400 en cada
      // iteración. A cambio se acepta el modo degradado conocido de esta familia sin
      // razonamiento (a veces escribe la llamada en el texto visible en vez de emitir un
      // tool_use); el bucle ya trata "cero tool calls" como fin de fase.
      //
      // temperature/top_p/top_k no se pasan: Opus 5 las rechaza y Sonnet 5 solo admite
      // el valor por defecto.
      return new ChatAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        thinking: disableThinking ? { type: 'disabled' } : { type: 'adaptive' },
        // Con thinking apagado el effort se queda en 'high' o menos: Opus 5 devuelve 400
        // al combinar thinking:'disabled' con 'xhigh'/'max'.
        outputConfig: { effort: thinkingLevel ?? effortOverride ?? 'medium' },
      })
    }
    if (provider === 'deepseek') {
      return new ChatOpenAI({
        apiKey: process.env.DEEPSEEK_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: process.env.DEEPSEEK_BASEURL ?? 'https://api.deepseek.com',
        },
      })
    }
    if (provider === 'qwen') {
      return new ChatOpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        },
      })
    }
    if (provider === 'xai') {
      return new ChatOpenAI({
        apiKey: process.env.XAI_API_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: 'https://api.x.ai/v1',
        },
      })
    }
    // OpenAI. Both parameters below are gated by LangChain's own `isReasoningModel`
    // (gpt-5* except gpt-5-chat, plus the o-series): for anything else — gpt-4o, gpt-4.1 —
    // it drops `reasoning_effort` and sends `max_tokens` instead of `max_completion_tokens`
    // on its own, so pointing a mode back at a non-reasoning model needs no change here.
    //
    // `disableThinking` has to map to the literal 'none' rather than to 'low': Chat
    // Completions rejects function tools together with any other effort — "Function tools
    // with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions" —
    // and Phase 1 is nothing but function tools. Phase 2 is unaffected because
    // withStructuredOutput resolves to jsonSchema (response_format) for these models, not
    // to a tool. Note 'none' only exists from gpt-5.1 on; the original gpt-5 line bottoms
    // out at 'minimal' and therefore cannot drive Phase 1 on this endpoint at all.
    //
    // maxTokens was previously left unset here, i.e. unbounded. Reasoning bills as output
    // ($30/M on Sol), so the cap the callers already compute now actually applies.
    const effort = disableThinking ? 'none' : (thinkingLevel ?? effortOverride)
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_KEY,
      model,
      maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
      // Only `effort` — setting `reasoning.summary` would silently reroute the call to
      // the Responses API (see _useResponsesApi in @langchain/openai).
      reasoning: effort ? { effort } : undefined,
    })
  }

  // ── Message compression ──────────────────────────────────────

  private static extractTextContent(content: any): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('')
    }
    return ''
  }

  private static slimToolMessage(msg: ToolMessage): ToolMessage {
    if (typeof msg.content !== 'string') return msg
    if (msg.name === 'done') return msg
    try {
      const parsed = JSON.parse(msg.content)
      if (parsed.error || parsed._compressed) return msg

      // ── Non-photo tools: compress to structured digest ──

      if (msg.name === 'catalog_view') {
        const section = parsed.section ?? 'all'
        const parts: string[] = []
        if (parsed.catalog_patterns) {
          const patterns = parsed.catalog_patterns
          const patternKeys = Object.keys(patterns)
          const clusterCount = patternKeys.reduce((sum: number, key: string) => {
            const arr = patterns[key]
            return sum + (Array.isArray(arr) ? arr.length : 0)
          }, 0)
          parts.push(`${patternKeys.length} pattern type(s) with ${clusterCount} cluster(s)`)
        }
        if (parsed.artistic_scores_stats) {
          parts.push(
            'artistic_scores_stats, score_evolution, visual_aspects_stats and capture_settings_stats'
          )
        }
        const slim = {
          _compressed: true,
          summary: `Catalog view (section="${section}") retrieved: ${parts.join(' + ') || 'no data'}. Full data available for evaluation phase.`,
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      // Keeps the thematic core rather than collapsing to "retrieved", unlike
      // `catalog_view` above. The blocks dropped here (aspect distributions, per-criterion
      // score stats) are read once to plan a call; the board's name and its dominant
      // subjects are what a LATER iteration needs to re-plan — they are the answer to "what
      // is this board", and a model that has to re-derive them would call the tool twice.
      if (msg.name === 'canvas_overview') {
        const tags = (parsed.top_content_tags ?? [])
          .slice(0, 5)
          .map((tag: any) => `${tag.name} (${tag.percentage}%)`)
        const slim = {
          _compressed: true,
          canvas_name: parsed.canvas_name ?? null,
          photos_on_board: parsed.photos_on_board ?? 0,
          top_content_tags: tags,
          summary:
            'Canvas overview retrieved: aspect distributions, artistic scores, date range and locations are available in full to the evaluation phase.',
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'catalog_sample') {
        const buckets = parsed.buckets ?? []
        const slim = {
          _compressed: true,
          total_sampled: parsed.total_sampled ?? 0,
          buckets: buckets.map((b: any) => ({
            period: b.period,
            total_in_period: b.total_in_period,
            photo_ids: (b.photos ?? []).map((p: any) => p.id),
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'app_knowledge') {
        const isSpecific = parsed.section !== undefined
        const sections = isSpecific ? [parsed.section] : Object.keys(parsed)
        const slim = {
          _compressed: true,
          summary: `App knowledge retrieved: ${sections.length} section(s) [${sections.join(', ')}]. Full content available for evaluation phase.`,
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'fetch_collections') {
        const slim = {
          _compressed: true,
          collections: (parsed.collections ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            totalPhotos: c.totalPhotos ?? (c.samplePhotoIds ?? []).length,
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'fetch_series') {
        const slim = {
          _compressed: true,
          series: (parsed.series ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            totalPhotos: s.totalPhotos ?? (s.samplePhotoIds ?? []).length,
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'fetch_portfolios') {
        const slim = {
          _compressed: true,
          portfolios: (parsed.portfolios ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt,
            targetSize: p.targetSize,
            coherenceMode: p.coherenceMode,
            sequencing: p.sequencing,
            totalPhotos: p.totalPhotos ?? (p.photoIds ?? []).length,
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'web_search') {
        const slim = {
          _compressed: true,
          total: parsed.total ?? 0,
          ...(parsed.answer ? { answer: (parsed.answer as string).slice(0, 150) } : {}),
          urls: (parsed.results ?? []).map((r: any) => r.url).filter(Boolean),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      // ── Photo tools: keep only id + filename ──

      // Shape 1: raw array (get_photo_info)
      if (Array.isArray(parsed)) {
        if (parsed.length === 0 || !parsed[0]?.id) return msg
        const slim = parsed.map((p: any) => ({ id: p.id, originalFileName: p.originalFileName }))
        return new ToolMessage({ content: JSON.stringify(slim), tool_call_id: msg.tool_call_id })
      }

      // Shape 2: object with photos/results array (search_advanced)
      const photos = parsed.photos ?? parsed.results ?? []
      if (photos.length === 0) return msg
      const slim = {
        returned: photos.length,
        photos: photos.map((p: any) => ({ id: p.id, originalFileName: p.originalFileName })),
      }
      return new ToolMessage({ content: JSON.stringify(slim), tool_call_id: msg.tool_call_id })
    } catch {
      return msg
    }
  }

  private static compressPriorToolMessages(messages: any[], freshCount: number): void {
    const cutoff = messages.length - freshCount
    for (let i = cutoff - 1; i >= 0; i--) {
      if (messages[i] instanceof ToolMessage) {
        messages[i] = LangchainAgentService.slimToolMessage(messages[i])
      }
    }
  }

  /**
   * Reads the executed steps to decide which field-reading guidance the role prompt needs.
   * Errored outputs don't count: a failed `search_advanced` leaves no `querySummary` to explain.
   */
  private static analyzePhase2Evidence(steps: IntermediateStep[]): Phase2Evidence {
    const succeeded = (step: IntermediateStep, toolName: string): boolean => {
      if (step.tool !== toolName) return false
      try {
        return !JSON.parse(step.output)?.error
      } catch {
        return false
      }
    }
    return {
      hasSearch: steps.some((s) => succeeded(s, 'search_advanced')),
      hasTruncatedSearch: LangchainAgentService.hasTruncatedSearch(steps),
      hasTagDistribution: steps.some((s) => succeeded(s, 'tag_distribution')),
      hasBasket: steps.some((s) => succeeded(s, 'fetch_basket')),
    }
  }

  /**
   * Whether any `search_advanced` this turn reported more matches than it returned. This is
   * the single fact that makes the `{more:…}` pagination button meaningful — the click
   * re-runs the same request and fetches the next unseen page, so a search that was not
   * truncated (returned everything, or nothing) has no page to fetch. Read off the executed
   * steps, so it is what actually happened, not what the classifier guessed.
   */
  private static hasTruncatedSearch(steps: IntermediateStep[]): boolean {
    return steps.some((s) => {
      if (s.tool !== 'search_advanced') return false
      try {
        const parsed = JSON.parse(s.output)
        return !parsed?.error && parsed?.querySummary?.truncated === true
      } catch {
        return false
      }
    })
  }

  private static buildPhase2Messages(
    messages: any[],
    userContext: string = '',
    intermediateSteps: IntermediateStep[] = [],
    userProfile: string | null = null,
    templateAddendum: string = '',
    curationMode = false
  ): any[] {
    // Build a queue of full outputs per restorable tool so we can replace
    // the compressed ToolMessages inline instead of duplicating data.
    const RESTORABLE_TOOLS = new Set([
      'search_advanced',
      'catalog_view',
      // The curator writes the sentence the user reads about their board, and the digest
      // above deliberately drops the half that sentence is made of.
      'canvas_overview',
      'app_knowledge',
      'fetch_collections',
      'fetch_series',
      'fetch_portfolios',
      // Phase 1 reads the snippets once, to plan the call they feed (Pattern A: learn the
      // award's criteria, then search for photos that fit) — after that round
      // `compressPriorToolMessages` drops them, which is right: it never writes prose.
      // Phase 2 does, and the compressed form leaves it a 150-char `answer` plus URLs it
      // cannot open. So the external facts have to be restored exactly here, for the only
      // phase that puts them in front of the user.
      'web_search',
    ])
    const restoreQueues = new Map<string, string[]>()
    for (const step of intermediateSteps) {
      if (!RESTORABLE_TOOLS.has(step.tool)) continue
      try {
        const parsed = JSON.parse(step.output)
        if (parsed.error) continue
        if (!restoreQueues.has(step.tool)) restoreQueues.set(step.tool, [])
        restoreQueues.get(step.tool)!.push(step.output)
      } catch {
        continue
      }
    }

    const evidence = LangchainAgentService.analyzePhase2Evidence(intermediateSteps)
    const result = messages.map((msg, idx) => {
      if (idx === 0 && msg instanceof SystemMessage) {
        const roleAddendum = buildPhase2RoleAddendum(evidence, userProfile, curationMode)
        // Last on purpose: a template's rules are exceptions to the general manual above,
        // and an exception has to be read after the rule it overrides. This is also the
        // ONLY place a template can state anything user-facing — Phase 1 emits tool calls
        // and never writes a word the user reads.
        const phase2Prompt = SYSTEM_PROMPT_BASE + roleAddendum + templateAddendum
        const content = userContext ? `${phase2Prompt}\n\n${userContext}` : phase2Prompt
        return new SystemMessage(content)
      }
      if (!(msg instanceof ToolMessage)) return msg

      // For restorable tools, inject the full output from intermediateSteps
      // instead of the compressed version — Phase 2 needs the complete data.
      if (msg.name && RESTORABLE_TOOLS.has(msg.name)) {
        const queue = restoreQueues.get(msg.name)
        if (queue && queue.length > 0) {
          const fullOutput = queue.shift()!
          return new ToolMessage({
            content: fullOutput,
            tool_call_id: msg.tool_call_id,
            name: msg.name,
          })
        }
      }

      return LangchainAgentService.slimToolMessage(msg)
    })

    return result
  }

  /**
   * The args of this turn's `search_advanced` calls, for the next turn to re-issue.
   * See AgentChatResult.searchCalls.
   */
  private static extractSearchCalls(steps: IntermediateStep[]): Record<string, any>[] {
    return steps
      .filter((step) => step.tool === 'search_advanced')
      .slice(0, MAX_REPLAYED_SEARCH_CALLS)
      .map((step) => step.input)
  }

  private static extractAllPhotoIdsGrouped(steps: IntermediateStep[]): PhotoIdGroup[] {
    const groups: PhotoIdGroup[] = []

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]

      if (step.tool === 'search_advanced') {
        try {
          const parsed = JSON.parse(step.output)
          const photos = parsed.photos ?? []
          if (Array.isArray(photos) && photos.length > 0) {
            const ids = photos.map((p: any) => p.id).filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'catalog_sample') {
        try {
          const parsed = JSON.parse(step.output)
          const buckets = parsed.buckets ?? []
          if (Array.isArray(buckets) && buckets.length > 0) {
            const ids = buckets
              .flatMap((b: any) => (b.photos ?? []).map((p: any) => p.id))
              .filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'fetch_basket') {
        try {
          const parsed = JSON.parse(step.output)
          const photos = parsed.photos ?? []
          if (Array.isArray(photos) && photos.length > 0) {
            // Read from the OUTPUT, not from the basket itself: the tool already applied
            // the limit and dropped ids whose photo is gone, so this is exactly what
            // Phase 1 saw. Reslicing here could show Phase 2 a different shelf.
            const ids = photos.map((p: any) => p.id).filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'fetch_canvas_view') {
        try {
          const parsed = JSON.parse(step.output)
          const photos = parsed.photos ?? []
          if (Array.isArray(photos) && photos.length > 0) {
            // From the OUTPUT, like the basket: the tool applied the cap and dropped ids
            // whose photo is gone, so this is exactly what Phase 1 was shown.
            const ids = photos.map((p: any) => p.id).filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'get_photo_info') {
        const ids = step.input?.photoIds
        if (Array.isArray(ids) && ids.length > 0) {
          const validIds = ids.filter((id: any) => typeof id === 'number')
          if (validIds.length > 0) groups.push({ tool: step.tool, ids: validIds, stepIndex: i })
        }
        continue
      }

      // fetch_collections, fetch_series and fetch_portfolios intentionally excluded: they
      // only provide metadata. The agent must call get_photo_info explicitly for any
      // photos it wants to evaluate.
      if (
        step.tool === 'fetch_collections' ||
        step.tool === 'fetch_series' ||
        step.tool === 'fetch_portfolios'
      )
        continue
    }
    return groups
  }

  // ── Cost tracking ─────────────────────────────────────────────

  /**
   * QueryService calls go through ModelsService (not LangChain), so they arrive with the
   * cost already priced instead of raw usage_metadata — no computeCallCost needed here.
   */
  private static usageEntryFromQueryCall(label: string, usage: QueryCallUsage): TokenUsageEntry {
    return {
      label,
      model: usage.model ?? undefined,
      inputTokens: usage.inputTokens,
      cachedTokens: usage.cachedTokens,
      outputTokens: usage.outputTokens,
      thinkingTokens: usage.thinkingTokens,
      totalTokens: usage.totalTokens,
      costEur: usage.costEur,
    }
  }

  private static computeCallCost(label: string, model: ModelName, usageMeta: any): TokenUsageEntry {
    const inputTokens = usageMeta?.input_tokens ?? 0
    const outputTokens = usageMeta?.output_tokens ?? 0
    const cachedTokens = usageMeta?.input_token_details?.cache_read ?? 0
    // Anthropic es el único proveedor con TRES tarifas de input: escribir en caché cuesta
    // 1.25x el input normal, leer de ella 0.1x. LangChain ya normaliza el desglose en
    // input_token_details, y `input_tokens` los incluye a los tres, así que basta con
    // sacar la porción de escritura de la de "cache miss" antes de aplicar precios. En el
    // resto de proveedores el campo no existe y el cálculo queda exactamente igual.
    const cacheWriteTokens = usageMeta?.input_token_details?.cache_creation ?? 0
    const totalFromMeta = usageMeta?.total_tokens ?? 0
    // LangChain's convertUsageMetadata maps candidatesTokenCount → output_tokens but does NOT
    // expose thoughtsTokenCount. However, Google's API always sets:
    //   totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount
    // so we derive thinking tokens as the difference. If the model is not thinking, the
    // difference will be 0. This is the only reliable way to get thinking tokens from LangChain.
    //
    // OpenAI is the mirror image: it reports reasoning explicitly, and that count is
    // ALREADY inside output_tokens. So it is read rather than derived (deriving gives 0
    // and hides the very surcharge this column exists to measure), and it must NOT be
    // added to the billed output the way Gemini's must, or the turn bills twice.
    //
    // Anthropic behaves like OpenAI (thinking counted inside output_tokens) and llega por
    // el mismo campo gracias a extractUsageMetadata; deriving would give 0 here too,
    // porque su total_tokens es exactamente input + output.
    const reportedReasoning = usageMeta?.output_token_details?.reasoning ?? 0
    const derivedThinking =
      totalFromMeta > 0 ? Math.max(0, totalFromMeta - inputTokens - outputTokens) : 0
    const thinkingTokens = reportedReasoning || derivedThinking
    const billedOutputTokens = reportedReasoning ? outputTokens : outputTokens + derivedThinking
    const totalTokens = totalFromMeta || inputTokens + outputTokens

    const prices = (
      PRICES as Record<
        string,
        {
          input_cache_miss: number
          input_cache_hit: number
          input_cache_write?: number
          output: number
        }
      >
    )[model]
    let costEur = 0
    if (prices) {
      const cacheMiss = inputTokens - cachedTokens - cacheWriteTokens
      costEur =
        (cacheMiss * prices.input_cache_miss +
          cachedTokens * prices.input_cache_hit +
          cacheWriteTokens * (prices.input_cache_write ?? prices.input_cache_miss) +
          billedOutputTokens * prices.output) *
        USD_TO_EUR
    }

    return {
      label,
      model,
      inputTokens,
      cachedTokens,
      outputTokens,
      thinkingTokens,
      totalTokens,
      costEur,
    }
  }

  private static sumUsageEntries(entries: TokenUsageEntry[]): TokenUsageEntry {
    return entries.reduce(
      (acc, e) => ({
        label: 'total',
        inputTokens: acc.inputTokens + e.inputTokens,
        cachedTokens: acc.cachedTokens + e.cachedTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        thinkingTokens: acc.thinkingTokens + e.thinkingTokens,
        totalTokens: acc.totalTokens + e.totalTokens,
        costEur: acc.costEur + e.costEur,
      }),
      {
        label: 'total',
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        costEur: 0,
      }
    )
  }

  // ── Phase 2 invocation (with retry) ──────────────────────────

  private static async invokeStructuredFinalAnswer(
    modelName: ModelName,
    messages: any[],
    thinkingLevel?: ThinkingLevel,
    debugMeta?: Phase2DumpMeta
  ): Promise<{
    text: string
    selection_title?: string
    photo_groups: Array<{ label: string; photo_ids: number[]; rejected?: boolean }>
    usage?: any
  }> {
    const MAX_ATTEMPTS = 3
    // Gemini bills thinking tokens against maxOutputTokens (the same trap Phase 1
    // documents), so a raised reasoning budget MUST come with room for the answer
    // itself — otherwise the model thinks until the budget is gone and the
    // structured output comes back empty.
    const TOKEN_BUDGET_BY_THINKING: Record<ThinkingLevel, number> = {
      low: 6000,
      medium: 10000,
      high: 16000,
    }
    // OpenAI reasoning models fall into the same trap — reasoning bills against
    // max_completion_tokens — but they are markedly more verbose at the same nominal
    // level, so the Gemini-calibrated budget truncates them. A truncation here is not a
    // degraded answer, it is an empty structured output and three full retries, so the
    // headroom is cheaper than the miss.
    const provider = LangchainAgentService.getProviderFromModel(modelName)
    const isOpenAI = provider === 'openai'
    // Claude cae en la misma trampa por partida doble: el razonamiento adaptativo gasta
    // del mismo `max_tokens` y a nivel alto es tan verboso como los de OpenAI, así que
    // hereda el mismo margen. Sin él la salida estructurada vuelve vacía y se pagan tres
    // reintentos completos.
    const isAnthropic = provider === 'anthropic'
    // …pero con un techo duro que los otros proveedores no tienen. El SDK de Anthropic
    // RECHAZA en local, antes de salir a red, cualquier petición no-streaming cuyo
    // max_tokens implique más de 10 minutos de generación estimada:
    //
    //   tiempo_estimado = 60min * max_tokens / 128000  >  10min   →   throw
    //
    // o sea max_tokens > 128000/6. No es un error de la API ni depende de la red: con
    // 32000 la llamada ni se intentaba y los tres reintentos fallaban idénticos.
    // Levantar este techo exige pasar la Fase 2 a streaming, y eso hoy costaría la
    // columna de thinking (@langchain/anthropic no propaga output_tokens_details en el
    // camino de streaming), así que se recorta el presupuesto en su lugar.
    const ANTHROPIC_MAX_NONSTREAMING_TOKENS = Math.floor(128_000 / 6)
    const rawBudget =
      (thinkingLevel ? TOKEN_BUDGET_BY_THINKING[thinkingLevel] : 6000) *
      (isOpenAI || isAnthropic ? 2 : 1)
    const tokenBudget = isAnthropic
      ? Math.min(rawBudget, ANTHROPIC_MAX_NONSTREAMING_TOKENS)
      : rawBudget
    const baseModel = LangchainAgentService.createChatModel(
      modelName,
      tokenBudget,
      'medium',
      false,
      thinkingLevel
    )
    // La salida estructurada por defecto de Anthropic es una llamada a herramienta
    // FORZADA, y un tool_choice forzado es incompatible con el razonamiento: dejarlo así
    // convierte cada turno de la Fase 2 en "el modelo no llamó a la herramienta" —
    // @langchain/anthropic incluso avisa por consola y lanza. `jsonSchema` usa en su lugar
    // `output_config.format`, que sí convive con thinking. Los demás proveedores ya
    // resuelven solos al equivalente correcto (response_format en OpenAI), así que solo
    // Claude necesita decirlo explícitamente.
    //
    // El cast existe porque createChatModel devuelve una unión de cuatro clases de chat y
    // sus firmas de withStructuredOutput no son mutuamente compatibles para TS; la llamada
    // es la misma en todas.
    const structured = baseModel as unknown as {
      withStructuredOutput: (schema: any, config?: any) => any
    }
    const model = isAnthropic
      ? structured.withStructuredOutput(FINAL_ANSWER_SCHEMA, { method: 'jsonSchema' })
      : structured.withStructuredOutput(FINAL_ANSWER_SCHEMA)
    const phase2Messages = [...messages, new HumanMessage(PHASE2_TRIGGER)]
    agentLine(
      'answering',
      `${modelName}${thinkingLevel ? ` · thinking=${thinkingLevel}` : ''} · maxOut=${tokenBudget}`
    )

    // Dumped here, not at the call site: `phase2Messages` is the array actually handed
    // to the model, PHASE2_TRIGGER included. Anything reconstructed earlier would be a
    // near-miss, which is the exact thing this is meant to stop.
    if (debugMeta) await dumpPhase2Input(phase2Messages, debugMeta)

    let lastError: any
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const usageCollector: { usage?: any } = {}
        const result = (await model.invoke(phase2Messages, {
          callbacks: [makeDebugCallback('phase2'), makeUsageCallback(usageCollector)],
        })) as { text: string; photo_groups: Array<{ label: string; photo_ids: number[] }> }
        return { ...result, usage: usageCollector.usage }
      } catch (err: any) {
        lastError = err
        agentWarn('retry', `attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${err.message}`)
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
        }
      }
    }
    throw lastError
  }
}
