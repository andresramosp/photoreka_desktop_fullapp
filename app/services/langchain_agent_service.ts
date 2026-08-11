import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService, {
  photoDataForAgentPreview,
  photoDataForAgentScan,
} from './agent_tools_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import PhotoImageService from './photo_image_service.js'
import ConversationService from './conversation_service.js'
import QueryService from './query_service.js'
import type { QueryCallUsage } from './query_service.js'
import { buildLensMessage } from './curatorial_lens_service.js'
import { dumpPhase1Input, dumpPhase2Input, type Phase2DumpMeta } from '../utils/chat_debug_dump.js'
import { getProfileQualityCriteria } from '#config/photo_schema'
import { _debug, makeDebugCallback, makeUsageCallback } from '../utils/agent_utils.js'
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
- **Language:** Always match the user's language. Use English ALWAYS for internal tool calls.
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
- **\`get_photo_info\`** — ONLY user-attached photo IDs, or IDs from conversation history. NEVER on IDs returned by \`search_advanced\` or \`catalog_sample\`.
- **\`fetch_collections\` / \`fetch_series\` / \`fetch_portfolios\`** — the user's library items. Three distinct types; never substitute one for another.
- **\`web_search\`** — external facts only (gear, techniques, awards, photographer bios). For time-sensitive topics, include the current date in the query.

**Parallelism:** call independent tools simultaneously. If one tool's output feeds another's input — including \`web_search\` feeding a later call — call them sequentially.

## Thinking patterns
The examples below show HOW TO THINK about tool orchestration. Extrapolate the underlying logic to new situations — adapt parameters, combine strategies, and invent new patterns as needed.

### Pattern A — Sequential dependency: external info → catalog search
User: "Look up this year's Sony World Photography Awards and recommend photos from my catalog that could fit."
**Think:** I need external info first (award criteria), then search my catalog based on what I learn. Sequential.
1. \`web_search\` → learn categories, themes, judging criteria.
2. \`search_advanced\` — adapt to what was learned:
\`\`\`
search_advanced({
  filter: { scoreFilters: [{ field: "storytelling", min: 7 }, { field: "originality", min: 6 }], visualAspects: { genre: ["documentary"] } },
  style_query: "interesting documentary storytelling",
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
User: "Find my best photos where hats appear."
**Think:** "hats" is a subject (what appears in the photo) → \`content_tags\`. "best" → score filter. Genre (portrait, street…) describes the photographic style, not the subject — a hat can appear in any genre.
\`search_advanced({ content_tags: ["hat"], filter: { scoreFilters: [{field: "aesthetic_quality", min: 7}] }, operation: "intersect" })\`

### Pattern E — Parallel independent searches
User: "Compare my best portraits with my best street photos."
**Think:** Two independent searches by genre and scores — no dependency between them. Parallelize everything.
1. search_advanced({ filter: { visualAspects: { genre: ["portrait"] }, scoreFilters: [{ field: "aesthetic_quality", min: 7.5 }] }, operation: "intersect" }) +
   search_advanced({ filter: { visualAspects: { genre: ["street"] }, scoreFilters: [{ field: "storytelling", min: 7 }] }, operation: "intersect" })

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
 * The curator's role prompt. Every bullet that explains how to READ a specific tool field
 * is interpolated only when that field is actually in the model's context — see
 * Phase2Evidence for why the gate reads the executed steps and not the pre-flight
 * classifier. Everything outside an interpolation is unconditional.
 */
function buildPhase2RoleAddendum(ev: Phase2Evidence): string {
  return `

## Your current role: CURATOR & JUDGE
You have all gathered data from previous steps. You also have visual access to thumbnail images paired with full descriptions for the user's attached photos and top search results. Use them for visual verification and curatorial judgment.

Photos may arrive with thumbnails (for visual evaluation) or text-only descriptions (from earlier search iterations). Both are valid candidates for your response.

