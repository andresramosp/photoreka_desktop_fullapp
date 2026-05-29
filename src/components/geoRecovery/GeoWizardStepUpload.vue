<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import {
  NButton,
  NIcon,
  NProgress,
  NText,
  NUpload,
  NUploadDragger,
  type UploadCustomRequestOptions,
} from "naive-ui";
import { CheckmarkCircleOutline, CloudUploadOutline } from "@vicons/ionicons5";
import type { UploadProgress } from "@/utils/geoRecovery/upload";
import type { LocalPhotoRecord } from "@/utils/geoRecovery/types";

const props = defineProps<{
  maxPhotos: number;
  photos: LocalPhotoRecord[];
  pendingFiles: File[];
  photoCount: number;
  pendingCount: number;
  uploading: boolean;
  uploadProgress: UploadProgress | null;
}>();

const emit = defineEmits<{
  fileChange: [files: File[]];
  upload: [];
  continue: [];
}>();

// ── Local blob URL management ─────────────────────────────────────────────

function fileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

const pendingUrls = ref<Record<string, string>>({});

watch(
  () => props.pendingFiles,
  (newFiles) => {
    const newKeySet = new Set(newFiles.map(fileKey));
    // Revoke URLs for files that are no longer pending
    for (const [key, url] of Object.entries(pendingUrls.value)) {
      if (!newKeySet.has(key)) URL.revokeObjectURL(url);
    }
    // Build updated record, reusing existing URLs
    const next: Record<string, string> = {};
    for (const file of newFiles) {
      const key = fileKey(file);
      next[key] = pendingUrls.value[key] ?? URL.createObjectURL(file);
    }
    pendingUrls.value = next;
  },
  { immediate: true },
);

onUnmounted(() => {
  for (const url of Object.values(pendingUrls.value)) URL.revokeObjectURL(url);
});

// ── Grid items ────────────────────────────────────────────────────────────

interface GridItem {
  key: string;
  previewUrl: string | null;
  name: string;
  isPending: boolean;
}

const gridItems = computed((): GridItem[] => {
  const items: GridItem[] = [];
  for (const photo of props.photos) {
    items.push({
      key: `up-${photo.clientPhotoId}`,
      previewUrl: photo.thumbUrl ?? null,
      name: photo.originalName,
      isPending: false,
    });
  }
  for (const file of props.pendingFiles) {
    const k = fileKey(file);
    items.push({
      key: `pend-${k}`,
      previewUrl: pendingUrls.value[k] ?? null,
      name: file.name,
      isPending: true,
    });
  }
  return items;
});

// ── Progress visibility ───────────────────────────────────────────────────

const showProgress = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.uploading,
  (active) => {
    if (active) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      showProgress.value = true;
    } else {
      // Keep visible briefly so the user sees 100%, then fade out
      hideTimer = setTimeout(() => {
        showProgress.value = false;
      }, 1800);
    }
  },
);

watch(
  () => props.uploadProgress,
  (p) => {
    if (p) showProgress.value = true;
  },
);

// ── Cell size ─────────────────────────────────────────────────────────────

const cellSize = computed(() => {
  const n = gridItems.value.length;
  if (n <= 10) return 92;
  if (n <= 50) return 68;
  if (n <= 200) return 50;
  if (n <= 1000) return 34;
  if (n <= 3000) return 26;
  return 20;
});

const hasAny = computed(() => gridItems.value.length > 0);

// ── Upload handler ────────────────────────────────────────────────────────

function onFileChange(options: { fileList: any[] }) {
  const files = options.fileList
    .map((f) => f.file as File | undefined)
    .filter((f): f is File => Boolean(f));
  emit("fileChange", files);
}

function customRequest(options: UploadCustomRequestOptions) {
  options.onFinish();
}

// ── Status label ─────────────────────────────────────────────────────────

const statusLabel = computed(() => {
  const up = props.photoCount;
  const pend = props.pendingCount;
  if (up > 0 && pend > 0) return `${up} uploaded · ${pend} pending`;
  if (up > 0 && pend === 0) return `${up} photo${up !== 1 ? "s" : ""} uploaded`;
  if (pend > 0)
    return `${pend} photo${pend !== 1 ? "s" : ""} selected — click Upload`;
  return "";
});
</script>

