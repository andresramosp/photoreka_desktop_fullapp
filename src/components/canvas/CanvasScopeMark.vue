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
    <!-- Region: a dashed rounded square in the board's colour — a piece of the board the
         chat reaches as metadata, drawn like the frame it wears on the canvas. -->
    <rect
      v-else-if="type === 'region'"
      x="2.25"
      y="2.25"
      width="11.5"
      height="11.5"
      rx="2"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="3 2.2"
    />
    <!-- Halo: a solid disc, the canvas's central filled glow. Only the halo's own switch
         wears it; the focus level is named by the box below. -->
    <circle v-else-if="type === 'halo'" cx="8" cy="8" r="5" />
    <!-- Focus: a solid-edged, lightly filled square — a selection box, the way the focus is
         usually made. Solid where the region's frame is dashed. -->
    <rect
      v-else
      x="2.75"
      y="2.75"
      width="10.5"
      height="10.5"
      rx="2"
      fill="currentColor"
      fill-opacity="0.28"
      stroke="currentColor"
      stroke-width="1.5"
    />
  </svg>
</template>

<script setup>
/**
 * The marks that stand for the canvas chat's outer levels, wherever they are named — the
 * blank state, the context panel, the header chip, the chip on a sent message.
 *
 * They are shapes rather than icons on purpose: each one mirrors something drawn on the
 * board (the dashed outer halo, the selection box, the region frame) in both form and
 * colour, so the legend and the canvas read as one language. That only holds while every
 * mention uses the same shape, which is why they live here instead of being inlined.
 *
 * The third level, the spotlight subject, has no mark on the board — it is a gesture, not a
 * region — so it is named with the spotlight icon (`FlashlightOutline`) instead.
 *
 * `region` is the focus's other form: a selection too large to be shown, drawn on the
 * board as a dashed frame in the board's colour, because that is what it is — a piece of
 * the board the chat reaches as metadata, not photos it looks at.
 *
 * `halo` is not a level but one way of filling the focus, so it only marks the halo switch.
 */
defineProps({
  /** 'board', 'focus', 'region' or 'halo' (the halo switch, not a level). */
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
  color: var(--primary-color);
}

.csm--halo {
  fill: var(--primary-color);
}

.csm--board {
  color: var(--secondary-color);
}

.csm--region {
  color: var(--region-color);
}
</style>
