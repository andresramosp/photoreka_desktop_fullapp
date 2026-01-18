<template>
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="bottom-right"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="bottom-left"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="upper-right"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
  <PhotoCanvasButton
    v-if="enableDiagonal"
    :photo="photo"
    position="upper-left"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="left"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="right"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="upper"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />

  <PhotoCanvasButton
    :photo="photo"
    position="bottom"
    :fill="primaryColor"
    icon="+"
    @click="handleClick"
    :sizeFactor="sizeFactor"
  />
</template>

<script setup>
import PhotoCanvasButton from "./PhotoCanvasButton.vue";

const primaryColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--primary-color")
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
