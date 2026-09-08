<template>
  <div class="ccs">
    <!-- The tutorial trades the app mark for the graduation cap from the "Take tutorial"
         button, at the same size, so the two read as the same action. -->
    <AppLogo v-if="!tutorialOpen" layout="icon" :height="52" class="ccs-logo" />
    <n-icon v-else :size="52" class="ccs-logo"><SchoolOutline /></n-icon>

    <h2 class="ccs-title">
      {{
        tutorialOpen
          ? "Learn how to ask on different levels"
          : "Chat with your canvas"
      }}
    </h2>

    <!-- ══ Overview: the three-level legend, shown by default ══════════════════
         The diagram is the resting explanation. "Take tutorial" swaps it for the
         walkthrough below, which trades the static picture for a live readout of the
         board's current state and a suggestion tied to it. -->
    <template v-if="!tutorialOpen">
      <p class="ccs-lead">
        Every answer is built from three levels of context, from the board down
        to a single photo.
      </p>

      <!-- Two ways to read the same three-level hierarchy, picked via `layout`:
           "columns" (default) lays the boxes left to right; "nested" boxes each level
           inside the wider one, matching how the marks actually contain each other on
           the board. Either way each box carries the mark it is drawn with everywhere
           else — the dashed ring, the filled glow, the spotlight — so the legend here and
           the marks on the board are the same language. -->
      <div v-if="props.layout === 'nested'" class="ccsn">
        <section class="ccsn-level ccsn-level--board">
          <span class="ccsn-level-badge">
            <CanvasScopeMark type="board" :size="34" />
          </span>
          <div class="ccsn-level-body">
            <h3 class="ccsn-level-title">The board</h3>
            <p class="ccsn-level-text">
              The canvas as a whole provides the overall sense of the work.
            </p>
            <p class="ccsn-level-how">Selected by default.</p>
          </div>

          <section class="ccsn-level ccsn-level--focus">
            <span class="ccsn-level-badge">
              <CanvasScopeMark type="focus" :size="34" />
            </span>
            <div class="ccsn-level-body">
              <h3 class="ccsn-level-title">The focus</h3>
              <p class="ccsn-level-text">
                The photos under the halo, or the ones you pick yourself, define
                the working area.
              </p>
              <p class="ccsn-level-how">
                Move the halo over the photos, click them one by one, or
                <strong
                  >{{ isMac ? "⌘" : "Ctrl" }} +
                  <span class="ccs-box" aria-hidden="true"></span
                ></strong>
                to drag a box.
              </p>
            </div>

            <section class="ccsn-level ccsn-level--attached">
              <span class="ccsn-level-badge">
                <n-icon :size="29"><FlashlightOutline /></n-icon>
              </span>
              <div class="ccsn-level-body">
                <h3 class="ccsn-level-title">The spotlight</h3>
                <p class="ccsn-level-text">
                  Optionally, add a level of detail on photos within (or beyond)
                  the focus area.
                </p>
                <p class="ccsn-level-how">
                  With a focus set, press the
                  <n-icon :size="13" class="ccs-inline-icon"
                    ><FlashlightOutline
                  /></n-icon>
                  on any photo.
                </p>
              </div>
            </section>
          </section>
        </section>
      </div>

      <div v-else class="ccs-levels">
        <section class="ccs-level ccs-level--board">
          <span class="ccs-level-badge">
            <CanvasScopeMark type="board" :size="20" />
          </span>
          <h3 class="ccs-level-title">The board</h3>
          <p class="ccs-level-text">
            Every photo in the board is known as general context — the overall
            sense of your canvas.
          </p>
        </section>

        <section class="ccs-level ccs-level--focus">
          <span class="ccs-level-badge">
            <CanvasScopeMark type="focus" :size="20" />
          </span>
          <h3 class="ccs-level-title">The area</h3>
          <p class="ccs-level-text">
            The photos under the halo (or a drag-box) define the area in which
            you work.
          </p>
        </section>

        <section class="ccs-level ccs-level--attached">
          <span class="ccs-level-badge">
            <n-icon :size="20"><FlashlightOutline /></n-icon>
          </span>
          <h3 class="ccs-level-title">The spotlight</h3>
          <p class="ccs-level-text">
            Optionally, press the spotlight button on a photo — a level of
            detail that lets you ask about specific shots. Available once a
            focus is set.
          </p>
        </section>
      </div>

      <button type="button" class="ccs-tutorial-btn" @click="openTutorial">
        <n-icon :size="16"><SchoolOutline /></n-icon>
        <span>Take tutorial</span>
        <n-icon :size="14" class="ccs-tutorial-btn-arrow">
          <ChevronForwardOutline />
        </n-icon>
      </button>
    </template>

    <!-- ══ Tutorial: bullet walkthrough + live state + a suggestion tied to it ══
         The diagram gives way to plain text and a status line that reads the board as
         it stands right now. The suggestion under it always belongs to the DEEPEST
         level currently active — board, focus, or spotlight — so what the tutorial
         offers is always something the user can act on with what they have out. -->
    <template v-else>
      <p class="ccs-lead">
        Try playing with different scopes and photo selections on the canvas —
        the more you narrow down, the more specific the suggested questions get.
      </p>

      <!-- The same row-of-boxes as the overview's "columns" layout, reused so the two
           screens speak one visual language — each box carries the mark and colour its
           level is drawn with on the board. Here each also carries its live count, and the
           box for the level the current suggestion belongs to lights up in its own colour. -->
      <div class="ccs-levels" aria-live="polite">
        <section
          class="ccs-level ccs-level--board"
          :class="{ 'is-active': isLit('board') }"
        >
          <h3 class="ccs-level-title ccs-level-title--inline">
            <span class="ccs-level-badge ccs-level-badge--inline">
              <CanvasScopeMark type="board" :size="15" />
            </span>
            <span>The board</span>
          </h3>
          <p class="ccs-level-text">
            With nothing selected, questions cover the whole canvas at a
            metadata level.
          </p>
          <span class="ccs-level-tag" :class="{ 'is-zero': boardCount === 0 }">
            <CanvasScopeMark
              type="board"
              :size="13"
              class="ccs-level-tag-mark"
            />
            <span class="ccs-level-tag-count">{{ boardCount }}</span>
            <span class="ccs-level-tag-label">in canvas</span>
          </span>
        </section>

        <section
          class="ccs-level ccs-level--focus"
          :class="{ 'is-active': isLit('focus') }"
        >
          <h3 class="ccs-level-title ccs-level-title--inline">
            <span class="ccs-level-badge ccs-level-badge--inline">
              <CanvasScopeMark type="focus" :size="15" />
            </span>
            <span>The focus</span>
          </h3>
          <p class="ccs-level-text">
            Activate the halo in the header, or pick up photos, to define the
            working area.
          </p>
          <span class="ccs-level-tag" :class="{ 'is-zero': focusCount === 0 }">
            <CanvasScopeMark
              type="focus"
              :size="13"
              class="ccs-level-tag-mark"
            />
            <span class="ccs-level-tag-count">{{ focusCount }}</span>
            <span class="ccs-level-tag-label">focused</span>
          </span>
        </section>

        <section
          class="ccs-level ccs-level--attached"
          :class="{ 'is-active': isLit('spotlight') }"
        >
          <h3 class="ccs-level-title ccs-level-title--inline">
            <span class="ccs-level-badge ccs-level-badge--inline">
              <n-icon :size="15"><FlashlightOutline /></n-icon>
            </span>
            <span>The spotlight</span>
          </h3>
          <p class="ccs-level-text">
            With a focus set, press the spotlight button on a photo to add a
            level of detail.
          </p>
          <span
            class="ccs-level-tag"
            :class="{ 'is-zero': spotlightCount === 0 }"
          >
            <n-icon :size="13" class="ccs-level-tag-mark">
              <FlashlightOutline />
            </n-icon>
            <span class="ccs-level-tag-count">{{ spotlightCount }}</span>
            <span class="ccs-level-tag-label">spotlighted</span>
          </span>
        </section>
      </div>

      <!-- All the suggestions for the current question level, shown together — the pool is
           whatever `pillLevel` resolves to right now (see `activePool`), so the whole list
           updates as one when the board's marks change level. With nothing on the board
           there is no level, and the hint below stands in for the list. -->
      <TransitionGroup
        v-if="visiblePool.length"
        name="ccs-pill"
        tag="div"
        class="ccs-suggest"
      >
        <span key="lead" class="ccs-suggest-lead"
          >Suggested questions for this level</span
        >
        <button
          v-for="pillItem in visiblePool"
          :key="pillItem.prompt"
          type="button"
          class="ccs-pill"
          @click="pick(pillItem)"
        >
          <n-icon :size="15" class="ccs-pill-icon">
            <component :is="pillItem.icon" />
          </n-icon>
          <span class="ccs-pill-text">{{ pillItem.label }}</span>
          <n-icon :size="14" class="ccs-pill-send">
            <ArrowUpCircleOutline />
          </n-icon>
        </button>
      </TransitionGroup>
      <p v-else class="ccs-suggest-empty">
        Place photos on your canvas to see suggestions here.
      </p>

      <!-- An optional aside tied to the current marks — see `contextTip`. It explains why the
           level behaves as it does, or what one more mark would add; absent with a bare board. -->
      <Transition name="ccs-tip">
        <p v-if="contextTip" class="ccs-tip">
          <n-icon :size="14" class="ccs-tip-icon"><BulbOutline /></n-icon>
          <span class="ccs-tip-text">{{ contextTip }}</span>
        </p>
      </Transition>

      <button
        type="button"
        class="ccs-back ccs-back--footer"
        @click="tutorialOpen = false"
      >
        <n-icon :size="15"><ArrowBackOutline /></n-icon>
        <span>Go back</span>
      </button>
    </template>
  </div>
