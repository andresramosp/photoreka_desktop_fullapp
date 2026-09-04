<template>
  <v-group
    :config="{ x: buttonX, y: buttonY }"
    @click="handleClick"
    @tap="handleClick"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @mouseover="handleMouseOver"
    @mouseout="handleMouseOut"
  >
    <v-circle
      :config="{
        radius: buttonSize / 2,
        fill: checked ? fill : 'rgba(0, 0, 0, 0.35)',
        stroke: checked ? fill : 'rgba(255, 255, 255, 0.85)',
        strokeWidth: 2 * sizeFactor,
      }"
    />
    <v-text
      v-if="checked"
      :config="{
        x: -buttonSize / 2,
        y: -buttonSize / 2 + 1,
        width: buttonSize,
        height: buttonSize,
        text: '✓',
        fontSize: 11 * sizeFactor,
        fontStyle: 'bold',
        fontFamily: 'sans-serif',
        align: 'center',
        verticalAlign: 'middle',
        fill: 'white',
      }"
    />
  </v-group>
</template>

<script setup>
/**
 * Checkbox in the photo's top-left corner, the same gesture as the circle on
 * `PhotoCardHub` — and deliberately the same visual language, because it means the same
 * thing there: "mark this photo for an action".
 *
 * It exists to take that job away from the plain click. On a canvas the click is the
 * primary gesture — move photos, expand from them, point the chat at them — and while it
 * also drove the action bar those two readings of "selected" were competing.
 *
 * A Konva component, not a DOM overlay: it has to sit in the photo's own coordinate space
 * so it pans, zooms and reorders with it.
 */
import { computed } from "vue";

const props = defineProps({
  photo: Object,
  /** Marked for the action bar. Distinct from `photo.selected`, which is the board's. */
  checked: { type: Boolean, default: false },
  fill: { type: String, default: "#2080f0" },
  sizeFactor: { type: Number, default: 1 },
});

const buttonSize = computed(() => 18 * props.sizeFactor);

// Mirrors PhotoInfoButton's inset so the two corners line up across the top edge.
const buttonX = computed(() => buttonSize.value / 2 + 6);
const buttonY = computed(() => buttonSize.value / 2 + 6);

const emit = defineEmits(["toggle"]);

let touchHandled = false;

const handleClick = (e) => {
  // Never let this reach the photo underneath: that click is the board selection, and the
  // whole point of this control is to be the other one.
  e.cancelBubble = true;
  if (touchHandled) {
    touchHandled = false;
    return;
  }
  emit("toggle", { photo: props.photo, event: e });
};

const handleTouchStart = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();
  touchHandled = true;
};

const handleTouchEnd = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();
  setTimeout(() => {
    emit("toggle", { photo: props.photo, event: e });
    setTimeout(() => {
      touchHandled = false;
    }, 100);
  }, 10);
};

const handleMouseOver = (e) => {
  e.target.getStage().container().style.cursor = "pointer";
};

const handleMouseOut = (e) => {
  e.target.getStage().container().style.cursor = "default";
};
</script>
