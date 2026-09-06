<template>
  <div class="ccc" ref="rootEl" :style="maxHeightStyle">
    <header class="ccc-header">What the chat can see</header>

    <div class="ccc-body">
      <!-- 1 · The board. Never described photo by photo — it reaches the agent as a
         searchable set and as an exclusion, which is why the wording is about reach,
         not sight. -->
      <section class="ccc-section">
        <div class="ccc-row">
          <CanvasScopeMark type="board" :size="markSize" />
          <div class="ccc-row-text">
            <span class="ccc-row-title">
              <strong>{{ boardCount }}</strong>
              {{ boardCount === 1 ? "photo" : "photos" }} on the canvas
            </span>
            <span class="ccc-row-note">
              Acting as global, metadata based context
            </span>
          </div>
        </div>
      </section>

      <!-- 2 · The focus. The part of the board being worked on — the ones the model
         actually looks at. -->
      <section class="ccc-section">
        <div class="ccc-row">
          <!-- The same mark whether the focus came from the halo or from picking photos by
               hand: they are two ways of marking the SAME level, not two levels. -->
          <CanvasScopeMark type="focus" :size="markSize" />
          <div class="ccc-row-text">
            <span class="ccc-row-title">
              <strong>{{ focusOnly.length }}</strong>
              {{ focusOnly.length === 1 ? "photo" : "photos" }} in focus
              <span v-if="isTruncated" class="ccc-row-badge">
                of {{ focusedTotal }} selected
              </span>
            </span>
            <span class="ccc-row-note">{{ focusNote }}</span>
          </div>
        </div>

        <!-- Four across, so twelve is three tidy rows and the cap has a shape the user can
           recognise before they hit it. -->
        <div v-if="focusOnly.length > 0" class="ccc-grid">
          <div
            v-for="photo in focusOnly"
            :key="photo.id"
            class="ccc-thumb"
            :title="photo.originalFileName || photo.name"
          >
            <img :src="photo.thumbnailUrl || photo.src" alt="" loading="lazy" />
          </div>
        </div>

        <p v-else-if="focusEmptyMessage" class="ccc-empty">
          {{ focusEmptyMessage }}
        </p>

        <p v-if="isTruncated" class="ccc-truncated">
          Only the first {{ maxFocused }} in reading order are sent. The rest
          are dimmed on the board.
        </p>
      </section>

      <!-- 3 · The spotlight — the subject. Always drawn, even at zero: the three sections are
         the three levels, and a panel that hides one when it is empty teaches two levels
         instead of three. The note carries the difference. -->
      <section class="ccc-section">
        <div class="ccc-row">
          <n-icon :size="markSize" class="ccc-row-icon"
            ><FlashlightOutline
          /></n-icon>
          <div class="ccc-row-text">
            <span class="ccc-row-title">
              <strong>{{ attachedPhotos.length }}</strong>
              {{ attachedPhotos.length === 1 ? "photo" : "photos" }} in the
              spotlight
            </span>
            <span class="ccc-row-note">{{ attachedNote }}</span>
          </div>
        </div>

        <div v-if="hasAttachments" class="ccc-grid">
          <div
            v-for="photo in attachedPhotos"
            :key="photo.id"
            class="ccc-thumb"
            :title="photo.originalFileName || photo.name"
          >
            <img :src="photo.thumbnailUrl || photo.src" alt="" loading="lazy" />
          </div>
        </div>
      </section>

      <!-- Only the selection has anything to undo from here. The halo's on/off lives in the
         panel's header now, beside "Canvas only" — both are switches that change what the
         next turn carries, so they belong on the same shelf rather than one of them being
         buried under a hover. -->
      <footer v-if="!isPast && isSelectionFocus" class="ccc-footer">
        <n-button size="tiny" @click="emit('clear-focus')">
          Clear selection
        </n-button>
      </footer>
    </div>
  </div>
</template>

<script setup>
/**
 * What the canvas chat is being told, in the three forms it comes in — the board it
 * KNOWS, the focus it LOOKS at, and the attached photos it is ASKED about.
 *
 * The three sections PARTITION the photos: each one appears exactly once, under the role
 * it plays. A photo that is both attached and in the focus is shown under **attached**,
 * because that is the finer role — the focus is then the rest, the zone around it. Two
 * thumbnails of one photo would read as two photos, and marking it in place made the
 * reader hunt for the mark.
 *
 * One component, two modes. `live` is the header popover, describing the turn about to be
 * sent, with the controls that change it. `past` is the same picture kept beside a user's
 * message, so a reply's subject survives the board's focus moving on. The wording is the
 * same in both — a record that renamed every level would read as a different panel — so
 * only the controls differ: no footer on a record, nothing left to change.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { NButton, NIcon } from "naive-ui";
import { FlashlightOutline } from "@vicons/ionicons5";
import CanvasScopeMark from "@/components/canvas/CanvasScopeMark.vue";

defineOptions({ name: "CanvasChatContext" });

const props = defineProps({
  /** 'live' (the composer's context, editable) or 'past' (a record on a sent message). */
  mode: { type: String, default: "live" },
  /** Every photo on the board. */
  boardCount: { type: Number, default: 0 },
  /** The photos actually sent as images — already capped. */
  focusedPhotos: { type: Array, default: () => [] },
  /** How many the focus holds in total; larger than the above when truncated. */
  focusedTotal: { type: Number, default: 0 },
  /** The photos attached to the message — the subject. Empty when there are none. */
  attachedPhotos: { type: Array, default: () => [] },
  maxFocused: { type: Number, default: 12 },
  /** 'halo' (ambient, follows the view) or 'selection' (picked by hand). */
  focusSource: { type: String, default: "halo" },
});