</template>

<script setup>
/**
 * The canvas chat's blank state.
 *
 * A component rather than a title-and-description pair: what needs explaining here is a
 * hierarchy — the chat KNOWS the whole board, SEES the focus, and is ASKED about the
 * attached photos — and three boxes read in order carry that where two fields of text
 * could not. The host owns its blank state; ChatView just renders whatever
 * `uiConfig.emptyState` hands it, and listens for `send-prompt` to fire a pill's question.
 *
 * Two screens, one toggle (`tutorialOpen`). The default is the three-level legend. "Take
 * tutorial" swaps it for a walkthrough: the same three levels as a row of boxes, each
 * carrying its live count, the boxes lighting up as their level fills. The suggestion under
 * them follows the QUESTION level, not the deepest box: one kind of mark alone (a focus zone
 * OR spotlighted photos) asks the same "detail" questions, and only both at once — spotlit
 * subjects inside a focus zone — earns the "local" questions about how they sit in the group.
 * At the detail/local levels the set also flexes with the count: one selected photo asks
 * about that shot alone, two ask about the pair, three or more keep the group-aware set —
 * always four questions. Opening it drops the halo so the walkthrough always starts at the
 * board level. The static picture teaches the vocabulary; the tutorial shows it moving.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import {
  FlashlightOutline,
  ScanOutline,
  StarOutline,
  SearchOutline,
  SparklesOutline,
  ColorPaletteOutline,
  LayersOutline,
  ShuffleOutline,
  LocateOutline,
  GitCompareOutline,
  HelpCircleOutline,
  SchoolOutline,
  ChevronForwardOutline,
  ArrowBackOutline,
  ArrowUpCircleOutline,
  BulbOutline,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import CanvasScopeMark from "@/components/canvas/CanvasScopeMark.vue";
import { useCanvasChatSession } from "@/composables/useCanvasChat";

defineOptions({ name: "CanvasChatEmptyState" });

const props = defineProps({
  /** "columns" (default, side by side) or "nested" (each level boxed inside the wider one). */
  layout: {
    type: String,
    default: "nested",
    validator: (v) => ["columns", "nested"].includes(v),
  },
});

