<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :bordered="false"
    :closable="true"
    :mask-closable="true"
    style="max-width: 720px; max-height: 85vh"
    @update:show="$emit('update:show', $event)"
  >
    <!-- Loading state -->
    <div v-if="loading" class="health-loading">
      <n-spin :size="48" />
      <p>Running health check…</p>
    </div>

    <!-- Report -->
    <template v-else-if="report">
      <!-- Summary -->
      <div class="health-summary">
        <div
          class="health-stat"
          :class="report.unhealthyPhotos === 0 ? 'stat-ok' : 'stat-warn'"
        >
          <span class="stat-number">{{ report.totalPhotos }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="health-stat stat-ok">
          <span class="stat-number">{{ report.healthyPhotos }}</span>
          <span class="stat-label">Healthy</span>
        </div>
        <div
          class="health-stat"
          :class="report.unhealthyPhotos > 0 ? 'stat-error' : 'stat-ok'"
        >
          <span class="stat-number">{{ report.unhealthyPhotos }}</span>
          <span class="stat-label">Unhealthy</span>
        </div>
      </div>

      <!-- Overall badge -->
      <div class="health-verdict">
        <n-tag v-if="report.unhealthyPhotos === 0" type="success" size="small">
          All photos are healthy
        </n-tag>
        <n-tag v-else type="error" size="small">
          {{ report.unhealthyPhotos }} photo{{
            report.unhealthyPhotos !== 1 ? "s" : ""
          }}
          with missing data
        </n-tag>
      </div>

      <!-- Filter tabs -->
      <div class="health-filter-bar">
        <n-radio-group v-model:value="photoFilter" size="small">
          <n-radio-button value="all"
            >All ({{ report.totalPhotos }})</n-radio-button
          >
          <n-radio-button
            value="unhealthy"
            :disabled="report.unhealthyPhotos === 0"
          >
            Unhealthy ({{ report.unhealthyPhotos }})
          </n-radio-button>
          <n-radio-button
            value="healthy"
            :disabled="report.healthyPhotos === 0"
          >
            Healthy ({{ report.healthyPhotos }})
          </n-radio-button>
        </n-radio-group>
      </div>

      <!-- Photo list -->
      <div class="health-photos-list">
        <div
          v-for="photo in filteredPhotos"
          :key="photo.photoId"
          class="health-photo-row"
          :class="{ 'photo-unhealthy': !photo.ok }"
          @click="toggleExpanded(photo.photoId)"
        >
          <div class="photo-row-header">
            <span class="photo-id">#{{ photo.photoId }}</span>
            <span class="photo-checks-count">
              {{ photo.passedChecks }}/{{ photo.totalChecks }} checks
            </span>
            <n-tag :type="photo.ok ? 'success' : 'error'" size="tiny">
              {{ photo.ok ? "OK" : `${photo.failedChecks} failed` }}
            </n-tag>
            <n-icon
              size="14"
              class="expand-icon"
              :class="{ rotated: expandedIds.has(photo.photoId) }"
            >
              <ChevronIcon />
            </n-icon>
          </div>

          <!-- Expanded: check details -->
          <transition name="expand">
            <div
              v-if="expandedIds.has(photo.photoId)"
              class="photo-checks-detail"
            >
              <div
                v-for="check in photo.checks"
                :key="check.label"
                class="check-row"
                :class="{ 'check-fail': !check.ok }"
              >
                <span class="check-icon">{{ check.ok ? "✅" : "❌" }}</span>
                <span class="check-label">{{ check.label }}</span>
              </div>
            </div>
          </transition>
        </div>

        <p v-if="filteredPhotos.length === 0" class="no-data">
          No photos to display
        </p>
      </div>
    </template>

    <!-- Error state -->
    <div v-else-if="error" class="health-error">
      <p>Failed to run health check</p>
      <n-button size="small" @click="$emit('retry')">Retry</n-button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  NModal,
  NSpin,
  NTag,
  NButton,
  NIcon,
  NRadioGroup,
  NRadioButton,
} from "naive-ui";
import { ChevronForwardOutline as ChevronIcon } from "@vicons/ionicons5";

export interface HealthCheck {
  label: string;
  ok: boolean;
}

export interface PhotoHealthReport {
  photoId: number;
  ok: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  missing: string[];
  checks: HealthCheck[];
}

export interface HealthReport {
  processId: string;
  packageId: string;
  totalPhotos: number;
  healthyPhotos: number;
  unhealthyPhotos: number;
  photos: PhotoHealthReport[];
}

const props = defineProps<{
  show: boolean;
  title?: string;
  loading: boolean;
  report: HealthReport | null;
  error: boolean;
}>();

defineEmits<{
  "update:show": [value: boolean];
  retry: [];
}>();

const photoFilter = ref<"all" | "unhealthy" | "healthy">("all");
const expandedIds = ref(new Set<number>());

const filteredPhotos = computed(() => {
  if (!props.report) return [];
  const photos = props.report.photos;
  if (photoFilter.value === "unhealthy") return photos.filter((p) => !p.ok);
  if (photoFilter.value === "healthy") return photos.filter((p) => p.ok);
  return photos;
});

function toggleExpanded(id: number) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}
</script>

<style scoped>
.health-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 14px;
}

/* Summary cards */
.health-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.health-stat {
  flex: 1;
  text-align: center;
  padding: 14px 8px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
}

.health-stat.stat-ok {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.health-stat.stat-warn {
  background: #fffbeb;
  border-color: #fde68a;
}

.health-stat.stat-error {
  background: #fef2f2;
  border-color: #fecaca;
}

.stat-number {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.health-verdict {
  margin-bottom: 14px;
}

/* Filter */
.health-filter-bar {
  margin-bottom: 12px;
}

/* Photo list */
.health-photos-list {
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
}

.health-photo-row {
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.12s;
}

.health-photo-row:last-child {
  border-bottom: none;
}

.health-photo-row:hover {
  background: #f8fafc;
}

.health-photo-row.photo-unhealthy {
  background: #fef2f2;
}

.health-photo-row.photo-unhealthy:hover {
  background: #fee2e2;
}

.photo-row-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
}

.photo-id {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
  min-width: 60px;
}

.photo-checks-count {
  flex: 1;
  font-size: 12px;
  color: #94a3b8;
}

.expand-icon {
  color: #94a3b8;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.expand-icon.rotated {
  transform: rotate(90deg);
}

/* Expanded checks */
.photo-checks-detail {
  padding: 0 14px 10px 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 16px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #64748b;
  padding: 2px 0;
}

.check-row.check-fail {
  color: #ef4444;
  font-weight: 500;
}

.check-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.check-label {
  word-break: break-all;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  margin: 0;
  padding: 20px;
  text-align: center;
  font-style: italic;
}

.health-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: #ef4444;
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
