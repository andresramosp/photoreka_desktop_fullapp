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
    <v-circle
      :config="{
        radius: buttonRadius,
        fill: fill,
        opacity: 0.65,
      }"
    />
    <v-text
      :config="{
        x: -buttonRadius,
        y: -buttonRadius + 3,
        width: buttonRadius * 2,
        height: buttonRadius * 2,
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
  fill: { type: String, required: true },
  icon: { type: String, default: "+" },
  fontSize: { type: Number, default: 24 },
  textColor: { type: String, default: "white" },
  sizeFactor: { type: Number, default: 1 },
  opacity: { type: Number, default: 1 },
});

const buttonRadius = computed(() => 24 * props.sizeFactor);
const computedFontSize = computed(() => props.fontSize * props.sizeFactor);

const computedX = computed(() => props.photo.config.width / 2);
const computedY = computed(() => props.photo.config.height / 2);

const emit = defineEmits(["click"]);

// Flag to prevent duplicate events from touch and synthetic mouse events
let touchHandled = false;

const handleClick = (e) => {
  // IMPORTANTE: Cancelar la propagación del evento para evitar que se seleccione la foto
  e.cancelBubble = true;

  // Skip if this is a synthetic mouse event after touch
  if (touchHandled) {
    touchHandled = false;
    return;
  }

  emit("click", { photo: props.photo, position: "center" });
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
    emit("click", { photo: props.photo, position: "center" });
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