const emit = defineEmits(["send-prompt"]);

// Show the platform's real modifier key, matching the atlas/world-map config panels.
const isMac = computed(
  () => navigator.platform.toUpperCase().indexOf("MAC") >= 0,
);

/** Which screen is up: the legend (false) or the live walkthrough (true). */
const tutorialOpen = ref(false);

// ── The board's live state, read from the host's session ─────────────────────
// Null when this component is somehow mounted outside a canvas; then every count is zero,
// no pool matches, and the pills simply don't render.
const session = useCanvasChatSession();

/**
 * The three levels PARTITION the board, exactly as the context panel draws them: a photo
 * that is both under the halo and spotlighted counts only as spotlighted — the finer role.
 * Counting it twice would make the line add up to more than the board holds.
 */
const spotlightIds = computed(
  () =>
    new Set(
      (session?.contextReadout?.value?.spotlightedPhotos ?? []).map((photo) =>
        String(photo.id),
      ),
    ),
);

/** Every photo placed on the board. */
const boardCount = computed(
  () => session?.contextReadout?.value?.boardCount ?? 0,
);

/** Photos in the focus that are NOT also spotlighted — the zone around the subject. */
const focusCount = computed(() => {
  const readout = session?.contextReadout?.value;
  if (!readout) return 0;
  return readout.focusedPhotos.filter(
    (photo) => !spotlightIds.value.has(String(photo.id)),
  ).length;
});

/** Photos singled out with the spotlight — the subject. */
const spotlightCount = computed(() => spotlightIds.value.size);

/**
 * Whether the focus/spotlight grid reads as more than one cluster apart from each other —
 * mirrors the board live, so dragging the selection across (or closing) the gap swaps the
 * "series" pill below in the same frame the marks themselves visibly split or merge.
 */
const hasSeparateGroups = computed(
  () => session?.contextReadout?.value?.hasSeparateGroups ?? false,
);

/**
 * A box lights when its own level holds photos — honest to the counts, not to the pill
 * level below. The board is lit whenever anything is placed, so the glow builds up as the
 * selection deepens (board → +focus → +spotlight) without a deeper level darkening the
 * ones around it. A spotlight with no surrounding focus lights board + spotlight only, which
 * is exactly what is marked.
 */
const isLit = (level) => {
  if (level === "board") return boardCount.value > 0;
  if (level === "focus") return focusCount.value > 0;
  return spotlightCount.value > 0; // spotlight
};

/**
 * Which pool the suggestion is drawn from — the QUESTION level, which is not the same as
 * the deepest box lit. One kind of mark alone (only a focus zone, OR only spotlighted
 * photos) asks the same questions: "detail", about the set you have picked out. Only when
 * BOTH are present — spotlighted subjects sitting inside a wider focus zone — is there a
 * "local" question to ask: how those subjects relate to the group around them. Null with a
 * bare board, when there is nothing to suggest.
 */
