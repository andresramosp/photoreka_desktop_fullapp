<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>System</h1>
      <p>
        Low-level maintenance tools: cache management and other system
        operations
      </p>
    </div>

    <!-- Cache Section -->
    <div class="system-block">
      <div class="block-title">
        <n-icon size="18"><LayersOutline /></n-icon>
        Cache Invalidation
      </div>
      <p class="block-desc">
        Force-expire Redis caches for one specific user or for all users at
        once. Useful after manual data corrections or when the UI shows stale
        data.
      </p>

      <!-- Target user selector -->
      <div class="cache-controls">
        <div class="control-row">
          <label class="control-label">Target user</label>
          <n-radio-group v-model:value="targetMode" size="small">
            <n-radio-button value="all">All users</n-radio-button>
            <n-radio-button value="specific">Specific user ID</n-radio-button>
          </n-radio-group>
          <n-input
            v-if="targetMode === 'specific'"
            v-model:value="specificUserId"
            placeholder="User ID (numeric)"
            size="small"
            style="width: 180px"
            clearable
          />
        </div>
      </div>

      <!-- Action cards -->
      <div class="action-grid">
        <div
          v-for="action in cacheActions"
          :key="action.type"
          class="action-card"
          :class="{ 'action-card--danger': action.type === 'all' }"
        >
          <div class="action-header">
            <span class="action-title">{{ action.label }}</span>
            <n-tag size="tiny" :type="action.tagType">{{ action.scope }}</n-tag>
          </div>
          <p class="action-desc">{{ action.description }}</p>
          <n-button
            size="small"
            :type="action.type === 'all' ? 'error' : 'primary'"
            :ghost="action.type !== 'all'"
            :loading="loading[action.type]"
            :disabled="targetMode === 'specific' && !specificUserId.trim()"
            @click="triggerInvalidation(action.type)"
          >
            {{ action.type === "all" ? "Invalidate all caches" : "Invalidate" }}
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useMessage } from "naive-ui";
import { LayersOutline } from "@vicons/ionicons5";
import { api } from "../../utils/axios";

const message = useMessage();

const targetMode = ref<"all" | "specific">("all");
const specificUserId = ref("");

type InvalidationType =
  | "photoListChanged"
  | "photosGeolocationUpdate"
  | "photosDeleted"
  | "analysisCompleted"
  | "all";

const loading = reactive<Record<InvalidationType, boolean>>({
  photoListChanged: false,
  photosGeolocationUpdate: false,
  photosDeleted: false,
  analysisCompleted: false,
  all: false,
});

const cacheActions: {
  type: InvalidationType;
  label: string;
  scope: string;
  tagType: "default" | "info" | "warning" | "error";
  description: string;
}[] = [
  {
    type: "photoListChanged",
    label: "Photo List Changed",
    scope: "Light",
    tagType: "default",
    description:
      "Expires the photo list and preview caches + duplicate checks. Use after manual metadata edits.",
  },
  {
    type: "photosGeolocationUpdate",
    label: "Geolocation Update",
    scope: "Light",
    tagType: "default",
    description:
      "Expires photo list and preview caches after geolocation data was changed.",
  },
  {
    type: "photosDeleted",
    label: "Photos Deleted",
    scope: "Medium",
    tagType: "warning",
    description:
      "Expires photo list, search index, tags, 3D views and portfolio caches. Use after manual photo removal.",
  },
  {
    type: "analysisCompleted",
    label: "Analysis Completed",
    scope: "Full",
    tagType: "warning",
    description:
      "Expires every cache including expensive UMAP/3D reductions. Use after bulk re-analysis.",
  },
  {
    type: "all",
    label: "Nuke All",
    scope: "Nuclear",
    tagType: "error",
    description:
      "Runs all four invalidations in sequence (photoCount=999). Clears every cache for the target.",
  },
];

async function triggerInvalidation(type: InvalidationType) {
  const userId =
    targetMode.value === "all" ? "all" : specificUserId.value.trim();

  if (targetMode.value === "specific" && !userId) {
    message.warning("Please enter a user ID");
    return;
  }

  loading[type] = true;
  try {
    const { data } = await api.post("/api/admin/system/cache/invalidate", {
      type,
      userId,
      photoCount: 999,
    });
    message.success(
      `Done — ${data.processedUsers} user(s) invalidated (${type})`,
    );
  } catch (err: any) {
    const msg = err.response?.data?.message ?? err.message ?? "Unknown error";
    message.error(`Cache invalidation failed: ${msg}`);
  } finally {
    loading[type] = false;
  }
}
</script>

<style scoped>
.admin-section {
  max-width: 900px;
}

.section-header {
  margin-bottom: 28px;
}
.section-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px;
}
.section-header p {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

/* System block */
.system-block {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}

.block-desc {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 20px;
  line-height: 1.5;
}

/* Controls */
.cache-controls {
  margin-bottom: 20px;
}
.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.control-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

/* Action grid */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.action-card {
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  transition: border-color 0.15s;
}
.action-card:hover {
  border-color: #c7d2fe;
}
.action-card--danger {
  background: #fff8f8;
  border-color: #fecaca;
}
.action-card--danger:hover {
  border-color: #f87171;
}

.action-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.action-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
.action-desc {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
  flex: 1;
}
</style>
