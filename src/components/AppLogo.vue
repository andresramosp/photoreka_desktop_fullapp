<template>
  <div
    class="photoreka-logo"
    :class="{
      'logo-large': size === 'large',
      'logo-tiny': size === 'tiny',
      'logo-inline': inline,
    }"
  >
    <div
      class="logo-icon"
      :class="{
        'logo-small': size === 'small',
        'logo-tiny': size === 'tiny',
        'logo-inline': inline,
      }"
    >
      <img
        :src="inline ? logoNameInline : logoName"
        alt="Photoreka"
        class="logo-image"
        :class="{
          'logo-small-image': size === 'small',
          'logo-tiny-image': size === 'tiny',
          'logo-inline-image': inline,
        }"
        :style="props.height ? { height: props.height + 'px' } : {}"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { CameraOutline } from "@vicons/ionicons5";
import logoName from "@/assets/logos/logo_name_sub_white_center.png";
import logoNameInline from "@/assets/logos/logo_name_white.png";

interface Props {
  size?: "normal" | "large" | "small" | "tiny";
  showText?: boolean;
  height?: number; // altura en px, prevalece sobre size
  inline?: boolean; // usa el logo horizontal con texto
}

const props = withDefaults(defineProps<Props>(), {
  size: "normal",
  showText: true,
  inline: false,
});
</script>

<script lang="ts">
export default {
  name: "AppLogo",
};
</script>

<style scoped>
.photoreka-logo {
  display: flex;
  align-items: center;
  opacity: 0.8;
  gap: 12px;
  color: #2563eb;
  justify-content: center;
}

.photoreka-logo.logo-large {
  gap: 16px;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo-image {
  height: 170px;
  width: auto;
  object-fit: contain;
}

.logo-large .logo-image {
  height: 100px;
}

.logo-small-image {
  height: 70px;
}

.logo-tiny-image {
  height: 40px;
}

.logo-inline-image {
  height: 50px;
}

.logo-text {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #ffffffd1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
    sans-serif;
}

.logo-large .logo-text {
  font-size: 32px;
}

.logo-small .logo-text {
  font-size: 18px;
}

.logo-tiny .logo-text {
  font-size: 12px;
}

/* Animation for the camera icon */
.photoreka-logo:hover .logo-icon {
  transform: scale(1.05);
}

/* Subtle glow effect */
.logo-icon {
  filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.3));
}

/* Mobile responsive styles */
@media (max-width: 768px) {
  .logo-image {
    height: 40px !important;
  }

  .logo-inline-image {
    height: 40px !important;
  }

  .logo-large .logo-image {
    height: 40px !important;
  }

  .logo-small-image {
    height: 40px !important;
  }

  .logo-tiny-image {
    height: 40px !important;
  }
}
</style>
