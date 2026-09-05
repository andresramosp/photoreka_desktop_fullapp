<template>
  <svg
    class="csm"
    :class="`csm--${type}`"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <!-- Board: an unfilled dashed ring, the canvas's own outer halo. -->
    <circle
      v-if="type === 'board'"
      cx="8"
      cy="8"
      r="6"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="3 2.2"
    />
    <!-- Focus: a solid disc, the canvas's central filled glow. -->
    <circle v-else cx="8" cy="8" r="5" />
  </svg>
</template>

<script setup>
/**
 * The two marks that stand for the canvas chat's outer levels, wherever they are named —
 * the blank state, the context panel, the header chip, the chip on a sent message.
 *
 * They are shapes rather than icons on purpose: each one mirrors a real ring drawn on the
 * board (the dashed outer halo, the filled focus glow) in both form and colour, so the
 * legend and the canvas read as one language. That only holds while every mention uses
 * the same shape, which is why they live here instead of being inlined a fourth time.
 *
 * The third level, the spotlight subject, has no ring on the board — it is a gesture, not a
 * region — so it is named with the spotlight icon (`FlashlightOutline`) instead.
 */
defineProps({
  /** 'board' (everything placed) or 'focus' (the part being worked on). */
  type: { type: String, default: "focus" },
  size: { type: Number, default: 15 },
});
</script>

<style scoped>
.csm {
  display: block;
  flex-shrink: 0;
}

.csm--focus {
  fill: var(--primary-color);
}

.csm--board {
  color: var(--secondary-color);
}
</style>
