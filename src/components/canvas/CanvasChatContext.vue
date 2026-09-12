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
            <span class="ccc-row-note">{{ boardNote }}</span>
          </div>
        </div>
      </section>

      <!-- 2a · The region. Drawn like the board above and for the same reason: a count and
           a sentence, no photos. The chat is shown none of these and is told nothing about
           how they sit, so a crop of the board here would promise an arrangement it never
           received. Identical live and past, which is what lets a sent message keep it. -->
      <section v-if="regionMode" class="ccc-section">
        <div class="ccc-row">
          <CanvasScopeMark type="region" :size="markSize" />
          <div class="ccc-row-text">
            <span class="ccc-row-title">
              <strong>{{ regionCount }}</strong>
              {{ regionCount === 1 ? "photo" : "photos" }} in the region
            </span>
            <!-- Exactly one row must read "the subject of your question": it is how the
                 panel says which level the turn is actually ABOUT. A region is a subject
                 like any other, just one the chat reaches without looking at it — so that
                 caveat rides along on the same line instead of replacing it. -->
            <span class="ccc-row-note">
              The subject of your question — metadata only, no images
            </span>
          </div>
        </div>

        <!-- Live only: it tells the user what to do next, and there is nothing left to do
             about a turn already sent. The row's note above says what this level IS, the
             way every other level's does; the way out of it belongs here instead, so the
             subject line is never crowded off by an instruction. -->
        <p v-if="!isPast" class="ccc-note">
          Select {{ maxFocused }} or fewer to turn it into a focus the chat can
          look at.
        </p>
      </section>

      <!-- 2b · The focus, and the spotlight nested inside it.

         Past messages keep the old split, since a reconstructed photo carries no board
         geometry to draw a crop from. Live, the two collapse into one spatial section: the
         photos are laid out as a scaled crop of the board rectangle they actually occupy —
         not a uniform grid — with the spotlighted ones marked in place instead of listed a
         second time. -->
      <template v-else-if="isPast">
        <section class="ccc-section">
          <div class="ccc-row">
            <CanvasScopeMark type="focus" :size="markSize" />
            <div class="ccc-row-text">
              <span class="ccc-row-title">
                <strong>{{ focusOnly.length }}</strong>
                {{ focusOnly.length === 1 ? "photo" : "photos" }} in focus
              </span>
              <span class="ccc-row-note">{{ focusNote }}</span>
            </div>
          </div>

          <div v-if="focusOnly.length > 0" class="ccc-grid">
            <div
              v-for="photo in focusOnly"
              :key="photo.id"
              class="ccc-thumb"
              :title="photo.originalFileName || photo.name"
            >
              <img
                :src="photo.thumbnailUrl || photo.src"
                alt=""
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <section class="ccc-section">
          <div class="ccc-row">
            <n-icon :size="markSize" class="ccc-row-icon"
              ><FlashlightOutline
            /></n-icon>
            <div class="ccc-row-text">
              <span class="ccc-row-title">
                <strong>{{ spotlightedPhotos.length }}</strong>
                {{ spotlightedPhotos.length === 1 ? "photo" : "photos" }} in the
                spotlight
              </span>
              <span class="ccc-row-note">{{ spotlightNote }}</span>
            </div>
          </div>

          <div v-if="hasSpotlight" class="ccc-grid">
            <div
              v-for="photo in spotlightedPhotos"
              :key="photo.id"
              class="ccc-thumb"
              :title="photo.originalFileName || photo.name"
            >
              <img
                :src="photo.thumbnailUrl || photo.src"
                alt=""
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </template>

      <!-- Live: the focus — or, when the selection ran past what the chat can be shown,
           the REGION it became: same photos, drawn dimmed, because the chat reaches them
           as metadata and looks at none of them. -->
      <section v-else class="ccc-section">
        <div class="ccc-row">
          <CanvasScopeMark type="focus" :size="markSize" />
          <div class="ccc-row-text">
            <span class="ccc-row-title">
              <strong>{{ sentFocusCount }}</strong>
              {{ sentFocusCount === 1 ? "photo" : "photos" }} in focus
            </span>
            <span class="ccc-row-note">{{ liveFocusNote }}</span>
          </div>
          <!-- <n-button
            v-if="hasSpotlight"
            class="ccc-row-action"
            size="tiny"
            quaternary
            @click="emit('clear-spotlight')"
          >
            Clear spotlight
          </n-button> -->
        </div>

        <!-- A scaled crop of the rectangle these photos actually span on the board — real
           relative position, size and overlap, rather than a schematic grid. Won't always
           match the canvas pixel for pixel (a spotlight picked from far away widens the
           crop to reach it), but it's the same arrangement the agent reads, not a stand-in
           for it. -->
        <div v-if="combinedPhotos.length > 0" class="ccc-spatial">
          <div class="ccc-spatial-canvas" :style="previewBoxStyle">
            <div
              v-for="photo in combinedPhotos"
              :key="photo.id"
              class="ccc-spatial-thumb"
              :class="{ 'ccc-spatial-thumb--spotlight': isSpotlighted(photo) }"
              :style="spatialThumbStyle(photo)"
              @mouseenter="onThumbHover(photo, $event)"
              @mouseleave="onThumbUnhover"
            >
              <img
                :src="photo.thumbnailUrl || photo.src"
                alt=""
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <p v-if="hasSpotlight" class="ccc-spatial-legend">
          <span class="ccc-spatial-legend-dot" />
          {{ spotlightedPhotos.length }}
          {{ spotlightedPhotos.length === 1 ? "photo" : "photos" }} spotlighted
          — the subject of your question
        </p>
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

    <!-- The crop's own hover preview — same idea as the atlas's photo-tooltip (Photos2D.vue):
       a name told nothing about a thumbnail this small, the image itself does. A sibling of
       `.ccc-body`, not nested in it, so its scrolling never clips or drags the tooltip. -->
    <div
      v-if="hoveredThumbPhoto"
      ref="tooltipRef"
      class="ccc-thumb-tooltip"
      :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
    >
      <img
        :src="hoveredThumbPhoto.thumbnailUrl || hoveredThumbPhoto.src"
        alt=""
      />
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
import { useSmartTooltipPosition } from "@/composables/useSmartTooltipPosition.js";