const pillLevel = computed(() => {
  const hasZone = focusCount.value > 0; // focus photos that are not also spotlighted
  const hasSpotlight = spotlightCount.value > 0;
  if (hasZone && hasSpotlight) return "local";
  if (hasZone || hasSpotlight) return "detail";
  if (boardCount.value > 0) return "board";
  return null;
});

// Mirror the walkthrough's open/closed state onto the host session so ChatView can guard a
// send with the "this closes the tutorial" hint. Cleared on unmount too: sending the first
// message tears this component down while `tutorialOpen` is still true.
watch(tutorialOpen, (open) => {
  if (session?.tutorialActive) session.tutorialActive.value = open;
});
onBeforeUnmount(() => {
  if (session?.tutorialActive) session.tutorialActive.value = false;
});

// Opening the tutorial drops the halo, so the walkthrough always starts at the board level
// and the user opts back up to the focus by turning the halo on (or drawing a box) — the
// point the walkthrough is teaching. Idempotent on the host's side; a no-op with no session.
const openTutorial = () => {
  tutorialOpen.value = true;
  // Start the walkthrough clean at the board level: drop the halo (clears the focus) and
  // any spotlighted photos (composer state the halo toggle does not touch).
  session?.disableHalo?.();
  session?.clearSpotlight?.();
  // Frame the whole outer vision ring so the walkthrough opens on everything the board
  // level describes, not on whatever corner the user was zoomed into.
  session?.fitToView?.();
};