<template>
  <h2 class="step-title">Add your photos</h2>

  <!-- Drop zone — compact once files are selected -->
  <NUpload
    multiple
    :default-upload="false"
    :custom-request="customRequest"
    :show-file-list="false"
    accept="image/jpeg,image/png"
    @change="onFileChange"
  >
    <NUploadDragger :class="['dragger', { 'dragger--compact': hasAny }]">
      <NIcon :size="hasAny ? 26 : 42" :component="CloudUploadOutline" />
      <NText :style="{ fontSize: hasAny ? '13px' : '15px' }">
        {{ hasAny ? "Add more photos" : "Click or drag photos here" }}
      </NText>
      <NText v-if="!hasAny" depth="3" style="font-size: 12px; margin-top: 3px">
        JPEG or PNG · up to {{ maxPhotos }} files
      </NText>
    </NUploadDragger>
  </NUpload>

  <!-- Photo grid — appears as soon as files are selected -->
  <div v-if="hasAny" class="photo-grid" :style="{ '--cell': cellSize + 'px' }">
    <div
      v-for="item in gridItems"
      :key="item.key"
      class="photo-cell"
      :class="{
        'photo-cell--pending': item.isPending,
        'photo-cell--uploading': item.isPending && uploading,
      }"
      :title="item.name"
    >
      <img
        v-if="item.previewUrl"
        :src="item.previewUrl"
        loading="lazy"
        decoding="async"
        :alt="item.name"
        class="photo-cell-img"
      />
      <div v-else class="photo-cell-placeholder" />
      <!-- Dim overlay for pending cells -->
      <div v-if="item.isPending" class="photo-cell-overlay" />
    </div>
  </div>

  <!-- Status line -->
  <div v-if="hasAny && statusLabel" class="status-line">
    <NIcon
      v-if="photoCount > 0 && pendingCount === 0"
      :component="CheckmarkCircleOutline"
      size="13"
      class="status-icon-ok"
    />
    {{ statusLabel }}
  </div>

  <!-- Progress (auto-hides after upload) -->
  <Transition name="fade">
    <div v-if="showProgress && uploadProgress" class="progress-block">
      <NProgress
        :percentage="
          Math.round(
            ((uploadProgress.done + uploadProgress.failed) /
              Math.max(uploadProgress.total, 1)) *
              100,
          )
        "
        :status="
          uploadProgress.failed > 0
            ? 'warning'
            : !uploading
              ? 'success'
              : 'default'
        "
        :indicator-placement="'inside'"
      />
      <NText depth="3" style="font-size: 11px; margin-top: 2px">
        {{ uploadProgress.done }}&thinsp;/&thinsp;{{ uploadProgress.total }}
        <span v-if="uploadProgress.failed > 0">
          · {{ uploadProgress.failed }} failed</span
        >
        <span v-if="uploading && uploadProgress.current">
          · {{ uploadProgress.current }}</span
        >
      </NText>
    </div>
  </Transition>

  <!-- Action buttons -->
  <div class="action-row">
    <NButton
      type="primary"
      :loading="uploading"
      :disabled="pendingCount === 0"
      @click="emit('upload')"
    >
      {{
        uploading
          ? "Uploading…"
          : pendingCount > 0
            ? `Upload ${pendingCount} photo${pendingCount !== 1 ? "s" : ""}`
            : "Upload"
      }}
    </NButton>
    <NButton :disabled="photoCount === 0" @click="emit('continue')">
      Continue →
    </NButton>
  </div>
</template>

<style scoped>
.step-title {
  margin: 0 0 14px;
  font-size: 20px;
}

/* ── Drop zone ───────────────────────────────────────────────────────────── */

:deep(.dragger.dragger--compact .n-upload-dragger) {
  padding-top: 10px;
  padding-bottom: 10px;
}

/* ── Photo grid ──────────────────────────────────────────────────────────── */

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--cell), 1fr));
  gap: 3px;
  margin: 12px 0 6px;
  max-height: 270px;
  overflow-y: auto;
  border-radius: 6px;
  /* Thin scrollbar so it doesn't intrude */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.photo-cell {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  position: relative;
}

.photo-cell-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-cell-placeholder {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.08);
}

/* Dim overlay on pending cells */
.photo-cell-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  transition: background 0.3s ease;
}

/* Pulsing glow when actively uploading */
.photo-cell--uploading .photo-cell-overlay {
  animation: pulse-dim 1.3s ease-in-out infinite;
}

@keyframes pulse-dim {
  0%,
  100% {
    background: rgba(0, 0, 0, 0.32);
  }
  50% {
    background: rgba(0, 0, 0, 0.04);
  }
}

/* ── Status line ─────────────────────────────────────────────────────────── */

.status-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 4px 0 10px;
}

.status-icon-ok {
  color: #63e2b7;
  flex-shrink: 0;
}

/* ── Progress ────────────────────────────────────────────────────────────── */

.progress-block {
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* ── Action row ──────────────────────────────────────────────────────────── */

.action-row {
  display: flex;
  gap: 8px;
}

/* ── Fade transition ─────────────────────────────────────────────────────── */

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