defineOptions({ name: "CanvasChatContext" });

const props = defineProps({
  /** 'live' (the composer's context, editable) or 'past' (a record on a sent message). */
  mode: { type: String, default: "live" },
  /** Every photo on the board. */
  boardCount: { type: Number, default: 0 },
  /** Every photo the user marked out — the focus, or the whole region when it is one. */
  focusedPhotos: { type: Array, default: () => [] },
  /**
   * The photos spotlighted on the board — the subject. Board state, like the focus around
   * it: NOT the composer's attachments, which are photos brought in from outside the board
   * and live in the composer's own strip.
   */
  spotlightedPhotos: { type: Array, default: () => [] },
  /** The most photos the chat can be shown — past it a selection becomes a region. */
  maxFocused: { type: Number, default: 12 },
  /** 'halo' (ambient, follows the view) or 'selection' (picked by hand). */
  focusSource: { type: String, default: "halo" },
  /** Focus ids actually sent. Empty as a region, where `focusedPhotos` still holds the selection. */
  sentFocusedIds: { type: Array, default: () => [] },
  /**
   * The selection ran past `maxFocused` and travels as a REGION: its photos reach the chat
   * as metadata, none as an image. Replaces the focus section entirely — see the template.
   */
  regionMode: { type: Boolean, default: false },
  /**
   * How many photos that region holds. A count rather than the photos themselves: nothing
   * about them is shown, which is exactly what makes this survive onto a sent message,
   * where no photo objects can be rebuilt.
   */
  regionCount: { type: Number, default: 0 },
});

