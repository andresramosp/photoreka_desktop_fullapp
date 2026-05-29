<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton, NIcon, NText } from "naive-ui";
import {
  AddOutline,
  CloudUploadOutline,
  CloseOutline,
} from "@vicons/ionicons5";
import type { PreviewPhoto } from "@/utils/geoRecovery/types";

const props = defineProps<{
  maxPhotos: number;
  previewPhotos: PreviewPhoto[];
}>();

const emit = defineEmits<{
  fileChange: [files: File[]];
  continue: [];
  removePhoto: [id: string];
  back: [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

const hasAny = computed(() => props.previewPhotos.length > 0);

const photoCount = computed(() => props.previewPhotos.length);

const sortedPhotos = computed(() =>
  [...props.previewPhotos].sort(
    (a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id),
  ),
);

// ── Native file input/drop handlers ───────────────────────────────────────

function openFilePicker() {
  fileInput.value?.click();
}

function emitFiles(fileList: FileList | null | undefined) {
  const files = Array.from(fileList ?? []).filter((file) =>
    ["image/jpeg", "image/png"].includes(file.type),
  );
  if (files.length > 0) emit("fileChange", files);
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  emitFiles(input.files);
  input.value = "";
}

function onDrop(event: DragEvent) {
  emitFiles(event.dataTransfer?.files);
}
</script>

<template>
  <div class="step">
    <h2 class="step-title">Add your photos</h2>

    <input
      ref="fileInput"
      class="file-input"
      type="file"
      multiple
      accept="image/jpeg,image/png"
      @change="onInputChange"
    />

    <!-- Drop zone: full when empty, compact strip when files present -->
    <button
      type="button"
      :class="['dragger', { 'dragger--compact': hasAny }]"
      @click="openFilePicker"
      @dragenter.prevent
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <template v-if="!hasAny">
        <NIcon :component="CloudUploadOutline" size="36" class="dragger-icon" />
        <NText class="dragger-main">Click or drag photos here</NText>
        <NText depth="3" class="dragger-sub">
          JPEG · PNG · up to {{ maxPhotos }} files
        </NText>
      </template>
      <template v-else>
        <NIcon :component="AddOutline" size="14" />
        <span class="dragger-add-label">Add more</span>
      </template>
    </button>

    <!-- Grid: 5 fixed columns, square cells with contain -->
    <div v-if="hasAny" class="grid">
      <div
        v-for="photo in sortedPhotos"
        :key="photo.id"
        class="cell"
        :title="photo.name"
      >
        <img
          :src="photo.previewUrl"
          loading="lazy"
          decoding="async"
          :alt="photo.name"
          class="cell-img"
        />
        <button
          type="button"
          class="cell-remove"
          :title="`Remove ${photo.name}`"
          @click.stop="emit('removePhoto', photo.id)"
        >
          <NIcon :component="CloseOutline" size="12" />
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-actions">
        <NButton @click="emit('back')">Back</NButton>
        <NButton
          type="primary"
          size="large"
          :disabled="photoCount === 0"
          style="flex: 1"
          @click="emit('continue')"
        >
          {{
            photoCount > 0
              ? `Continue with ${photoCount} photo${photoCount !== 1 ? "s" : ""} \u2192`
              : "Select photos to continue"
          }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

/* ── Drop zone ───────────────────────────────────────────────────────────── */

.file-input {
  display: none;
}

.dragger {
  width: 100%;
  min-height: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 22px 18px;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.045);
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    opacity 0.18s ease;
}

.dragger:hover {
  background: rgba(255, 255, 255, 0.065);
  border-color: rgba(99, 226, 183, 0.55);
}

.dragger-icon {
  color: var(--accent-color, #63e2b7);
  margin-bottom: 8px;
}

.dragger-main {
  font-size: 15px;
  font-weight: 500;
  display: block;
}

.dragger-sub {
  font-size: 12px;
  display: block;
  margin-top: 4px;
}

.dragger--compact {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 16px;
  min-height: 34px;
  opacity: 0.55;
}

.dragger--compact:hover {
  opacity: 1;
}

.dragger-add-label {
  font-size: 12px;
}

/* ── Grid — 5 fixed columns ──────────────────────────────────────────────── */

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  /* Explicit row height = column width, so aspect-ratio never causes a
     circular-dependency bug when overflow-y kicks in and changes container width. */
  grid-auto-rows: calc((min(740px, 92vw) - 64px) / 5);
  align-content: start;
  gap: 4px;
  max-height: 340px;
  overflow-y: auto;
  border-radius: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.cell {
  overflow: hidden;
  border-radius: 4px;
  background: #111;
  position: relative;
}

/* Respect photo aspect ratio with contain + dark letterbox */
.cell-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* ── Delete button (appears on hover) ───────────────────────────────────── */

.cell-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
  padding: 0;
  line-height: 1;
}

.cell:hover .cell-remove {
  opacity: 1;
}

.cell-remove:hover {
  background: rgba(220, 50, 50, 0.9);
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-actions {
  display: flex;
  gap: 8px;
}
</style>
