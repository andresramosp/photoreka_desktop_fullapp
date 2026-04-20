<template>
  <div class="grid-cell" :class="{ 'is-loaded': loaded }">
    <img
      :src="photo.thumbnailUrl"
      :alt="`Photo ${photo.id}`"
      class="cell-image"
      draggable="false"
      @load="loaded = true"
    />

    <div class="cell-overlay">
      <button
        class="cell-action-btn remove-btn"
        title="Remove from portfolio"
        @click.stop="$emit('remove', photo)"
      >
        <n-icon :size="16"><TrashOutline /></n-icon>
      </button>
    </div>

    <div v-if="!loaded" class="cell-placeholder">
      <n-spin :size="16" />
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { NIcon, NSpin } from "naive-ui";
import { TrashOutline } from "@vicons/ionicons5";

defineProps({
  photo: { type: Object, required: true },
});

defineEmits(["remove"]);

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
  justify-content: flex-end;
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
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.remove-btn {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.remove-btn:hover {
  background: color-mix(in srgb, var(--error-color) 85%, transparent);
  transform: scale(1.1);
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
