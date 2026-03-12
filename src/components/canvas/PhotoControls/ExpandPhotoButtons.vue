<template>
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="bottom-right"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="bottom-left"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="upper-right"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="upper-left"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="left"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="right"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="upper"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="bottom"
    :fill="accentColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
</template>

<script setup>
import PhotoCanvasButton from "./PhotoCanvasButton.vue";

const accentColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--accent-color")
  .trim();

const props = defineProps({
  photo: Object,
  enableDiagonal: Boolean,
  sizeFactor: { type: Number, default: 1 },
});
const emit = defineEmits(["click"]);

const handleClick = (position) => {
  emit("click", { photo: props.photo, position });
};
</script>