const emit = defineEmits(["clear-focus"]);

/** Kept in sync with `--ccc-mark` in the styles below — the thumbnails indent by it. */
const markSize = 16;

const isPast = computed(() => props.mode === "past");
const isSelectionFocus = computed(() => props.focusSource === "selection");
// `focusedTotal` is only meaningful live; a record stores just what was sent. Measured
// against the whole focus, not the partitioned half: it is about the cap, and a photo
// promoted to `attached` was still sent.
const isTruncated = computed(
  () => !isPast.value && props.focusedTotal > props.focusedPhotos.length,
);

const hasAttachments = computed(() => props.attachedPhotos.length > 0);

/**
 * Which level the question is ABOUT: the finer of the two that holds photos, an attachment
 * beating the focus. The board is never it — it is context whatever else is picked, and
 * calling the whole canvas the subject one moment and a photo the next would make the
 * label look like it moves at random.
 *
 * `null` when neither holds anything: with nothing picked there is no subject yet, and
 * both lines fall back to describing what that level WOULD hold.
 */
const subjectLevel = computed(() => {
  if (hasAttachments.value) return "attached";
  if (props.focusedPhotos.length > 0) return "focus";
  return null;
});

const focusNote = computed(() => {
  if (subjectLevel.value === "attached")
    return "The zone around what you asked about";
  if (subjectLevel.value === "focus") return "The subject of your question";
  return "The zone you are working on — under the halo, or a drag-box";
});

const attachedNote = computed(() => {
  if (hasAttachments.value) return "The subject of your question";
  return "Photos you spotlight — the detail inside the focus";
});

/** Ids as strings: the live path carries them as strings, the board's as numbers. */
const attachedIds = computed(
  () => new Set(props.attachedPhotos.map((photo) => String(photo.id))),
);

/** The focus MINUS whatever is attached — see the partition note above. */
const focusOnly = computed(() =>
  props.focusedPhotos.filter(
    (photo) => !attachedIds.value.has(String(photo.id)),
  ),
);

/**
 * Empty, but only where the emptiness needs explaining. A focus of nothing is already
 * stated by the "0 photos in focus" line above it, so a paragraph repeating that in longer
 * words is noise; the case below says something the count does not.
 */
const focusEmptyMessage = computed(() => {
  // Not an empty focus: everything in it is the subject, and is shown as such below.
  if (props.focusedPhotos.length > 0)
    return "Everything in focus is spotlighted — shown below as the subject.";
  return "";
});

/**
 * How tall the panel is allowed to get. It floats in a hover popover, and the room it has
 * depends entirely on which way that popover opened: anchored above the composer with the
 * whole panel's height free below, a fixed cap clips the focus grid for nothing; flipped
 * down against the footer, it genuinely has to stop short and let the body scroll. So the
 * cap is not a constant — it is measured from the popover's pinned edge to the viewport
 * edge it grows toward, and only then does `.ccc-body` start scrolling.
 */
const rootEl = ref(null);
const availHeight = ref(null);

const maxHeightStyle = computed(() =>
  availHeight.value ? { maxHeight: `${availHeight.value}px` } : null,
);

// Below this the panel is unusable; better to spill a few px off-screen than to show a sliver.
const MIN_HEIGHT = 220;
// Kept clear between the panel and the viewport edge it opens toward.
const EDGE_GAP = 12;

function measureAvailableHeight() {
  const el = rootEl.value;
  if (!el) return;
  // n-popover nests us — even when `raw` — inside vueuc's follower, which carries the
  // resolved, post-flip placement as its `v-placement` attribute. That says which edge is
  // pinned to the trigger, and therefore which way the panel is free to grow.
  const follower = el.closest(".v-binder-follower-content");
  const placement = follower?.getAttribute("v-placement") || "top";
  const rect = (follower || el).getBoundingClientRect();
  const viewportH = window.innerHeight;

  let room;
  if (placement.startsWith("bottom")) {
    room = viewportH - rect.top - EDGE_GAP; // pinned at its top, grows down
  } else if (placement.startsWith("top")) {
    room = rect.bottom - EDGE_GAP; // pinned at its bottom, grows up
  } else {
    room = viewportH - 2 * EDGE_GAP; // left/right: centred, just stay on screen
  }

  availHeight.value = Math.max(MIN_HEIGHT, Math.round(room));
}

