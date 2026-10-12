<template>
  <div class="card build-card" @click="$emit('click', build)">
    <div class="card-preview">
      <div
        v-if="build.status !== 'completed'"
        class="build-status-badge"
        :class="statusClass"
      >
        <n-icon :size="12">
          <component :is="statusIcon" />
        </n-icon>
        {{ statusLabel }}
      </div>

      <div v-if="previewPhotos.length > 0" class="photo-stack">
        <div
          v-for="(photo, index) in previewPhotos"
          :key="photo.id"
          class="photo-item"
          :class="`photo-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl"
            :alt="`Photo ${photo.id}`"
            class="photo-thumbnail"
            loading="lazy"
          />
        </div>
        <div
          v-for="index in Math.max(0, 3 - previewPhotos.length)"
          :key="`placeholder-${index}`"
          class="photo-item"
          :class="`photo-${previewPhotos.length + index}`"
        >
          <div class="photo-placeholder-empty"></div>
        </div>
      </div>

      <div v-else class="empty-preview">
        <n-icon :size="40" color="var(--text-tertiary)">
          <ImagesOutline />
        </n-icon>
      </div>
    </div>

    <div class="card-info">
      <h3 class="card-title">{{ portfolioTitle }}</h3>
      <p class="card-meta">
        {{ photoCount }} photos · {{ formatDate(build.createdAt) }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NIcon } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  TimeOutline,
  HourglassOutline,
  ImagesOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  build: { type: Object, required: true },
});

defineEmits(["click"]);

const previewPhotos = computed(() => {
  const items = props.build.photoItems || [];
  return items.slice(0, 3);
});

const photoCount = computed(
  () => props.build.resultCount ?? props.build.targetSize ?? 0,
);

const portfolioTitle = computed(() => `Portfolio #${props.build.id}`);

const statusClass = computed(() => {
  const s = props.build.status;
  if (s === "failed") return "status-failed";
  return "status-running";
});

const statusLabel = computed(() => {
  const s = props.build.status;
  if (s === "failed") return "Failed";
  if (s === "pending") return "Pending";
  return s.charAt(0).toUpperCase() + s.slice(1);
});

const statusIcon = computed(() => {
  const s = props.build.status;
  if (s === "completed") return CheckmarkCircleOutline;
  if (s === "failed") return CloseCircleOutline;
  if (s === "pending") return TimeOutline;
  return HourglassOutline;
});

const formatDate = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
};
</script>

<style scoped>
.build-card {
  position: relative;
}

.build-status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  z-index: 2;
  backdrop-filter: blur(4px);
}

.status-failed {
  background: var(--error-color-light);
  color: var(--error-color);
}

.status-running {
  background: var(--warning-color-light);
  color: var(--warning-color);
}

.empty-preview {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-container);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}
</style>