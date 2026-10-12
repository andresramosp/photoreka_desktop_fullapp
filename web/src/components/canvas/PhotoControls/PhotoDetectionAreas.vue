<template>
  <v-group :config="{ opacity: 1 }">
    <v-group :config="{ x: 0, y: 0 }" :clipFunc="clipFunc">
      <template v-for="detection in sortedDetections" :key="detection.id">
        <v-rect
          :config="getRectConfig(detection)"
          @click="(e) => toggleSelected(e, detection)"
          @mouseenter="detection.hover = true"
          @mouseleave="detection.hover = false"
        />
      </template>
    </v-group>
  </v-group>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  photo: { type: Object, required: true },
  detectionAreas: { type: Array, required: true },
  visible: { type: Boolean, required: true },
});

const originalWidth = 1500;
const scale = props.photo.config.width / originalWidth;

// Ordenar detections de menor a mayor área (los pequeños encima)
const sortedDetections = computed(() => {
  return [...props.detectionAreas].sort((a, b) => {
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return areaB - areaA; // ✅ grande primero → pequeño encima
  });
});

const clipFunc = (ctx) => {
  ctx.beginPath();
  ctx.rect(0, 0, props.photo.config.width, props.photo.config.height);
  ctx.closePath();
  ctx.clip();
};

const onWheel = (e) => {
  e.evt.preventDefault();
  e.evt.stopPropagation();
};

const toggleSelected = (e, detection) => {
  e.cancelBubble = true; // evita propagación en Konva
  detection.selected = !detection.selected;
};

const getRectConfig = (detection) => {
  const x = detection.x1 * scale;
  const y = detection.y1 * scale;
  const width = (detection.x2 - detection.x1) * scale;
  const height = (detection.y2 - detection.y1) * scale;

  const selectedColor = theme.current.value.colors.secondary;
  const hoverColor = theme.current.value.colors.primary;

  return {
    x,
    y,
    width,
    height,
    stroke: "white",
    strokeWidth: 1.5,
    opacity: 0.4,
    fill: detection.selected
      ? `${selectedColor}`
      : detection.hover
      ? `${hoverColor}`
      : "transparent",
    listening: true,
  };
};
</script>
