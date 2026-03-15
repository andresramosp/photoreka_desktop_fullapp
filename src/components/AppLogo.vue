<template>
  <div
    class="photoreka-logo"
    :class="{ clickable: props.clickToHome }"
    @click="handleLogoClick"
  >
    <img
      :src="logoSrc"
      alt="Photoreka"
      class="logo-image"
      :class="[`logo-size-${size}`, `logo-layout-${layout}`]"
      :style="props.height ? { height: props.height + 'px !important' } : {}"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";

// Nuevos logos (marca)
import iconDark from "@/assets/logos/marca/icon-dark-dark.png";
import iconLight from "@/assets/logos/marca/icon-light.png";
import horizontalDark from "@/assets/logos/marca/horizontal-dark.png";

import horizontalLight from "@/assets/logos/marca/horizontal-light.png";
import horizontalClaimDark from "@/assets/logos/marca/horizontal-claim-dark.png";
import horizontalClaimLight from "@/assets/logos/marca/horizontal-claim-light.png";
import verticalDark from "@/assets/logos/marca/vertical-dark.png";

import verticalLight from "@/assets/logos/marca/vertical-light.png";
import verticalClaimDark from "@/assets/logos/marca/vertical-claim-dark.png";
import verticalClaimLight from "@/assets/logos/marca/vertical-claim-light.png";

type LogoLayout = "horizontal" | "vertical" | "icon";

interface Props {
  size?: "normal" | "large" | "small" | "tiny";
  height?: number; // altura en px, prevalece sobre size
  layout?: LogoLayout; // horizontal, vertical o solo icono
  withClaim?: boolean; // incluir el claim/tagline
  clickToHome?: boolean; // hace el logo clickeable para ir a www.photoreka.com
  theme?: "dark" | "light"; // fuerza un tema concreto ignorando el global
}

const props = withDefaults(defineProps<Props>(), {
  size: "normal",
  layout: "vertical",
  withClaim: false,
  clickToHome: false,
});

// Obtener el tema internamente
const { themeMode } = useTheme();

// Manejador de clic para ir a www.photoreka.com
const handleLogoClick = () => {
  if (props.clickToHome) {
    window.location.href = "https://www.photoreka.com";
  }
};

// Mapa de logos según layout y themeMode
const logoMap = {
  icon: {
    dark: iconDark,
    light: iconLight,
  },
  horizontal: {
    dark: {
      withClaim: horizontalClaimDark,
      noClaim: horizontalDark,
    },
    light: {
      withClaim: horizontalClaimLight,
      noClaim: horizontalLight,
    },
  },
  vertical: {
    dark: {
      withClaim: verticalClaimDark,
      noClaim: verticalDark,
    },
    light: {
      withClaim: verticalClaimLight,
      noClaim: verticalLight,
    },
  },
};

const logoSrc = computed(() => {
  const variant = props.theme ?? themeMode.value;

  if (props.layout === "icon") {
    return logoMap.icon[variant];
  }

  const layoutLogos = logoMap[props.layout];
  const variantLogos = layoutLogos[variant];
  return props.withClaim ? variantLogos.withClaim : variantLogos.noClaim;
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
  justify-content: center;
  opacity: 0.8;
}

.photoreka-logo.clickable {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.photoreka-logo.clickable:hover {
  opacity: 1;
}

.logo-image {
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
  /* transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.3)); */
}

/* ============================
   LAYOUT DEFAULTS
   Solo aplican cuando NO hay size específico
   ============================ */

/* Vertical layout: uses size as-is (no override) */
.logo-layout-vertical {
  /* Size classes apply directly */
}

/* Horizontal layout: tamaño por defecto para navbars */
.logo-layout-horizontal:not([class*="logo-size-"]) {
  height: 45px;
}

/* Icon only: tamaño por defecto para iconos */
.logo-layout-icon:not([class*="logo-size-"]) {
  height: 50px;
}

/* ============================
   SIZE SYSTEM (prevalece sobre layout)
   Predefined heights for size prop
   ============================ */

.logo-size-tiny {
  height: 30px !important;
}

.logo-size-small {
  height: 55px !important;
}

.logo-size-normal {
  height: 130px !important;
}

.logo-size-large {
  height: 180px !important;
}

/* ============================
   MOBILE RESPONSIVE
   All sizes capped on mobile
   ============================ */
@media (max-width: 768px) {
  .logo-size-normal,
  .logo-size-large,
  .logo-size-small,
  .logo-layout-horizontal,
  .logo-layout-icon {
    height: 35px !important;
  }

  .logo-size-tiny {
    height: 25px !important;
  }
}
</style>
