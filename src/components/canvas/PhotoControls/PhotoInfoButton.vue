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
    <v-rect
      :config="{
        x: -buttonSize / 2,
        y: -buttonSize / 2,
        width: buttonSize,
        height: buttonSize,
        fill: fill,
        cornerRadius: 4 * sizeFactor,
        opacity: 0.85,
      }"
    />
    <v-text
      :config="{
        x: -buttonSize / 2,
        y: -buttonSize / 2 + 1,
        width: buttonSize,
        height: buttonSize,
        text: 'ⓘ',
        fontSize: computedFontSize,
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
import { computed } from "vue";

const props = defineProps({
  photo: Object,
  fill: { type: String, default: "#2080f0" },
  sizeFactor: { type: Number, default: 1 },
});

const buttonSize = computed(() => 18 * props.sizeFactor);
const computedFontSize = computed(() => 10 * props.sizeFactor);

const buttonX = computed(() => buttonSize.value / 2 + 6);
const buttonY = computed(() => buttonSize.value / 2 + 6);

const emit = defineEmits(["click"]);

let touchHandled = false;

const handleClick = (e) => {
  e.cancelBubble = true;
  if (touchHandled) {
    touchHandled = false;
    return;
  }
  emit("click", { photo: props.photo, event: e });
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
    emit("click", { photo: props.photo, event: e });
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
