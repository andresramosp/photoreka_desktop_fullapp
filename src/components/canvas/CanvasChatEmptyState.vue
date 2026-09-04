<template>
  <div class="ccs">
    <AppLogo layout="icon" :height="52" class="ccs-logo" />

    <h2 class="ccs-title">Chat with your canvas</h2>

    <div class="ccs-points">
      <div class="ccs-point">
        <!-- Dashed purple ring: the outer halo, standing for the whole board as ambient
             context — matches the canvas's outer ring in colour and dash. -->
        <svg
          class="ccs-mark ccs-mark--global"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="3 2.2"
          />
        </svg>
        <span>
          Chatlab is aware of <strong>every photo on the board</strong> as
          general context and the overall sense of your canvas.
        </span>
      </div>
      <div class="ccs-point">
        <!-- Filled cyan disc: the focus halo the model actually looks through — matches the
             canvas's central filled glow in colour. -->
        <svg
          class="ccs-mark ccs-mark--focus"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5" />
        </svg>
        <span>
          Use the circular <strong>halo</strong> to focus on specific images and
          ask more targeted questions. Or select them yourself by clicking, or
          <strong
            >{{ isMac ? "⌘" : "Ctrl" }} +
            <span class="ccs-box" aria-hidden="true"></span
          ></strong>
          to drag a box.
        </span>
      </div>
      <div class="ccs-point">
        <n-icon :size="16" class="ccs-point-icon"><HandLeftOutline /></n-icon>
        <span>
          <strong>Drag any photo</strong> from a response straight onto the
          canvas.
        </span>
      </div>
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
 * distinction — the chat KNOWS the whole board but only SEES what is under the halo —
 * and three lines with their own icons carry that where two fields of text could not.
 * The host owns its blank state; ChatView just renders whatever `uiConfig.emptyState`
 * hands it, and listens for `send-prompt` to fire a pill's question.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import {
  HandLeftOutline,
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
import { useCanvasChatSession } from "@/composables/useCanvasChat";

defineOptions({ name: "CanvasChatEmptyState" });

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
  max-width: 340px;
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

.ccs-points {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  text-align: left;
  margin-top: var(--spacing-xs);
}

.ccs-point {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-tertiary);
}

.ccs-point-icon {
  color: var(--primary-color);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Scope marks that mirror the canvas halos: a filled accent disc for the focus halo, a
   dashed secondary ring for the whole-board context. */
.ccs-mark {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.ccs-mark--focus {
  fill: var(--accent-color);
}

.ccs-mark--global {
  color: var(--secondary-color);
}

.ccs-point strong {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
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
