<template>
  <div class="grid-cell" :class="{ 'is-loaded': loaded }">
    <img
      :src="photo.originalUrl || photo.thumbnailUrl"
      :alt="`Photo ${photo.id}`"
      class="cell-image"
      draggable="false"
      @load="loaded = true"
    />

    <div class="cell-overlay">
      <n-button
        size="small"
        class="action-button info-button"
        title="Photo details"
        @click.stop="$emit('info', photo)"
      >
        <template #icon>
          <n-icon><InformationCircleOutline /></n-icon>
        </template>
      </n-button>
      <n-button
        size="small"
        class="action-button remove-button"
        title="Remove from portfolio"
        @click.stop="$emit('remove', photo)"
      >
        <template #icon>
          <n-icon><TrashOutline /></n-icon>
        </template>
      </n-button>
    </div>

    <div v-if="!loaded" class="cell-placeholder">
      <n-spin :size="16" />
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { NButton, NIcon, NSpin } from "naive-ui";
import { TrashOutline, InformationCircleOutline } from "@vicons/ionicons5";

defineProps({
  photo: { type: Object, required: true },
});

defineEmits(["remove", "info"]);

const loaded = ref(false);
</script>

<style scoped>
.grid-cell {
  position: relative;
  overflow: hidden;
  background: var(--bg-container);
  cursor: grab;
}

.grid-cell:active {
  cursor: grabbing;
}

.cell-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.3s ease;
  user-select: none;
  pointer-events: none;
}

.grid-cell.is-loaded .cell-image {
  opacity: 1;
}

.cell-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.grid-cell:hover .cell-overlay {
  opacity: 1;
  background: rgba(0, 0, 0, 0.25);
}

.cell-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  opacity: 0.9;
  cursor: pointer;
  transition: opacity 0.2s ease !important;
}

.action-button {
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  width: 32px;
  height: 32px;
  opacity: 0.9;
  transition: opacity 0.2s ease !important;
}

.action-button:hover {
  opacity: 1 !important;
}

.info-button {
  background-color: var(--info-color) !important;
  color: white !important;
}

.remove-button {
  background-color: rgba(0, 0, 0, 0.6) !important;
  color: white !important;
}

.remove-button:hover {
  background-color: var(--error-color) !important;
}

.cell-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-container);
}
</style>
