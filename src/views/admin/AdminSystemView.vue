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
          <div class="target-toggle" role="group" aria-label="Target user mode">
            <n-button
              size="small"
              :type="targetMode === 'all' ? 'primary' : 'default'"
              :ghost="targetMode !== 'all'"
              @click="targetMode = 'all'"
            >
              All users
            </n-button>
            <n-button
              size="small"
              :type="targetMode === 'specific' ? 'primary' : 'default'"
              :ghost="targetMode !== 'specific'"
              @click="targetMode = 'specific'"
            >
              Specific user ID
            </n-button>
          </div>
          <n-input
            v-if="targetMode === 'specific'"
            v-model:value="specificUserId"
            placeholder="User ID (numeric)"
            size="small"
            style="width: 180px"
            inputmode="numeric"
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
            :disabled="targetMode === 'specific' && !isSpecificUserIdValid"
            @click="triggerInvalidation(action.type)"
          >
            {{ action.type === "all" ? "Invalidate all caches" : "Invalidate" }}
          </n-button>
        </div>
      </div>
    </div>

    <!-- Score Smoothing Section -->
    <div class="system-block">
      <div class="block-title">
        <n-icon size="18"><SwapHorizontalOutline /></n-icon>
        Score Smoothing — volver al original
      </div>
      <p class="block-desc">
        Deshace la regularización: el producto vuelve a leer exactamente lo que
        dijo el LLM, copiando <code>artistic_scores_raw</code> encima de las
        puntuaciones activas. No recalcula nada, así que es instantáneo. Para
        volver a corregir, se relanza el motor desde la ficha del usuario: parte
        del mismo original y da el mismo resultado. Usa el selector de usuario
        de arriba.
      </p>

      <div class="smoothing-status">
        <template v-if="smoothingStatus">
          <div class="status-item">
            <span class="status-value">{{
              smoothingStatus.photosProcessed
            }}</span>
            <span class="status-label">fotos pasadas por el motor</span>
          </div>
          <div class="status-item">
            <span class="status-value status-value--accent">
              {{ smoothingStatus.photosCorrected }}
            </span>
            <span class="status-label">con los scores corregidos</span>
          </div>
          <div class="status-item">
            <span class="status-value">{{ smoothingStatus.users }}</span>
            <span class="status-label">usuarios afectados</span>
          </div>
        </template>
        <span v-else class="status-label">Cargando estado…</span>
        <n-button
          size="tiny"
          tertiary
          :loading="smoothingStatusLoading"
          @click="loadSmoothingStatus"
        >
          Actualizar
        </n-button>
      </div>

      <div class="action-grid">
        <div class="action-card">
          <div class="action-header">
            <span class="action-title">Volver a originales</span>
            <n-tag size="tiny" type="default">raw</n-tag>
          </div>
          <p class="action-desc">
            Revert instantáneo: el producto vuelve a leer exactamente lo que
            dijo el LLM.
          </p>
          <n-button
            size="small"
            ghost
            :loading="smoothingLoading"
            :disabled="targetMode === 'specific' && !isSpecificUserIdValid"
            @click="revertScores()"
          >
            Volver a originales
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { LayersOutline, SwapHorizontalOutline } from "@vicons/ionicons5";
import { api } from "../../utils/axios";

const message = useMessage();
const dialog = useDialog();