## Exception — when there is nothing to curate
If the user only greeted you, thanked you or asked what you can do, and the tools returned nothing but information — not a single photo — then this turn is not a curation and everything below is suspended. Return an empty \`photo_groups\` and an empty \`selection_title\`: that is the correct answer here, not an incomplete one. Say nothing about their catalog, their style or their subject matter — the photography profile and catalog size in your context are registration data, not something you looked at. Just answer the person: brief and warm, one line on what you are for, and two or three concrete example requests they could send you next.

## Curatorial judgment
- **Selectivity:** Only include photos that genuinely match the user's request. Discard tangential or low-relevance results — even if returned by a search tool.
- **Grounding:** Your response MUST be based EXCLUSIVELY on data returned by tools. If no photos were found or all tools returned empty results, state this clearly — NEVER invent filenames, descriptions, or photo content to fill the gap. An empty \`photo_groups\` array is correct when there are no real results.
${
  // ═══ only when a search_advanced output is in context ═══
  ev.hasSearch
    ? `- **Search coverage:** \`search_advanced.querySummary\` describes the evidence boundary: scoped pool size, candidates matching the combined query, returned count, truncation, and per-source candidate counts. Use it to qualify broad claims.
    - \`truncated\`: more matches exist than you were given. Present the set as a prioritized first round, never as the exhaustive or definitive best, and close by offering another round  — asking for one returns photos you have not shown yet. One short clause (e.g. 'just say: **show me more**'), and never quantify what is left.
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
    - Don't contradict a score for free: if you disagree, name what the number missed.
    - Don't hide behind one either: a high score on one criterion never settles the picture.
    - When your reading diverges, say so and say on which criterion — a split verdict is more accurate than a softened average.
    - Each photo was scored ALONE. You are the only one seeing them side by side; that comparison is what you add.
- **Genre-specific priorities** — weight criteria by the photographer's style:
    - *Documentary:* \`message\`, \`storytelling\`, \`candidness\`.
    - *Street:* \`candidness\`, \`visual_games\`, \`originality\`.
    - *Artistic:* \`message\`, \`originality\`, \`composition\`.
- **Catalog analysis:** Look for patterns and imbalances across clusters, not just average scores.

## Communication
- **Conciseness:** Max 200 words. No fluff, no raw JSON. Summarize insights unless explicitly asked for details.
- **Paragraphs:** Split the \`text\` field into short, distinct paragraphs (2–4 sentences each). Never a single continuous block. Each paragraph = one idea: overall impression → highlights → weakness/suggestion.
- **Honesty:** Be honest, constructive, and insightful — even if that means tough feedback. Do not flatter the user gratuitously.
- **Formatting:** Use **bold** for filenames, key concepts, and any term worth emphasizing. Use it sparingly — only for genuinely important words, not decoration.
- Use filenames for reference in your text, never raw IDs or tool names.

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
type ModelProvider = 'openai' | 'gemini' | 'deepseek' | 'xai' | 'qwen'

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
  hasTagDistribution: boolean
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
  /** Stored UserProfile — lens fallback when photos carry no usable genre. */
  userProfile: string | null
  userContext: string
  messages: any[]
  toolMap: Record<string, any>
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
   */
  public async chat(
    userId: number,
    conversationId: number,
    message: string,
    contextPhotoIds: number[] = [],
    selectedMode: ChatIntelligenceMode,
    forceCheapModel = false
  ): Promise<AgentChatResult> {
    const session = await this.initChatSession(
      userId,
      conversationId,
      message,
      contextPhotoIds,
      selectedMode,
      forceCheapModel
    )
    agentSection('🔍', 'PHASE 1 · data collection')
    await this.prefetchAttachedPhotos(session, contextPhotoIds)
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
    forceCheapModel: boolean
  ): Promise<ChatSession> {
    const convService = new ConversationService()
    // Sequential on purpose: the classifier condenses elliptical follow-ups
    // ("ahora con esta") against the recent turns, so it needs the history first.
    const history = await convService.getLLMContext(conversationId)
    const classification = await this.queryService.classifyQuery(
      message,
      contextPhotoIds.length,
      LangchainAgentService.buildClassifierTurns(history)
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
    const alreadyShownIds = wants_more_results
      ? [...new Set(history.flatMap((m) => m.photoGroups?.flatMap((g) => g.photoIds) ?? []))]
      : []
    // Short-circuit: the query is exclusively about the photo(s) attached to THIS
    // message. prefetchAttachedPhotos already runs get_photo_info on them, and Phase 2
    // builds their thumbnails from contextPhotoIds directly — Phase 1 has nothing to add.
    const skipPhase1 = attached_photos_only && contextPhotoIds.length > 0
    const modelName = selectedMode.modelPhase1 as ModelName
    let modelNamePhase2: ModelName
    if (forceCheapModel) {
      modelNamePhase2 = selectedMode.modelPhase2Lite as ModelName
    } else if (!has_photo_intent) {
      modelNamePhase2 = selectedMode.modelPhase2Lite as ModelName
    } else if (needs_artistic_evaluation) {
      modelNamePhase2 = selectedMode.modelPhase2Expensive as ModelName
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
    agentLine(
      'class',
      `photo ${yn(has_photo_intent)}  artistic ${yn(needs_artistic_evaluation)}  ` +
        `attached-only ${yn(attached_photos_only)}  more ${yn(wants_more_results)}` +
        (wants_more_results ? ` (excluding ${alreadyShownIds.length} already shown)` : '')
    )
    agentLine(
      'models',
      `phase1 ${modelName} (${provider}) · phase2 ${modelNamePhase2} (${providerPhase2})` +
        (forceCheapModel ? ' [forced lite]' : '')
    )

    const userProfile = (await User.find(userId))?.profiles ?? null
    const tools = this.toolsService.createTools(
      userId,
      userProfile,
      foundPhotoIds,
      provider,
      alreadyShownIds
    )
    const doneTool = this.createDoneTool()
    const allTools = [...tools, doneTool]
    // 'any' = Gemini, 'required' = OpenAI/xAI (forces tool call, prevents phantom text), 'auto' = DeepSeek/Qwen
    const toolChoice =
      provider === 'deepseek' || provider === 'qwen'
        ? 'auto'
        : provider === 'xai'
          ? 'required'
          : 'any'
    // Phase 1 only emits tool calls — cap output tokens to avoid paying for phantom text.
    // Disable thinking for Phase 1: thinking models (e.g. gemini-3-flash) consume
    // maxOutputTokens for both thinking AND tool-call JSON. With a tight budget (500),
    // thinking eats all tokens → empty response → premature "done".
    const PHASE1_MAX_OUTPUT_TOKENS = 500
    const modelWithTools = LangchainAgentService.createChatModel(
      modelName,
      PHASE1_MAX_OUTPUT_TOKENS,
      'low',
      true // disableThinking — Phase 1 is tool-only, no reasoning needed
    ).bindTools(allTools, { tool_choice: toolChoice })
    const toolMap = Object.fromEntries(allTools.map((t) => [t.name, t]))

    const userContext = await this.buildUserContext(userId)
    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
    const messages = this.buildMessageList(history, currentUserMessage, userContext)

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
      thinkingLevelPhase2: selectedMode.thinkingLevelPhase2,
      maxIterationsPhase1: selectedMode.maxIterationsPhase1 ?? PHASE1_MAX_ITERATIONS_DEFAULT,
      needsArtisticEvaluation: needs_artistic_evaluation,
      skipPhase1,
      userProfile,
      userContext,
      messages,
      toolMap,
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

  private async prefetchAttachedPhotos(
    session: ChatSession,
    contextPhotoIds: number[]
  ): Promise<void> {
    if (contextPhotoIds.length === 0) return
    const prefetchCallId = `prefetch-get_photo_info-${Date.now()}`
    const prefetchToolCall = {
      name: 'get_photo_info',
      args: { photoIds: contextPhotoIds },
      id: prefetchCallId,
    }
    agentLine(
      'attached',
      `${contextPhotoIds.length} photo(s) → prefetching descriptions (text only)`
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

  private buildCurrentUserMessage(message: string, contextPhotoIds: number[]): HumanMessage {
    const { text, refs } = this.stripMentionTokens(message)
    const prefixParts: string[] = []
    if (contextPhotoIds.length > 0) {
      prefixParts.push(`[Attached photo IDs: ${contextPhotoIds.join(', ')}]`)
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

  private async buildUserContext(userId: number): Promise<string> {
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
    userContext: string = ''
  ): any[] {
    const phase1Prompt = SYSTEM_PROMPT_BASE + PHASE1_ROLE_ADDENDUM
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
          toolNames: Object.keys(session.toolMap),
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
          response.usage_metadata
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
        agentLine('collected', `done after ${session.totalIter} iteration(s)`)
        break
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
        if (tc.name === 'done') return new ToolMessage({ content: 'ok', tool_call_id: tc.id })

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
      session.intermediateSteps
    )
    const visual = await this.buildPhase2VisualContext(
      contextPhotoIds,
      session.intermediateSteps,
      session.providerPhase2
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
    provider: ModelProvider
  ): Promise<Phase2VisualContext> {
    const result: HumanMessage[] = []
    const photoImageService = PhotoImageService.getInstance()
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
          if (provider === 'openai' || provider === 'xai') {
            // OpenAI and xAI both accept image_url with a direct URL
            const url = photo.thumbnailUrl
            if (url) {
              parts.push({ type: 'image_url', image_url: { url, detail: PHASE2_IMAGE_DETAIL } })
              count++
            }
          } else {
            // gemini: base64
            const base64 = await photoImageService.getImageBase64FromR2(photo.thumbnailName, false)
            if (base64) {
              parts.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              })
              count++
            }
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
    if (contextPhotoIds.length > 0) {
      const { parts, count } = await fetchWithImages(contextPhotoIds, PHASE2_MAX_THUMBNAILS)
      if (parts.length > 0) {
        result.push(
          new HumanMessage({
            content: [
              {
                type: 'text',
                text: `[User's attached photos — ${count} photo(s) with description + thumbnail for visual reference]`,
              },
              ...parts,
            ],
          })
        )
        agentVision('attached', count, 0, contextPhotoIds)
      }
    }

    // ── 2. Tool result photos (image-eligible vs text-only) ──
    const allGroups = LangchainAgentService.extractAllPhotoIdsGrouped(intermediateSteps)
    const seenIds = new Set(contextPhotoIds)
    let remainingThumbnails = Math.max(
      0,
      PHASE2_MAX_THUMBNAILS - Math.min(contextPhotoIds.length, PHASE2_MAX_THUMBNAILS)
    )
    let remainingTextOnlySlots = PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS

    if (allGroups.length > 0) {
      // Process most-recent groups first so they get image priority
      for (const group of [...allGroups].reverse()) {
        const groupIds = group.ids.filter((id) => !seenIds.has(id))
        if (groupIds.length === 0) continue

        const isImageEligible = IMAGE_ELIGIBLE_TOOLS.has(group.tool)

        if (isImageEligible) {
          // ── Image-eligible tool: thumbnails first, overflow goes to text-only pool ──
          const withImageIds = remainingThumbnails > 0 ? groupIds.slice(0, remainingThumbnails) : []
          const textOnlyIds = groupIds.slice(withImageIds.length)
          const cappedTextOnlyIds = textOnlyIds.slice(0, remainingTextOnlySlots)

          const { parts: imageParts, count: imageCount } = await fetchWithImages(
            withImageIds,
            remainingThumbnails
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
          ? { thinkingLevel: 'LOW' as any } // LangChain types lag; Google API accepts MINIMAL (lowest level)
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
      hasTagDistribution: steps.some((s) => succeeded(s, 'tag_distribution')),
    }
  }

  private static buildPhase2Messages(
    messages: any[],
    userContext: string = '',
    intermediateSteps: IntermediateStep[] = []
  ): any[] {
    // Build a queue of full outputs per restorable tool so we can replace
    // the compressed ToolMessages inline instead of duplicating data.
    const RESTORABLE_TOOLS = new Set([
      'search_advanced',
      'catalog_view',
      'app_knowledge',
      'fetch_collections',
      'fetch_series',
      'fetch_portfolios',
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
        const roleAddendum = buildPhase2RoleAddendum(evidence)
        const phase2Prompt = SYSTEM_PROMPT_BASE + roleAddendum
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
    const reportedReasoning = usageMeta?.output_token_details?.reasoning ?? 0
    const derivedThinking =
      totalFromMeta > 0 ? Math.max(0, totalFromMeta - inputTokens - outputTokens) : 0
    const thinkingTokens = reportedReasoning || derivedThinking
    const billedOutputTokens = reportedReasoning ? outputTokens : outputTokens + derivedThinking
    const totalTokens = totalFromMeta || inputTokens + outputTokens

    const prices = (
      PRICES as Record<
        string,
        { input_cache_miss: number; input_cache_hit: number; output: number }
      >
    )[model]
    let costEur = 0
    if (prices) {
      const cacheMiss = inputTokens - cachedTokens
      costEur =
        (cacheMiss * prices.input_cache_miss +
          cachedTokens * prices.input_cache_hit +
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
    const isOpenAI = LangchainAgentService.getProviderFromModel(modelName) === 'openai'
    const tokenBudget =
      (thinkingLevel ? TOKEN_BUDGET_BY_THINKING[thinkingLevel] : 6000) * (isOpenAI ? 2 : 1)
    const model = LangchainAgentService.createChatModel(
      modelName,
      tokenBudget,
      'medium',
      false,
      thinkingLevel
    ).withStructuredOutput(FINAL_ANSWER_SCHEMA)
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