// ── The pills ────────────────────────────────────────────────────────────────
// `type` is the QUESTION level a pill belongs to (see `pillLevel` / `activePool`), never
// touched by the model:
//   board   — the whole canvas as one set
//   detail  — one kind of mark on its own: a focus zone OR spotlighted photos. The same
//             questions either way, so the wording stays neutral ("your selected photos")
//   local   — both kinds at once: spotlighted subjects inside a wider focus zone, so the
//             question is how those subjects relate to the group around them
// When one or two photos are selected at the detail/local level, the pool flexes with the
// count, and the CONTEXT the context-aware questions reference depends on the level — at
// "detail" the wider context is the whole board; at "local" it is the surrounding focus
// group, not the board — so the count sets are split by level:
//   detail-one / detail-two — 1 or 2 photos as the only mark: context-aware questions read
//             the photo(s) against the rest of the BOARD, with a couple of photo-only /
//             pair-only questions interspersed
//   local-one / local-two   — 1 or 2 spotlighted photos inside a focus zone: context-aware
//             questions read them against the surrounding FOCUS GROUP, with the same couple
//             of photo-only / pair-only questions interspersed
// Every group holds exactly four pills, so the list is always four questions. The count sets
// The count sets are already ordered context-first (the questions that read the photo(s)
// against the wider group) then no-context (about the photo(s) alone), so filtering by type
// is enough — no reshuffling at render time.
const PILLS = [
  // Board — the whole canvas as one set: mood, gaps, grouping, pairings across everything.
  {
    type: "board",
    label: "What's the overall mood of the board?",
    icon: SparklesOutline,
    prompt:
      "Look at all the photos on my board and describe the overall mood and visual direction they create together.",
  },
  {
    type: "board",
    label: "What kind of shot is missing from the board?",
    icon: ColorPaletteOutline,
    prompt:
      "Analyze all the photos on my board and tell me what kind of shot is missing to make the whole set feel more complete.",
  },
  {
    type: "board",
    label: "Help me expand the board",
    icon: LayersOutline,
    prompt:
      "Look at all the photos on my board and suggest new additions to expand the set keeping the overall mood and visual direction consistent.",
  },
  {
    type: "board",
    label: "Find unexpected pairings across the board",
    icon: ShuffleOutline,
    prompt:
      "Look across all the photos on my board and find the most curious, unexpected pairings between them. Explain what makes each odd couple work.",
  },
  // Detail — one level of marks (a focus zone, or spotlighted photos): what ties that set
  // together, ranking within it, and finding more of the same. Neutral wording so it reads
  // right whether the marks are a focus or a spotlight.
  {
    type: "detail",
    label: "What connects my selected photos?",
    icon: ScanOutline,
    prompt:
      "Look at the photos I've selected on the board and tell me what mood, theme, or story connects them.",
  },
  {
    type: "detail",
    label: "Which of my selected photos is the strongest?",
    icon: StarOutline,
    prompt:
      "Compare the photos I've selected on the board and tell me which one is the strongest, and why.",
  },
  {
    type: "detail",
    label: "Find more like my selected photos",
    icon: SearchOutline,
    prompt:
      "Find photos in my library that share the mood and subject of the ones I've selected on the board.",
  },
  // Local — spotlighted subjects sitting inside a wider focus zone, always read against the
  // group around them.
  {
    type: "local",
    label: "How do the spotlighted photos dialogue with their group?",
    icon: LocateOutline,
    prompt:
      "Look at the photos I've spotlighted and tell me how they dialogue within the group of photos around them on the board.",
  },
  {
    type: "local",
    label:
      "Find interesting pairings between these photos and their surrounding area",
    icon: GitCompareOutline,
    prompt:
      "Look at the photos I've selected and find interesting pairings between them and the surrounding photos on the board.",
  },
  {
    type: "local",
    label: "Which of these photos should I remove from their group?",
    icon: HelpCircleOutline,
    prompt:
      "Consider the photos I've spotlighted and tell me which ones should be removed based on the surrounding photos on the board.",
  },
  {
    type: "local",
    label: "Sequence this group of photos narratively",
    icon: LayersOutline,
    prompt:
      "Look at the photos I've spotlighted and tell me how to sequence them narratively so the story unfolds with the strongest emotional and visual progression.",
  },
  // Detail · one photo — a single photo as the only mark. Context here is the whole board.
  // Context-first: the board-aware questions lead, the photo-only ones trail.
  {
    type: "detail-one",
    label: "How does this photo sit with the rest of my board?",
    icon: LocateOutline,
    prompt:
      "Look at the photo I've selected and tell me how it sits within the rest of the photos on the board.",
  },
  {
    type: "detail-one",
    label: "Find photos on the board that work well with this one",
    icon: HelpCircleOutline,
    prompt:
      "Look at the photo I've selected and find other photos on the board that work well alongside it.",
  },
  {
    type: "detail-one",
    label: "What's the mood of this photo?",
    icon: SparklesOutline,
    prompt:
      "Look at the photo I've selected on the board and describe its mood and visual character.",
  },
  {
    type: "detail-one",
    label: "What would make this photo stronger?",
    icon: ColorPaletteOutline,
    prompt:
      "Look at the photo I've selected on the board and suggest what could make it a stronger image.",
  },
  // Detail · two photos — two photos as the only mark. Context here is the whole board.
  // Context-first: the board-aware questions lead, the pair-only ones trail.
  {
    type: "detail-two",
    label: "How do these two sit with the rest of my board?",
    icon: LocateOutline,
    prompt:
      "Look at the two photos I've selected and tell me how they sit within the rest of the photos on the board.",
  },
  {
    type: "detail-two",
    label: "Which of these two fits the board better?",
    icon: HelpCircleOutline,
    prompt:
      "Compare the two photos I've selected and tell me which one fits better with the rest of the photos on the board.",
  },
  {
    type: "detail-two",
    label: "Which of these two photos is stronger?",
    icon: StarOutline,
    prompt:
      "Compare the two photos I've selected on the board and tell me which one is stronger, and why.",
  },
  {
    type: "detail-two",
    label: "How do these two photos differ?",
    icon: GitCompareOutline,
    prompt:
      "Compare the two photos I've selected on the board and describe how they differ in mood, composition, and subject.",
  },
  // Local · one photo — one spotlighted photo inside a focus zone. Context here is the
  // surrounding focus group, NOT the board. Context-first: the group-aware questions lead.
  {
    type: "local-one",
    label: "How does this photo sit within its focus group?",
    icon: LocateOutline,
    prompt:
      "Look at the photo I've spotlighted and tell me how it sits within the focus group of photos around it.",
  },
  {
    type: "local-one",
    label: "Does this photo belong in its focus group?",
    icon: HelpCircleOutline,
    prompt:
      "Look at the photo I've spotlighted and tell me whether it belongs within the focus group of photos around it, and why.",
  },
  {
    type: "local-one",
    label: "What's the mood of this photo?",
    icon: SparklesOutline,
    prompt:
      "Look at the photo I've spotlighted and describe its mood and visual character.",
  },
  {
    type: "local-one",
    label: "What would make this photo stronger?",
    icon: ColorPaletteOutline,
    prompt:
      "Look at the photo I've spotlighted and suggest what could make it a stronger image.",
  },
  // Local · two photos — two spotlighted photos inside a focus zone. Context here is the
  // surrounding focus group, NOT the board. Context-first: the group-aware questions lead.
  {
    type: "local-two",
    label: "How do these two sit within their focus group?",
    icon: LocateOutline,
    prompt:
      "Look at the two photos I've spotlighted and tell me how they sit within the focus group of photos around them.",
  },
  {
    type: "local-two",
    label: "Which of these two fits the focus group better?",
    icon: HelpCircleOutline,
    prompt:
      "Compare the two photos I've spotlighted and tell me which one fits better within the focus group of photos around them.",
  },
  {
    type: "local-two",
    label: "Which of these two photos is stronger?",
    icon: StarOutline,
    prompt:
      "Compare the two photos I've spotlighted and tell me which one is stronger, and why.",
  },
  {
    type: "local-two",
    label: "How do these two photos differ?",
    icon: GitCompareOutline,
    prompt:
      "Compare the two photos I've spotlighted and describe how they differ in mood, composition, and subject.",
  },
];

/**
 * The "detail" pool's 4th pill, swapped on `hasSeparateGroups` rather than fixed in `PILLS`:
 * asking which "series" stands out only makes sense once the selection actually reads as
 * more than one spatial cluster, which is the one thing the static list cannot know.
 */
