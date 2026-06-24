<template>
  <v-group
    :config="{ x: computedX, y: computedY, opacity: opacity }"
    @click="handleClick"
    @tap="handleClick"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @mouseover="handleMouseOver"
    @mouseout="handleMouseOut"
  >
    <v-rect
      :config="{
        width: buttonWidth,
        height: buttonHeight,
        fill: fill,
        opacity: 0.8,
        cornerRadius: 5,
      }"
    />
    <v-text
      :config="{
        x: 0,
        y: (buttonHeight - computedFontSize - 2) / 2,
        width: buttonWidth,
        height: buttonHeight,
        text: icon,
        fontSize: computedFontSize,
        align: 'center',
        verticalAlign: 'middle',
        fill: textColor,
      }"
    />
  </v-group>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  photo: Object,
  position: {
    type: String,
    required: true,
    validator: (value) =>
      [
        "upper-left",
        "upper-right",
        "bottom-left",
        "bottom-right",
        "right",
        "left",
        "bottom",
        "upper",
      ].includes(value),
  },
  fill: { type: String, required: true },
  icon: { type: String, required: true },
  fontSize: { type: Number, default: 12 },
  textColor: { type: String, default: "white" },
  sizeFactor: { type: Number, default: 1 }, // <- nuevo prop
  opacity: { type: Number, default: 1 },
});

const buttonWidth = computed(() => 16 * props.sizeFactor);
const buttonHeight = computed(() => 16 * props.sizeFactor);
const margin = computed(() => -7 * props.sizeFactor);

const computedFontSize = computed(() => props.fontSize * props.sizeFactor);

const computedX = computed(() => {
  const w = props.photo.config.width;
  switch (props.position) {
    case "upper-left":
    case "bottom-left":
      return -buttonWidth.value - margin.value;
    case "upper-right":
    case "bottom-right":
      return w + margin.value;
    case "left":
      return -buttonWidth.value - margin.value;
    case "right":
      return w + margin.value;
    case "upper":
    case "bottom":
      return (w - buttonWidth.value) / 2;
    default:
      return 0;
  }
});

const computedY = computed(() => {
  const h = props.photo.config.height;
  switch (props.position) {
    case "upper-left":
    case "upper-right":
    case "upper":
      return -buttonHeight.value - margin.value;
    case "bottom-left":
    case "bottom-right":
    case "bottom":
      return h + margin.value;
    case "left":
    case "right":
      return (h - buttonHeight.value) / 2;
    default:
      return 0;
  }
});

const emit = defineEmits(["click"]);

// Flag to prevent duplicate events from touch and synthetic mouse events
let touchHandled = false;

const handleClick = (e) => {
  // Skip if this is a synthetic mouse event after touch
  if (touchHandled) {
    touchHandled = false;
    return;
  }

  e.cancelBubble = true;
  emit("click", props.position);
};

const handleTouchStart = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();
  touchHandled = true;
};

const handleTouchEnd = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();

  // Add a small delay to ensure touch is properly handled
  setTimeout(() => {
    emit("click", props.position);
    // Reset the flag after a short delay to allow future mouse events
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