const targetMode = ref<"all" | "specific">("all");
const specificUserId = ref("");
const isSpecificUserIdValid = computed(() =>
  /^\d+$/.test(specificUserId.value.trim()),
);

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
      "Expires photo list + preview + duplicate-check caches only. Does not touch search, tags, or expensive 3D/tagcloud caches.",
  },
  {
    type: "photosGeolocationUpdate",
    label: "Geolocation Update",
    scope: "Light",
    tagType: "default",
    description:
      "Expires only photo list and preview caches after geolocation edits.",
  },
  {
    type: "photosDeleted",
    label: "Photos Deleted",
    scope: "Medium",
    tagType: "warning",
    description:
      "Expires list/search/tags/scoring/duplicates immediately. Expensive 3D/tagcloud/portfolio caches are invalidated when threshold or payload-boundary rules are met.",
  },
  {
    type: "analysisCompleted",
    label: "Analysis Completed",
    scope: "Full",
    tagType: "warning",
    description:
      "Expires list/search/tags/scoring/duplicates immediately. Expensive UMAP/3D/tagcloud/portfolio caches follow watermark threshold (or payload boundary).",
  },
  {
    type: "all",
    label: "Nuke All",
    scope: "Nuclear",
    tagType: "error",
    description:
      "Forces all cache groups for the target user. For global runs (all users), expensive-cache warmup is skipped.",
  },
];

async function triggerInvalidation(type: InvalidationType) {
  const rawUserId = specificUserId.value.trim();
  const userId = targetMode.value === "all" ? "all" : rawUserId;

  if (targetMode.value === "specific" && !userId) {
    message.warning("Please enter a user ID");
    return;
  }

  if (targetMode.value === "specific" && !isSpecificUserIdValid.value) {
    message.warning("User ID must be a positive integer");
    return;
  }

  loading[type] = true;
  try {
    const { data } = await api.post("/api/admin/system/cache/invalidate", {
      type,
      userId: targetMode.value === "all" ? "all" : String(Number(rawUserId)),
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

// ─── Score smoothing: deshacer la corrección ───

interface SmoothingStatus {
  photosProcessed: number;
  photosCorrected: number;
  users: number;
}

const smoothingStatus = ref<SmoothingStatus | null>(null);
const smoothingStatusLoading = ref(false);
const smoothingLoading = ref(false);

/** Ámbito actual, reutilizando el selector de usuario del bloque de caché. */
const smoothingScope = computed(() =>
  targetMode.value === "all" ? "all" : specificUserId.value.trim(),
);

async function loadSmoothingStatus() {
  smoothingStatusLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/system/score-smoothing", {
      params: { userId: smoothingScope.value || "all" },
    });
    smoothingStatus.value = data;
  } catch {
    smoothingStatus.value = null;
  } finally {
    smoothingStatusLoading.value = false;
  }
}

function revertScores() {
  if (targetMode.value === "specific" && !isSpecificUserIdValid.value) {
    message.warning("User ID must be a positive integer");
    return;
  }

  const scopeLabel =
    targetMode.value === "all"
      ? "TODOS los usuarios"
      : `el usuario ${specificUserId.value.trim()}`;

  dialog.warning({
    title: "Volver a originales",
    content:
      `Se devolverán las puntuaciones originales del LLM a ${scopeLabel}. ` +
      "Para volver a corregir hay que relanzar el motor desde la ficha del usuario.",
    positiveText: "Continuar",
    negativeText: "Cancelar",
    onPositiveClick: async () => {
      smoothingLoading.value = true;
      try {
        const { data } = await api.post(
          "/api/admin/system/score-smoothing/revert",
          { userId: smoothingScope.value || "all" },
        );
        message.success(
          `${data.photosAffected} fotos revertidas en ${data.usersAffected} usuario(s)`,
        );
        await loadSmoothingStatus();
      } catch (e: any) {
        message.error(
          e?.response?.data?.message ?? "No se pudo revertir la regularización",
        );
      } finally {
        smoothingLoading.value = false;
      }
    },
  });
}

onMounted(loadSmoothingStatus);
watch([targetMode, specificUserId], () => {
  if (targetMode.value === "all" || isSpecificUserIdValid.value) {
    loadSmoothingStatus();
  }
});
</script>

<style scoped>
.smoothing-status {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  background: #f8fafc;
}

.status-item {
  display: flex;
  flex-direction: column;
}

.status-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.1;
}

.status-value--accent {
  color: #2563eb;
}

.status-label {
  font-size: 10px;
  color: #94a3b8;
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
.target-toggle {
  display: inline-flex;
  gap: 8px;
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
