<template>
  <div class="ccs">
    <AppLogo layout="icon" :height="52" class="ccs-logo" />

    <h2 class="ccs-title">Chat with your canvas</h2>
    <p class="ccs-lead">
      Every answer is built from three levels of context, from the board down to
      a single photo.
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
              The photos under the halo (or a drag-box) define the working area.
            </p>
            <p class="ccsn-level-how">
              Move the halo over the photos, or
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
                Use it to refer to specific photos within the focus area.
              </p>
              <p class="ccsn-level-how">Click any photo to single it out.</p>
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
          The photos under the halo (or a drag-box) define the area in which you
          work.
        </p>
      </section>

      <section class="ccs-level ccs-level--attached">
        <span class="ccs-level-badge">
          <n-icon :size="20"><FlashlightOutline /></n-icon>
        </span>
        <h3 class="ccs-level-title">The spotlight</h3>
        <p class="ccs-level-text">
          Optionally, click a photo to spotlight it — a level of detail that
          lets you ask about specific shots within the focus.
        </p>
      </section>
    </div>

    <!-- Rotating suggestion pill. One at a time, swapped every few seconds, so a narrow
         column can offer a starting point without a wall of cards. The pool is filtered to
         the board's current state (see `activePool`): focus prompts only appear while
         something is under the halo, board prompts only once photos are placed — so whatever
         shows is always something the user can actually act on right now. With a blank board
         and no focus nothing is eligible, and the pill simply doesn't render. -->
    <div v-if="currentPill" class="ccs-suggest">
      <span class="ccs-suggest-lead">Try asking</span>
      <Transition name="ccs-pill" mode="out-in">
        <button
          :key="currentPill.prompt"
          type="button"
          class="ccs-pill"
          @click="pick(currentPill)"
        >
          <n-icon :size="15" class="ccs-pill-icon">
            <component :is="currentPill.icon" />
          </n-icon>
          <span class="ccs-pill-text">{{ currentPill.label }}</span>
          <n-icon :size="14" class="ccs-pill-send">
            <ArrowUpCircleOutline />
          </n-icon>
        </button>
      </Transition>
    </div>
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
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
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
  ArrowUpCircleOutline,
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

// ── The board's live state, read from the host's session ─────────────────────
// Null when this component is somehow mounted outside a canvas; then no pool matches
// and the pills simply don't render.
const session = useCanvasChatSession();

/** Photos are placed on the board (not counting the trash zone). */
const boardHasPhotos = computed(
  () => (session?.boardPhotoIdSet?.value?.size ?? 0) > 0,
);

/** Something is under the halo, or hand-picked — the chat has a focus to talk about. */
const hasFocus = computed(() => (session?.focusedCount?.value ?? 0) > 0);

// ── The pills ────────────────────────────────────────────────────────────────
// `type` decides when a pill is eligible, never touched by the model:
//   focus  — needs photos under the halo / hand-picked
//   board  — a general question about the placed photos
const PILLS = [
  {
    type: "focus",
    label: "What connects these focused photos?",
    icon: ScanOutline,
    prompt:
      "Look at the photos I have in focus on the canvas and tell me what mood, theme, or story connects them.",
  },
  {
    type: "focus",
    label: "Which of these is the strongest?",
    icon: StarOutline,
    prompt:
      "Compare the photos I'm focusing on the canvas and tell me which one is the strongest, and why.",
  },
  {
    type: "focus",
    label: "Find more photos like these ones",
    icon: SearchOutline,
    prompt:
      "Find photos in my library that share the mood and subject of the ones I'm focusing on the canvas.",
  },
  {
    type: "board",
    label: "What's the overall mood of my board?",
    icon: SparklesOutline,
    prompt:
      "Look at all the photos on my canvas and describe the overall mood and visual direction they create together.",
  },
  {
    type: "board",
    label: "What kind of shot is missing here?",
    icon: ColorPaletteOutline,
    prompt:
      "Analyze the photos on my canvas and tell me what kind of shot is missing to make the set feel more complete.",
  },
  {
    type: "board",
    label: "Suggest a compelling order for these",
    icon: LayersOutline,
    prompt:
      "Suggest a compelling sequence for the photos on my canvas and explain the narrative flow you see.",
  },
  {
    type: "board",
    label: "Find the most unexpected pairings",
    icon: ShuffleOutline,
    prompt:
      "Look at the photos on my canvas and find the most curious, unexpected pairings between them. Explain what makes each odd couple work.",
  },
];

/** Only the pills that make sense for the board as it stands right now. */
const activePool = computed(() =>
  PILLS.filter((p) => {
    if (p.type === "focus") return hasFocus.value;
    return boardHasPhotos.value; // board
  }),
);

const index = ref(0);

const currentPill = computed(() => {
  const pool = activePool.value;
  if (!pool.length) return null;
  return pool[index.value % pool.length];
});

const pick = (pill) => {
  if (pill) emit("send-prompt", pill.prompt);
};

// ── Rotation ─────────────────────────────────────────────────────────────────
const ROTATE_MS = 5000;
let timer = null;

const stopRotation = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const startRotation = () => {
  stopRotation();
  // A single eligible pill has nothing to rotate to — leave it sitting there.
  if (activePool.value.length <= 1) return;
  timer = setInterval(() => {
    index.value = (index.value + 1) % activePool.value.length;
  }, ROTATE_MS);
};

// The pool changes as photos are placed or focused. Keep the index in range and restart
// the clock so the freshly relevant pill gets its full turn on screen.
watch(
  () => activePool.value.length,
  (len) => {
    if (index.value >= len) index.value = 0;
    startRotation();
  },
);

onMounted(startRotation);
onBeforeUnmount(stopRotation);
</script>

<style scoped>
.ccs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
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
  color: var(--text-tertiary);
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

/* A little dashed square standing in for the drag-selection box. */
.ccs-box {
  display: inline-block;
  width: 0.72em;
  height: 0.72em;
  border: 1.5px dashed currentColor;
  border-radius: 2px;
  vertical-align: -0.04em;
}

/* ── Rotating suggestion pill ─────────────────────────────────────────────── */
.ccs-suggest {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  width: 100%;
  /* Narrower than the row of boxes: a pill stretched to 620px reads as a banner. */
  max-width: 420px;
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

/* The "cool slide": the outgoing pill leaves to the left and fades, the incoming one
   slides in from the right — one at a time, thanks to out-in. */
.ccs-pill-enter-active,
.ccs-pill-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.ccs-pill-enter-from {
  opacity: 0;
  transform: translateX(28px);
}

.ccs-pill-leave-to {
  opacity: 0;
  transform: translateX(-28px);
}
</style>