const emit = defineEmits(["clear-focus", "clear-spotlight"]);

/** Kept in sync with `--ccc-mark` in the styles below — the thumbnails indent by it. */
const markSize = 16;

const isPast = computed(() => props.mode === "past");
const isSelectionFocus = computed(() => props.focusSource === "selection");

const hasSpotlight = computed(() => props.spotlightedPhotos.length > 0);

/**
 * Live merge: every photo in focus or spotlighted, each shown once — a spotlighted one is
 * marked in place in the crop below rather than pulled into a list of its own. Past mode
 * keeps the old split (see the template) because a reconstructed photo carries no `config`
 * to draw a crop from.
 */
const combinedPhotos = computed(() => {
  const byId = new Map();
  for (const photo of props.focusedPhotos) byId.set(String(photo.id), photo);
  for (const photo of props.spotlightedPhotos)
    byId.set(String(photo.id), photo);
  return [...byId.values()];
});

const isSpotlighted = (photo) => spotlightIds.value.has(String(photo.id));

/**
 * The real board rectangle spanning every photo in `combinedPhotos` — what the crop below
 * is scaled from. `null` until there is at least one photo with canvas geometry.
 */
const spatialBounds = computed(() => {
  const rects = combinedPhotos.value
    .map((photo) => photo.config)
    .filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y));
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of rects) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + (c.width ?? 0));
    maxY = Math.max(maxY, c.y + (c.height ?? 0));
  }
  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
});

/**
 * The preview box, sized in JS rather than by a CSS `aspect-ratio`: that, once clamped by
 * `max-height`, keeps the full width, so a tall column selection lands in a wide box and
 * every photo stretches. Scaling the real bounds to fit inside a fixed max W×H instead
 * preserves the true proportions for any selection shape — wide, tall or square.
 */
const PREVIEW_MAX_WIDTH = 286;
const PREVIEW_MAX_HEIGHT = 200;

const previewBoxStyle = computed(() => {
  const b = spatialBounds.value;
  if (!b) return null;
  const scale = Math.min(
    PREVIEW_MAX_WIDTH / b.width,
    PREVIEW_MAX_HEIGHT / b.height,
  );
  return {
    width: `${Math.round(b.width * scale)}px`,
    height: `${Math.round(b.height * scale)}px`,
  };
});

/**
 * A photo's box as a percentage of the crop — position AND size, so a portrait photo reads
 * as portrait instead of being forced into a uniform square.
 */
const spatialThumbStyle = (photo) => {
  const b = spatialBounds.value;
  const c = photo.config;
  if (!b || !c) return null;
  return {
    left: `${((c.x - b.minX) / b.width) * 100}%`,
    top: `${((c.y - b.minY) / b.height) * 100}%`,
    width: `${(c.width / b.width) * 100}%`,
    height: `${(c.height / b.height) * 100}%`,
  };
};

const liveFocusNote = computed(() => {
  if (hasSpotlight.value) return "The context around your question";
  if (combinedPhotos.value.length > 0) return "The subject of your question";
  return "No working area selected";
});

/**
 * A region counts as something picked out, exactly like a focus: the subject is then the
 * crop, and the board around it is context. Tested on its own flag rather than on
 * `focusedPhotos`, because a SENT region carries no focused ids at all (`sentPhotos` is
 * empty for a region — see `chatFocus` in CanvasView), so a past record would otherwise
 * call the whole canvas the subject while the row right below it names the region.
 */
const boardNote = computed(() => {
  if (props.regionMode || props.focusedPhotos.length > 0) {
    return "Acting as global, metadata based context";
  }
  return "The subject of your question is the canvas at the metadata level";
});

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
  if (hasSpotlight.value) return "spotlight";
  if (props.focusedPhotos.length > 0) return "focus";
  return null;
});

const focusNote = computed(() => {
  if (subjectLevel.value === "spotlight")
    return "The zone around what you asked about";
  if (subjectLevel.value === "focus") return "The subject of your question";
  return "The zone you are working on — under the halo, or a drag-box";
});

