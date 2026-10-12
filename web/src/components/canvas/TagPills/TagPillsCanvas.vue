<template>
  <v-group :config="{ opacity: visible ? 1 : 0 }">
    <!-- Hit area inferior (ampliado) -->
    <v-rect
      :config="{
        x: -25,
        y: -25,
        width: hitAreaWidth,
        height: hitAreaHeight,
        opacity: 0,
        listening: true,
      }"
      @wheel="onWheel"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    />

    <!-- Grupo visible de tags, que también capta el wheel -->
    <v-group
      :config="{ x: 0, y: 0 }"
      :clipFunc="clipFunc"
      @wheel="onWheel"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <template
        v-for="(tagPhoto, index) in filteredTags"
        :key="tagPhoto.tag.id"
      >
        <TagPill
          :tag="tagPhoto.tag"
          :photo="photo"
          :offsetY="getOffsetY(index)"
          v-model="tagPhoto.tag.selected"
        />
      </template>
    </v-group>
  </v-group>
</template>

<script setup>
import { ref, computed } from "vue";
import TagPill from "./TagPill.vue";
import { useTagDisplay } from "@/composables/canvas/useTagsDisplay";

const props = defineProps({
  photo: { type: Object, required: true },
  tags: { type: Array, required: true },
  visible: { type: Boolean, required: true },
});

const { filteredTags } = useTagDisplay(() => props.tags);

const scrollOffset = ref(0);
const itemHeight = 23;
const initialOffset = 10;

// Touch scroll variables
const touchStartY = ref(0);
const touchStartScrollOffset = ref(0);
const isScrolling = ref(false);

const totalContentHeight = computed(
  () => initialOffset + filteredTags.value.length * itemHeight
);
const clipHeight = computed(() => props.photo.config.height);

const clampScroll = (offset) => {
  const minOffset = clipHeight.value - totalContentHeight.value;
  if (offset < minOffset) return minOffset;
  if (offset > 0) return 0;
  return offset;
};

const onWheel = (e) => {
  e.evt.preventDefault();
  e.cancelBubble = true;
  e.evt.stopPropagation();
  const delta = e.evt.deltaY > 0 ? -itemHeight * 0.5 : itemHeight * 0.5;
  scrollOffset.value = clampScroll(scrollOffset.value + delta);
};

// Touch event handlers for scrolling
const onTouchStart = (e) => {
  e.cancelBubble = true;
  const touch = e.evt.touches[0];
  if (touch) {
    touchStartY.value = touch.clientY;
    touchStartScrollOffset.value = scrollOffset.value;
    isScrolling.value = true;
  }
};

const onTouchMove = (e) => {
  if (!isScrolling.value) return;

  e.cancelBubble = true;
  e.evt.preventDefault();

  const touch = e.evt.touches[0];
  if (touch) {
    const deltaY = touch.clientY - touchStartY.value;
    const newScrollOffset = touchStartScrollOffset.value + deltaY;
    scrollOffset.value = clampScroll(newScrollOffset);
  }
};

const onTouchEnd = (e) => {
  isScrolling.value = false;
  e.cancelBubble = true;
};

const getOffsetY = (index) => {
  return scrollOffset.value + initialOffset + index * itemHeight;
};

const clipFunc = (ctx) => {
  ctx.beginPath();
  ctx.rect(0, initialOffset, props.photo.config.width, clipHeight.value - 15);
  ctx.closePath();
  ctx.clip();
};

// Área de captura extendida: por ejemplo, 50px extra de ancho y alto.
const hitAreaWidth = computed(() => props.photo.config.width + 50);
const hitAreaHeight = computed(() => props.photo.config.height + 50);
</script>

<style scoped>
/* Ajusta estilos si es necesario */
</style>
