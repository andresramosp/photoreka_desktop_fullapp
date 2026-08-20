<template>
  <div class="pi-header">
    <div class="pi-header-left">
      <span class="pi-filename" :title="filename">{{ filename }}</span>
      <n-button
        size="tiny"
        quaternary
        class="pi-copy-btn"
        @click="emit('copy-name')"
        title="Copy name to clipboard"
      >
        <template #icon>
          <n-icon><CopyIcon /></n-icon>
        </template>
      </n-button>
    </div>

    <!-- El contador solo existe si la pantalla que abre el dialogo pasa la
         lista navegable; varias (chat widget, swap, dashboard) no lo hacen. -->
    <div v-if="showCounter" class="pi-header-center">
      <n-button
        size="tiny"
        quaternary
        circle
        :disabled="!hasPrevious"
        @click="emit('navigate', currentIndex - 1)"
        title="Previous photo (left arrow)"
      >
        <template #icon>
          <n-icon size="16"><ChevronBack /></n-icon>
        </template>
      </n-button>
      <span class="pi-counter">
        {{ currentIndex + 1 }} <span class="pi-counter-sep">of</span>
        {{ totalPhotos }}
      </span>
      <n-button
        size="tiny"
        quaternary
        circle
        :disabled="!hasNext"
        @click="emit('navigate', currentIndex + 1)"
        title="Next photo (right arrow)"
      >
        <template #icon>
          <n-icon size="16"><ChevronForward /></n-icon>
        </template>
      </n-button>
    </div>

    <!-- Columna vacia a proposito: equilibra la rejilla para que el contador
         quede centrado respecto a la cabecera. -->
    <div class="pi-header-right"></div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButton, NIcon } from "naive-ui";
import {
  CopyOutline as CopyIcon,
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
} from "@vicons/ionicons5";

defineOptions({ name: "PhotoInfoHeader" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  currentIndex: { type: Number, default: -1 },
  totalPhotos: { type: Number, default: 0 },
});

const emit = defineEmits(["copy-name", "navigate"]);

const filename = computed(
  () => props.selectedPhoto?.originalFileName || "Untitled",
);

const showCounter = computed(
  () => props.totalPhotos > 1 && props.currentIndex >= 0,
);

const hasPrevious = computed(() => props.currentIndex > 0);
const hasNext = computed(() => props.currentIndex < props.totalPhotos - 1);
</script>

<style scoped>
.pi-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
}

.pi-header-left {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.pi-filename {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pi-copy-btn {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.pi-header-center {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  justify-self: center;
}

.pi-counter {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--text-secondary);
  min-width: 96px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pi-counter-sep {
  color: var(--text-tertiary);
}

.pi-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-xs);
  /* La X de cierre la pinta el propio n-card a la derecha de esta cabecera. */
  padding-right: var(--spacing-xs);
}
</style>
