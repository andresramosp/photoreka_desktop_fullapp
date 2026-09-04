<template>
  <div class="ccc">
    <header class="ccc-header">What the chat can see</header>

    <!-- The board. Never described photo by photo — it reaches the agent as a searchable
         set and as an exclusion, which is why the wording is about reach, not sight. -->
    <section class="ccc-section">
      <div class="ccc-row">
        <!-- Dashed purple ring: the outer halo, standing for the whole board as ambient
             context — matches the canvas's outer ring. -->
        <svg
          class="ccc-mark ccc-mark--global"
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
        <div class="ccc-row-text">
          <strong>{{ boardCount }}</strong>
          {{ boardCount === 1 ? "photo" : "photos" }} on the canvas
          <span class="ccc-row-note">
            Acting as global, metadata based context
          </span>
        </div>
      </div>
    </section>

    <!-- The focus. These are the ones the model actually looks at. -->
    <section class="ccc-section">
      <div class="ccc-row">
        <n-icon v-if="isSelectionFocus" :size="15" class="ccc-row-icon">
          <HandRightOutline />
        </n-icon>
        <!-- Filled cyan disc: the focus halo the model actually looks through — matches the
             canvas's central filled glow. -->
        <svg
          v-else
          class="ccc-mark ccc-mark--focus"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5" />
        </svg>
        <div class="ccc-row-text">
          <strong>{{ shownCount }}</strong>
          {{ shownCount === 1 ? "photo" : "photos" }} in focus
          <span v-if="isTruncated" class="ccc-row-badge">
            of {{ focusedTotal }} selected
          </span>
          <span class="ccc-row-note">
            {{ "Fully seen as images by Chatlab" }}
          </span>
        </div>
      </div>

      <!-- Four across, so twelve is three tidy rows and the cap has a shape the user can
           recognise before they hit it. -->
      <div v-if="focusedPhotos.length > 0" class="ccc-grid">
        <div
          v-for="photo in focusedPhotos"
          :key="photo.id"
          class="ccc-thumb"
          :title="photo.originalFileName || photo.name"
        >
          <img :src="photo.thumbnailUrl || photo.src" alt="" loading="lazy" />
        </div>
      </div>

      <p v-else class="ccc-empty">
        {{
          isSelectionFocus
            ? "Nothing selected."
            : visionEnabled
              ? "Nothing under the halo. Pan the board, or click photos to point the chat at them."
              : "The halo is off, so the chat is not told what you are looking at."
        }}
      </p>

      <p v-if="isTruncated" class="ccc-truncated">
        Only the first {{ maxFocused }} in reading order are sent. The rest are
        dimmed on the board.
      </p>
    </section>

    <footer class="ccc-footer">
      <n-button
        v-if="isSelectionFocus"
        size="tiny"
        @click="emit('clear-focus')"
      >
        Clear selection
      </n-button>
      <n-button
        v-else
        size="tiny"
        :type="visionEnabled ? 'default' : 'primary'"
        @click="emit('toggle-vision')"
      >
        {{ visionEnabled ? "Turn the halo off" : "Turn the halo on" }}
      </n-button>
    </footer>
  </div>
</template>

<script setup>
/**
 * What the canvas chat is being told, in the two forms it comes in.
 *
 * The distinction is the whole point of this panel: the board reaches the agent as a set
 * it can search and must not re-propose, while the focus is the handful it actually
 * LOOKS at. Before this, both were compressed into one number in a tooltip, which said
 * nothing about which photos or in what form.
 */
import { computed } from "vue";
import { NButton, NIcon } from "naive-ui";
import { HandRightOutline } from "@vicons/ionicons5";

defineOptions({ name: "CanvasChatContext" });

const props = defineProps({
  /** Every photo on the board. */
  boardCount: { type: Number, default: 0 },
  /** The photos actually sent as images — already capped. */
  focusedPhotos: { type: Array, default: () => [] },
  /** How many the focus holds in total; larger than the above when truncated. */
  focusedTotal: { type: Number, default: 0 },
  maxFocused: { type: Number, default: 12 },
  /** 'halo' (ambient, follows the view) or 'selection' (picked by hand). */
  focusSource: { type: String, default: "halo" },
  visionEnabled: { type: Boolean, default: true },
});

const emit = defineEmits(["toggle-vision", "clear-focus"]);

const isSelectionFocus = computed(() => props.focusSource === "selection");
const shownCount = computed(() => props.focusedPhotos.length);
const isTruncated = computed(() => props.focusedTotal > shownCount.value);
</script>

<style scoped>
.ccc {
  width: 288px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.ccc-header {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.ccc-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.ccc-section + .ccc-section {
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

.ccc-row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-xs);
}

.ccc-row-icon {
  color: var(--primary-color);
  flex-shrink: 0;
  margin-top: 1px;
}

/* Scope marks that mirror the canvas halos: a filled accent disc for the focus halo, a
   dashed secondary ring for the whole-board context. */
.ccc-mark {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 1px;
}

.ccc-mark--focus {
  fill: var(--accent-color);
}

.ccc-mark--global {
  color: var(--secondary-color);
}

.ccc-row-text {
  font-size: var(--font-size-xs);
  line-height: 1.45;
  color: var(--text-secondary);
  min-width: 0;
}

.ccc-row-text strong {
  color: var(--text-primary);
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
  line-height: 1.4;
}

/* Four across: twelve then reads as three tidy rows, so the cap has a shape the user
   recognises before they reach it. */
.ccc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
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
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}

.ccc-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--spacing-xs);
  border-top: 1px solid var(--border-color);
}
</style>
