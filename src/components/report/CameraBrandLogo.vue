<template>
  <span class="brand-logo" :class="{ 'brand-logo--text': !logo }">
    <svg
      v-if="logo"
      class="brand-logo-mark"
      :style="{ height: markHeight }"
      :viewBox="logo.viewBox"
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      role="img"
      :aria-label="brand.label"
      v-html="logo.body"
    />
    <span v-else class="brand-logo-initials" :title="props.cameraLabel || ''">
      {{ initials }}
    </span>
  </span>
</template>

<script setup>
import { computed } from "vue";
import { CAMERA_BRAND_LOGOS } from "@/assets/logos/cameraLogos.js";
import { resolveCameraBrand } from "@/utils/exifStats.js";

const props = defineProps({
  /** Texto completo de la cámara tal y como vino en el EXIF. */
  cameraLabel: {
    type: String,
    default: null,
  },
});

const brand = computed(() => resolveCameraBrand(props.cameraLabel));

const logo = computed(() =>
  brand.value ? (CAMERA_BRAND_LOGOS[brand.value.slug] ?? null) : null,
);

/**
 * Compensación óptica: a la misma altura, la manzana de Apple o el punto rojo
 * de Leica se ven diminutos al lado de un "FUJIFILM" que ocupa cinco veces su
 * ancho. Las marcas cuadradas suben de alto hasta emparejar la mancha de tinta
 * con la de los logotipos alargados.
 */
const markHeight = computed(() => {
  if (!logo.value) return null;
  const [, , width, height] = logo.value.viewBox.split(/\s+/).map(Number);
  const ratio = height > 0 ? width / height : 1;
  if (ratio >= 3) return "var(--brand-logo-height)";
  if (ratio >= 1.5) return "calc(var(--brand-logo-height) * 1.2)";
  return "calc(var(--brand-logo-height) * 1.35)";
});

// Sin logotipo se cae a las iniciales del cuerpo, que siguen identificando la
// fila mejor que un hueco vacío (y las marcas de nicho son muchas más de las
// que tiene sentido empaquetar).
const initials = computed(() => {
  const text = (props.cameraLabel || "").trim();
  if (!text) return "?";
  return text.slice(0, 2).toUpperCase();
});
</script>

<style scoped>
.brand-logo {
  --brand-logo-height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 84px;
  height: 26px;
  flex-shrink: 0;
  color: var(--text-primary);
}

.brand-logo-mark {
  max-width: 100%;
  width: auto;
}

.brand-logo-initials {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .brand-logo {
    --brand-logo-height: 14px;
    width: 64px;
    height: 20px;
  }
}
</style>
