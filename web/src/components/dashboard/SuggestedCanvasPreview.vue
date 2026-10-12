<template>
  <div class="suggested-canvas-preview">
    <CanvasBoardPreview
      :photos="previewPhotos"
      :fit-scale="FIT_SCALE"
      @open-full="emit('open-full')"
    />

    <!-- Rótulo flotante: el nombre propuesto y la invitación a usarlo como
         punto de partida. No es un portfolio hecho, es una idea semilla. -->
    <div class="suggested-overlay" @click="emit('open-full')">
      <div class="suggested-title-card">
        <span class="suggested-eyebrow">
          <n-icon :size="13" class="suggested-eyebrow-icon">
            <CanvasIcon />
          </n-icon>
          <span>Weekly Moodboard seed</span>
        </span>
        <h3 class="suggested-title">{{ proposal?.title }}</h3>
      </div>
      <p class="suggested-hint">
        <n-icon :size="16" class="suggested-hint-icon"><BulbOutline /></n-icon>
        <span>{{ hint }}</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { BulbOutline } from "@vicons/ionicons5";
import CanvasBoardPreview from "@/components/dashboard/CanvasBoardPreview.vue";
import { useSuggestedCanvas } from "@/composables/useSuggestedCanvas";
import { getIconComponent, getToolById } from "@/config/toolsConfig";

const emit = defineEmits(["open-full"]);

// El mismo icono que lleva la herramienta Canvas en el menú y en el dashboard:
// el rótulo dice de qué es semilla esto.
const CanvasIcon = getIconComponent(getToolById("canvas")?.icon);

// Un clic de alejar del propio control de zoom del preview (1.11 por clic):
// el racimo se aparta del rótulo del título y de la frase de abajo.
const FIT_SCALE = 1 / 1.11;

const { proposal, previewPhotos } = useSuggestedCanvas();

// A nudge, not a manual: the seed is an invitation to start, so the copy
// asks rather than instructs. Picked by title so it stays put across renders.
const HINTS = [
  "Not sure where to start today? Start here.",
  "A loose idea from your own archive. See where it takes you.",
  "Twelve photos that seem to belong together. Your move.",
  "No brief, no client. Just a thread worth pulling.",
];
const hint = computed(() => {
  const title = proposal.value?.title ?? "";
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return HINTS[hash % HINTS.length];
});
</script>

<style scoped>
.suggested-canvas-preview {
  position: relative;
  width: 100%;
  height: 100%;
}

/* La capa sólo captura clics en sus dos piezas de texto; el resto deja pasar
   el gesto al tablero (zoom, pan, clic). */
.suggested-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 22px;
  pointer-events: none;
}

.suggested-title-card,
.suggested-hint {
  pointer-events: auto;
  cursor: pointer;
}

.suggested-title-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-container, #111) 78%, transparent);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.suggested-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--primary-color, #4f9cf9);
}

.suggested-eyebrow-icon {
  flex-shrink: 0;
}

.suggested-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

/* Sits where the panel's floating button lives on other modes, and takes
   its place: clicking it opens the board. */
.suggested-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  max-width: 460px;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-container, #111) 78%, transparent);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transition: border-color 0.2s ease;
}

.suggested-hint:hover {
  border-color: var(--primary-color, #4f9cf9);
}

.suggested-hint-icon {
  flex-shrink: 0;
  color: var(--primary-color, #4f9cf9);
}

@media (max-width: 768px) {
  .suggested-title {
    font-size: 15px;
  }
  .suggested-hint {
    font-size: 12px;
  }
}
</style>
