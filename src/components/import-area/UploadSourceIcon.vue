<template>
  <n-icon :size="size" :color="source.iconColor">
    <component
      :is="source.iconComponent"
      v-if="source.iconType === 'component'"
    />
    <svg
      v-else-if="source.iconType === 'locked-svg'"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
    >
      <path
        fill="currentColor"
        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
      />
    </svg>
    <img
      v-else
      :src="source.iconSrc"
      :alt="source.iconAlt"
      :class="imgClass"
      :style="imgStyle"
    />
  </n-icon>
</template>

<script setup>
import { NIcon } from "naive-ui";

// Renders the icon for a single upload source definition (see
// `sourceDefinitions` in LightboxPhotos.vue). Used by the empty-state cards,
// the mobile button strip, and the compact PhotosGrid buttons so all three
// contexts stay visually and logically in sync.
defineProps({
  source: {
    type: Object,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 20,
  },
  // Optional overrides for <img> based icons: the empty-state cards use a
  // fixed-height class, the button variants use a small inline em-based size.
  imgClass: {
    type: String,
    default: "",
  },
  imgStyle: {
    type: [String, Object],
    default: null,
  },
});
</script>
