<template>
  <div class="ccfr">
    <header class="ccfr-header">What the chat looked at</header>

    <!-- The board — reaches the agent as a searchable set and an exclusion, never photo
         by photo, so the wording is about reach, not sight. Mirrors CanvasChatContext. -->
    <section class="ccfr-section">
      <div class="ccfr-row">
        <!-- Dashed purple ring: the whole board as ambient context. -->
        <svg
          class="ccfr-mark ccfr-mark--global"
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
        <div class="ccfr-row-text">
          <strong>{{ boardCount }}</strong>
          {{ boardCount === 1 ? "photo" : "photos" }} on the canvas
          <span class="ccfr-row-note">
            Acted as global, metadata based context
          </span>
        </div>
      </div>
    </section>

    <!-- The focus — the ones the model actually looked at. -->
    <section class="ccfr-section">
      <div class="ccfr-row">
        <!-- Filled cyan disc: the focus halo the model looked through. -->
        <svg
          class="ccfr-mark ccfr-mark--focus"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5" />
        </svg>
        <div class="ccfr-row-text">
          <strong>{{ focusedPhotos.length }}</strong>
          {{ focusedPhotos.length === 1 ? "photo" : "photos" }} in focus
          <span class="ccfr-row-note"> Seen as images for this answer </span>
        </div>
      </div>

      <!-- Four across, same shape as the live context panel. -->
      <div v-if="focusedPhotos.length > 0" class="ccfr-grid">
        <div
          v-for="photo in focusedPhotos"
          :key="photo.id"
          class="ccfr-thumb"
          :title="photo.originalFileName || photo.name"
        >
          <img :src="photo.thumbnailUrl || photo.src" alt="" loading="lazy" />
        </div>
      </div>

      <p v-else class="ccfr-empty">
        These photos are no longer available on the board.
      </p>
    </section>
  </div>
</template>

<script setup>
/**
 * The historical, read-only sibling of CanvasChatContext: what a past turn was told, kept
 * with the user's message so the reply's subject survives the board's focus moving on.
 *
 * No halo/selection distinction or footer actions — a record, not a control.
 */
defineOptions({ name: "CanvasChatFocusReference" });

defineProps({
  /** The focused photos as display objects (resolved from the store). */
  focusedPhotos: { type: Array, default: () => [] },
  /** How many photos were on the board as global context that turn. */
  boardCount: { type: Number, default: 0 },
});
</script>

<style scoped>
.ccfr {
  width: 264px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.ccfr-header {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.ccfr-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.ccfr-section + .ccfr-section {
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

.ccfr-row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-xs);
}

.ccfr-mark {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 1px;
}

.ccfr-mark--focus {
  fill: var(--accent-color);
}

.ccfr-mark--global {
  color: var(--secondary-color);
}

.ccfr-row-text {
  font-size: var(--font-size-xs);
  line-height: 1.45;
  color: var(--text-secondary);
  min-width: 0;
}

.ccfr-row-text strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.ccfr-row-note {
  display: block;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
}

.ccfr-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.ccfr-thumb {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-surface);
}

.ccfr-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ccfr-empty {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}
</style>