const DETAIL_SERIES_PILL = {
  label: "Which of these series stands out?",
  icon: SearchOutline,
  prompt:
    "Look at the series of photos I've selected on the board and tell me which one stands out the most, and why.",
};
const DETAIL_SINGLE_CLUSTER_PILL = {
  label: "What would you add next to this selection?",
  icon: LayersOutline,
  prompt:
    "Look at the photos I've selected on the board and suggest what other photo would fit well alongside them.",
};
const detailFourthPill = computed(() =>
  hasSeparateGroups.value ? DETAIL_SERIES_PILL : DETAIL_SINGLE_CLUSTER_PILL,
);

/**
 * The "local" pool's 4th pill, same swap as `detailFourthPill`: asking whether the
 * spotlighted photos would sit better in another group only makes sense once the focus
 * zone itself reads as more than one spatial cluster.
 */
const LOCAL_POSITION_PILL = {
  label: "At which position do my spotlighted photos belong?",
  icon: HelpCircleOutline,
  prompt:
    "Consider the photos I've spotlighted and tell me at which position they belong within the focus zone around them on the board.",
};
const LOCAL_OTHER_GROUP_PILL = {
  label: "Would these photos fit better in another group in the focus?",
  icon: GitCompareOutline,
  prompt:
    "Look at the photos I've spotlighted and tell me whether they would fit better in one of the other groups within my focus area on the board, and why.",
};
const localFourthPill = computed(() =>
  hasSeparateGroups.value ? LOCAL_OTHER_GROUP_PILL : LOCAL_POSITION_PILL,
);

/**
 * How many photos are selected at the current detail/local level — the number the pill set
 * keys off. At "detail" exactly one kind of mark is present, so it is whichever count is
 * non-zero; at "local" the subjects are the spotlighted photos. Zero at board level / no
 * session.
 */
const selectedCount = computed(() => {
  if (pillLevel.value === "detail") {
    return focusCount.value > 0 ? focusCount.value : spotlightCount.value;
  }
  if (pillLevel.value === "local") return spotlightCount.value;
  return 0;
});

/**
 * All the prompts for the current question level — empty with a bare board or no session.
 * At the detail/local levels the pool also flexes with how many photos are selected, AND the
 * count set is keyed by level so its context-aware questions reference the right thing: at
 * "detail" the photo(s) read against the whole board, at "local" against the surrounding
 * focus group. One photo → mostly context questions with a couple about the photo alone; two
 * photos → mostly context questions with a couple of pair-only comparisons; three or more →
 * the full group-aware set. Every branch returns exactly four pills.
 */
const activePool = computed(() => {
  const level = pillLevel.value;
  if (!level) return [];
  if (level === "detail" || level === "local") {
    if (selectedCount.value === 1)
      return PILLS.filter((p) => p.type === `${level}-one`);
    if (selectedCount.value === 2)
      return PILLS.filter((p) => p.type === `${level}-two`);
  }
  if (level === "detail")
    return [
      ...PILLS.filter((p) => p.type === "detail"),
      detailFourthPill.value,
    ];
  if (level === "local")
    return [...PILLS.filter((p) => p.type === "local"), localFourthPill.value];
  return PILLS.filter((p) => p.type === level);
});

/**
 * Keep the visible suggestions to three items, but rotate the window as the board config
 * moves so new prompts cycle in without changing the underlying pool. This lets the user
 * see different suggestions as their selection changes while still preserving the current
 * level's question family.
 */