let placementObserver = null;

onMounted(async () => {
  // vueuc positions the follower in its own onMounted, which runs after this one; wait a
  // tick and a frame so we read where it actually landed, not where it started.
  await nextTick();
  requestAnimationFrame(measureAvailableHeight);

  window.addEventListener("resize", measureAvailableHeight);
  window.addEventListener("scroll", measureAvailableHeight, true);

  const follower = rootEl.value?.closest(".v-binder-follower-content");
  if (follower && "MutationObserver" in window) {
    // A scroll can make vueuc flip the popover to the opposite side — re-measure when it does.
    placementObserver = new MutationObserver(measureAvailableHeight);
    placementObserver.observe(follower, {
      attributes: true,
      attributeFilter: ["v-placement"],
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", measureAvailableHeight);
  window.removeEventListener("scroll", measureAvailableHeight, true);
  placementObserver?.disconnect();
});
</script>

<style scoped>
/* The popover carries its own chrome — it is rendered `raw`, with no Naive container.
   Naive's default popover colour is `--bg-container`, which is EXACTLY what a chat bubble
   uses, so over this chat the panel had no edge at all. `--bg-surface` is the next step up
   the theme's elevation ladder, plus the border and lift the canvas manager's popover
   already uses. */
.ccc {
  /* The mark and the gap after it. Everything under a row — thumbnails, empty and
     truncation notes — indents by their sum, so a section's contents line up with its
     title instead of restarting under the mark. */
  --ccc-mark: 16px;
  --ccc-mark-gap: 6px;
  --ccc-indent: calc(var(--ccc-mark) + var(--ccc-mark-gap));
  /* The body's padding, shared with the section rules so they can bleed to the panel's
     edges by negating exactly this. */
  --ccc-pad: var(--spacing-md);

  width: 340px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color-hover, var(--border-color));
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  /* Never taller than the room it actually has: the header stays pinned and the body
     scrolls. The real cap is set in JS, measured from the popover's pinned edge to the
     viewport edge it opens toward (see measureAvailableHeight) — roomy when it opens into
     open space, tight only when it flips against the footer. This value just covers the
     first frame before that runs. */
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 24px);
}

/* Titled bar, same shape as the canvas manager's popover header.
   `--border-color-hover`, not `--border-color`: in the dark theme the latter is #2c2c32,
   the exact value of `--bg-surface` under it, so a rule drawn in it is invisible here.
   Same reason the panel's own border uses it. */
.ccc-header {
  padding: 10px var(--ccc-pad) 8px;
  border-bottom: 1px solid var(--border-color-hover, var(--border-color));
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ccc-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--ccc-pad);
  overflow-y: auto;
  min-height: 0;
}

/* Tighter than the gap BETWEEN sections, so a section's thumbnails read as belonging to
   the title above them rather than floating between two levels. */
.ccc-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Edge-to-edge rules between the levels, drawn like the header's: a divider that stops
   short of the panel's sides reads as part of the text block above it rather than as the
   boundary between two things. */
.ccc-section + .ccc-section,
.ccc-section + .ccc-footer {
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color-hover, var(--border-color));
  margin-inline: calc(var(--ccc-pad) * -1);
  padding-inline: var(--ccc-pad);
}

/* The mark sits on the title's line, not centred on the pair: it belongs to the heading,
   and the note under it is a caption. The title's line-height is the mark's size so the
   two line boxes coincide exactly, with no nudging. */
.ccc-row {
  display: flex;
  align-items: flex-start;
  gap: var(--ccc-mark-gap);
}

/* The spotlight row — the only row using this icon; board and focus draw their own
   CanvasScopeMark. Accent, the spotlight level's colour. */
.ccc-row-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.ccc-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* The count is the claim, the note explains it — so the title carries the size and the
   full-strength colour, and the note steps down in both. */
.ccc-row-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--ccc-mark);
  color: var(--text-primary);
}

.ccc-row-title strong {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.ccc-row-badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--warning-color, #f59e0b);
  background: color-mix(
    in srgb,
    var(--warning-color, #f59e0b) 14%,
    transparent
  );
}

.ccc-row-note {
  display: block;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.35;
}

/* Four across: twelve then reads as three tidy rows, so the cap has a shape the user
   recognises before they reach it. */
.ccc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding-left: var(--ccc-indent);
}

.ccc-thumb {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-surface);
}

.ccc-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ccc-empty,
.ccc-truncated {
  margin: 0;
  padding-left: var(--ccc-indent);
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}

.ccc-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