const spotlightNote = computed(() => {
  if (hasSpotlight.value) return "The subject of your question";
  return "Photos you spotlight — the detail inside the focus";
});

/** Ids as strings: the live path carries them as strings, the board's as numbers. */
const spotlightIds = computed(
  () => new Set(props.spotlightedPhotos.map((photo) => String(photo.id))),
);
const sentFocusCount = computed(() =>
  isPast.value ? props.focusedPhotos.length : props.sentFocusedIds.length,
);

/** The focus MINUS whatever is spotlighted — see the partition note above. */
const focusOnly = computed(() =>
  props.focusedPhotos.filter(
    (photo) => !spotlightIds.value.has(String(photo.id)),
  ),
);

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

/** The crop's hover preview — anchored and kept on-screen the same way Photos2D positions
 *  its photo tooltip, just against this popover's own box instead of the atlas canvas. */
const tooltipRef = ref(null);
const hoveredThumbPhoto = ref(null);
const { tooltipPosition, placeTooltipAt, clearTooltipAnchor } =
  useSmartTooltipPosition({
    containerRef: rootEl,
    tooltipRef,
    offset: 10,
    margin: 6,
  });

const onThumbHover = (photo, event) => {
  hoveredThumbPhoto.value = photo;
  const containerRect = rootEl.value?.getBoundingClientRect();
  const thumbRect = event.currentTarget.getBoundingClientRect();
  if (!containerRect) return;
  placeTooltipAt({
    x: thumbRect.left + thumbRect.width / 2 - containerRect.left,
    y: thumbRect.top + thumbRect.height / 2 - containerRect.top,
  });
};

const onThumbUnhover = () => {
  hoveredThumbPhoto.value = null;
  clearTooltipAnchor();
};

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

  width: 400px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color-hover, var(--border-color));
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  position: relative; /* Never taller than the room it actually has: the header stays pinned and the body
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

/* Pushed to the row's far edge and pulled up onto the title's line, so it reads as the
   section's action rather than as part of the caption under it. */
.ccc-row-action {
  margin-left: auto;
  flex-shrink: 0;
  align-self: flex-start;
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

/* The live crop: a scaled rectangle of the board itself rather than a uniform grid, so a
   portrait photo reads as portrait and two photos sitting close together read as close.
   The wrapper only pads and centres; the inner canvas carries the real bounds size (set in
   JS, see previewBoxStyle) so the thumbs' percentage coordinates always match its aspect
   ratio and never stretch. */
.ccc-spatial {
  margin-left: var(--ccc-indent);
  padding: 8px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-body);
  display: flex;
  justify-content: center;
}

.ccc-spatial-canvas {
  position: relative;
  max-width: 100%;
}

.ccc-spatial-thumb {
  position: absolute;
  overflow: hidden;
  outline: 2px solid var(--bg-body);
  z-index: 1;
}

.ccc-spatial-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* The subject, marked in place rather than listed a second time — see combinedPhotos. */
.ccc-spatial-thumb--spotlight {
  outline: 2px solid var(--accent-color);
  z-index: 2;
}

.ccc-spatial-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding-left: var(--ccc-indent);
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-tertiary);
}

.ccc-spatial-legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-color);
  flex-shrink: 0;
}

.ccc-note {
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

/* Same shape as the atlas's photo-tooltip (Photos2D.vue): rounded image, drop shadow, a
   quick fade-in. `position: relative` on `.ccc` makes this absolute box resolve against the
   popover itself, not the viewport — see useSmartTooltipPosition's containerRef. */
.ccc-thumb-tooltip {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  animation: cccTooltipFadeIn 0.12s ease-out;
}

.ccc-thumb-tooltip img {
  display: block;
  width: 160px;
  max-height: 160px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border-color-hover, var(--border-color));
}

@keyframes cccTooltipFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