const visiblePool = computed(() => {
  const pool = activePool.value;
  if (pool.length <= 3) return pool;

  const seed = `${pillLevel.value}|${selectedCount.value}|${boardCount.value}|${focusCount.value}|${spotlightCount.value}|${Number(hasSeparateGroups.value)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const start = hash % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, 3);
});

/**
 * An optional one-line aside under the suggestions, tied to the current marks — the quiet
 * counterpart to the pills: the pills say what you can ASK at this level, the tip explains
 * WHY this level behaves the way it does, or what turning one more mark on would buy you.
 * One tip at a time, keyed off the same focus/spotlight state the pill level reads, so it
 * always matches the boxes lit above. Null with a bare board's-worth of nothing, when there
 * is nothing to suggest and the empty hint stands in.
 */
const contextTip = computed(() => {
  const hasZone = focusCount.value > 0; // focus photos that are not also spotlighted
  const hasSpotlight = spotlightCount.value > 0;

  // Both levels at once: the one place the wider context shifts off the board and onto the
  // focus group, which is easy to miss since the marks look the same as either alone.
  if (hasSpotlight && hasZone)
    return "Here your spotlighted photos are read against the focus group around them, not the whole board.";

  // A focus zone alone: invite the second level that turns "detail" into "local".
  if (hasZone)
    return "Spotlight a photo inside your focus to add a second level and compare it against the group.";

  return null;
});

const pick = (pill) => {
  if (pill) emit("send-prompt", pill.prompt);
};
</script>

<style scoped>
.ccs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
  max-width: 620px;
  margin: 0 auto;
  padding: var(--spacing-lg);
  text-align: center;
}

.ccs-logo {
  color: var(--text-tertiary);
}

.ccs-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: var(--spacing-xs) 0 0;
}

.ccs-lead {
  margin: 0;
  /* max-width: 420px; */
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

/* Three across where the panel allows it, and one under the other when it does not: the
   order is what carries the hierarchy, so a stacked column still reads correctly. */
.ccs-levels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--spacing-sm);
  width: 100%;
  margin-top: var(--spacing-sm);
  text-align: left;
}

.ccs-level {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-surface);
}

/* Each level keeps the colour it is drawn with on the board, so the badge, the mark inside
   it and the ring around the photos are recognisably the same thing. */
.ccs-level--board {
  --ccs-level-color: var(--secondary-color);
}

.ccs-level--focus {
  --ccs-level-color: var(--primary-color);
}

.ccs-level--attached {
  --ccs-level-color: var(--accent-color);
}

.ccs-level-badge {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--ccs-level-color);
  background: color-mix(in srgb, var(--ccs-level-color) 14%, transparent);
}

.ccs-level-title {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
  color: var(--text-primary);
}

.ccs-level-text {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-tertiary);
}

.ccs-level-text strong {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

/* ── Nested layout: same three levels, boxed one inside the other ─────────── */
.ccsn {
  width: 100%;
  margin-top: var(--spacing-sm);
  text-align: left;
}

/* Two columns: a fixed square badge on the left, the title/scope/how lines stacked on the
   right — the same read as the original design. The badge is pinned to the top of the row
   (align-items: start) so it stays a true square and never deforms as the text wraps. */
.ccsn-level {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: start;
  gap: var(--spacing-sm);
  border-radius: 14px;
  padding: var(--spacing-md);
  border: 1px solid color-mix(in srgb, var(--ccsn-level-color) 22%, transparent);
  /* Colour lives only in the border and badge. The background is a neutral elevation, so
     no two levels share a hue-tinted fill (blue and purple read alike) and none looks
     muddy. The outer box sits on the container; each nested box adds a faint wash that
     stacks, so nesting reads as depth — inner boxes are progressively lighter. */
  background: var(--bg-container);
}

/* Same colour mapping as the columns layout, so a mark means the same thing in both. */
.ccsn-level--board {
  --ccsn-level-color: var(--secondary-color);
}

.ccsn-level--focus {
  --ccsn-level-color: var(--primary-color);
  margin-top: var(--spacing-sm);
}

.ccsn-level--attached {
  --ccsn-level-color: var(--accent-color);
  margin-top: var(--spacing-sm);
}

/* A nested level spans both columns of its parent, so it starts at the left edge under
   the parent's text rather than being pushed in by the parent's badge column. Its
   background is a faint wash that stacks over the parent, so nesting reads as depth —
   inner boxes are progressively lighter — rather than as a hue tint. */
.ccsn-level .ccsn-level {
  grid-column: 1 / -1;
  background: color-mix(in srgb, var(--text-primary) 5%, transparent);
}

/* A fixed 44px square, pinned to the top of the row by the grid's align-items: start. */
.ccsn-level-badge {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  color: var(--ccsn-level-color);
  background: color-mix(in srgb, var(--ccsn-level-color) 16%, transparent);
}

.ccsn-level-body {
  min-width: 0;
}

.ccsn-level-title {
  margin: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
  color: var(--text-primary);
}

.ccsn-level-text {
  margin: 2px 0 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
  color: var(--text-tertiary);
}

.ccsn-level-text strong {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

/* Third line, a rung below the scope text: how to make the selection. Smaller and tinted
   with the level's own colour so it reads as an aside, not part of the description. */
.ccsn-level-how {
  margin: 5px 0 0;
  font-size: var(--font-size-xs);
  line-height: 1.4;
  font-weight: var(--font-weight-medium);
  color: color-mix(in srgb, var(--ccsn-level-color) 70%, var(--text-tertiary));
}

/* The Ctrl/⌘ + box shortcut sits at the level's own colour, kept on one line. */
.ccsn-level-how strong {
  color: color-mix(in srgb, var(--ccsn-level-color) 85%, var(--text-secondary));
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

/* The spotlight glyph inline in a sentence, riding on the text's own line. */
.ccs-inline-icon {
  vertical-align: -0.15em;
}

/* A little dashed square standing in for the drag-selection box. */
.ccs-box {
  display: inline-block;
  width: 0.72em;
  height: 0.72em;
  border: 1.5px dashed currentColor;
  border-radius: 2px;
  vertical-align: -0.04em;
}

/* ── Take-tutorial / back buttons ─────────────────────────────────────────── */
.ccs-tutorial-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.ccs-tutorial-btn:hover {
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-surface));
  color: var(--text-primary);
}

.ccs-tutorial-btn-arrow {
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}

.ccs-tutorial-btn:hover .ccs-tutorial-btn-arrow {
  transform: translateX(2px);
}

.ccs-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--spacing-sm);
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: color 0.15s ease;
}

.ccs-back:hover {
  color: var(--text-secondary);
}

/* Dropped to the foot of the walkthrough, below the suggestions and the tip, so it reads as
   the screen's footer rather than sitting in the middle of the content. */
.ccs-back--footer {
  margin-top: var(--spacing-lg);
}

/* ── Tutorial: the optional contextual tip ────────────────────────────────── */
/* A quiet aside, not a fifth pill: narrower than the boxes, matched to the suggestions'
   measure, with a bulb to mark it as guidance rather than something to click. The faint
   primary wash sets it apart from the suggestions above without competing with them. */
.ccs-tip {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  width: 100%;
  max-width: 520px;
  margin: var(--spacing-md) 0 0;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  /* background: color-mix(in srgb, var(--primary-color) 6%, var(--bg-surface)); */
  text-align: left;
}

.ccs-tip-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--primary-color);
}

.ccs-tip-text {
  font-size: var(--font-size-xs);
  line-height: 1.5;
  color: var(--text-secondary);
}

/* Fades and settles in when the marks change the tip, matching the pills' entrance. */
.ccs-tip-enter-active,
.ccs-tip-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.ccs-tip-enter-from,
.ccs-tip-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── Tutorial: the level's framed mark inline with its title ───────────────── */
/* The mark keeps its tinted frame, as on the overview, but sits beside the title rather than
   above it — a heading with its badge, not a legend square over a caption. */
.ccs-level-title--inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The same badge as the overview, sized down to ride on the title's line. */
.ccs-level-badge--inline {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex-shrink: 0;
}

/* ── Tutorial: the count tag at the foot of each box, and the active glow ──── */
/* The same icon-count-label tag as before, now the last line of its box. `margin-top: auto`
   pins it to the foot so the tags line up across the row however long the text above runs
   (the grid stretches every box to the tallest). */
.ccs-level-tag {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  margin-top: auto;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: var(--font-size-sm);
  background: color-mix(in srgb, var(--ccs-level-color) 12%, transparent);
}

.ccs-level-tag-mark {
  flex-shrink: 0;
  color: var(--ccs-level-color);
}

.ccs-level-tag-count {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--ccs-level-color) 80%, var(--text-primary));
}

.ccs-level-tag-label {
  color: var(--text-tertiary);
}

/* A level holding nothing drops to neutral grey — present so the row always reads as three
   levels, quiet so the eye goes to what is actually selected. */
.ccs-level-tag.is-zero {
  background: color-mix(in srgb, var(--text-tertiary) 10%, transparent);
}

.ccs-level-tag.is-zero .ccs-level-tag-mark,
.ccs-level-tag.is-zero .ccs-level-tag-count {
  color: var(--text-tertiary);
}

/* The level the current suggestion belongs to: its box lights up in its own colour — a
   tinted fill, a coloured edge and a soft glow — so the box and the pill below read as one
   thing, and it is obvious which level you are at. */
.ccs-level.is-active {
  border-color: color-mix(in srgb, var(--ccs-level-color) 55%, transparent);
  background: color-mix(in srgb, var(--ccs-level-color) 10%, var(--bg-surface));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ccs-level-color) 30%, transparent),
    0 6px 20px color-mix(in srgb, var(--ccs-level-color) 16%, transparent);
}

.ccs-level.is-active .ccs-level-tag {
  background: color-mix(in srgb, var(--ccs-level-color) 22%, transparent);
}

.ccs-suggest-empty {
  margin: var(--spacing-md) 0 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-tertiary);
}

/* ── Suggestion pills: every question for the current level, shown together ─── */
.ccs-suggest {
  position: relative; /* anchors a leaving pill's absolute positioning, see .ccs-pill-leave-active */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  width: 100%;
  /* Narrower than the row of boxes: a pill stretched to 620px reads as a banner. */
  max-width: 450px;
  margin-top: var(--spacing-md);
}

.ccs-suggest-lead {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  opacity: 0.7;
}

.ccs-pill {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.ccs-pill:hover {
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-surface));
  color: var(--text-primary);
}

.ccs-pill-icon {
  flex-shrink: 0;
  color: var(--primary-color);
}

.ccs-pill-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccs-pill-send {
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: color 0.15s ease;
}

.ccs-pill:hover .ccs-pill-send {
  color: var(--primary-color);
}

/* The whole list swaps at once when the marks change level: each pill fades and rises in,
   the "lead" label included since it shares the same TransitionGroup. `move` animates a
   pill sliding to a new slot when one above it is removed, so the list resettles instead
   of jumping. Absolute positioning on leave lets the remaining pills already be animating
   into their new slots while the leaving one fades in place, rather than the whole group
   waiting for it to finish. */
.ccs-pill-enter-active,
.ccs-pill-leave-active,
.ccs-pill-move {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.ccs-pill-enter-from,
.ccs-pill-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.ccs-pill-leave-active {
  position: absolute;
  width: 100%;
}
</style>
