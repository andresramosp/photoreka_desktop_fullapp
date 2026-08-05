<template>
  <div class="applied-panel">
    <div class="controls">
      <div class="control">
        <label>Por página</label>
        <n-input-number
          v-model:value="perPage"
          size="small"
          :min="6"
          :max="100"
          :step="6"
          style="width: 90px"
        />
      </div>

      <div class="control control-actions">
        <n-checkbox v-model:checked="showAll" size="small">
          Ver todos los criterios
        </n-checkbox>
        <n-button size="small" tertiary :disabled="loading" @click="load()">
          Recargar
        </n-button>
        <n-button
          size="small"
          type="primary"
          secondary
          :disabled="loading || photos.length === 0"
          title="Mueve a la vez las barras de todas las fotos de la página."
          @click="playToken++"
        >
          Animar todas
        </n-button>
      </div>
    </div>

    <p class="hint">
      Aquí no se simula nada: son las fotos que el motor dejó
      <strong>ya corregidas en base de datos</strong>, ordenadas por cuánto se
      movieron. El después es <code>artistic_scores</code>, que es lo que ve el
      usuario; el antes es <code>artistic_scores_raw</code>, el original intacto
      del LLM.
    </p>

    <div v-if="loading" class="state">
      <n-spin :size="26" />
      <span>Cargando fotos ajustadas…</span>
    </div>

    <div v-else-if="error" class="state state-error">{{ error }}</div>

    <div v-else-if="total === 0" class="state">
      Ninguna foto de este usuario tiene los scores corregidos. Lánzalo desde la
      pestaña de simulación.
    </div>

    <template v-else>
      <div class="summary">
        <div class="stat stat-accent">
          <span class="stat-value">{{ total }}</span>
          <span class="stat-label">fotos corregidas</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ pageShiftLabel }}</span>
          <span class="stat-label">movimiento medio (esta página)</span>
        </div>
      </div>

      <div class="grid">
        <ScoreAppliedCard
          v-for="photo in photos"
          :key="photo.id"
          :photo="photo"
          :play-token="playToken"
          :show-all="showAll"
          @open="openPhoto"
        />
      </div>

      <n-pagination
        v-model:page="page"
        :page-count="pageCount"
        :page-slot="7"
        size="small"
        class="pager"
      />
    </template>

    <!-- Foto ampliada, con la misma animación -->
    <n-modal
      v-model:show="photoModal"
      preset="card"
      style="max-width: 760px; width: 92vw"
      :title="`Foto #${activePhoto?.id ?? ''}`"
    >
      <template v-if="activePhoto">
        <img
          v-if="activePhoto.thumbnailUrl"
          :src="activePhoto.thumbnailUrl"
          class="modal-photo"
          :alt="String(activePhoto.id)"
        />
        <div class="modal-controls">
          <n-button
            size="small"
            :type="modalPhase > 0.5 ? 'primary' : 'default'"
            secondary
            @click="modalToggle()"
          >
            {{ modalPhase > 0.5 ? "Ver antes" : "Ver después" }}
          </n-button>
          <span class="modal-state">
            {{ modalPhase > 0.5 ? "valores corregidos" : "original del LLM" }}
            · movimiento total {{ activePhoto.totalShift.toFixed(1) }}
          </span>
        </div>
        <ScoreBarsDiff
          :before="activePhoto.before"
          :after="activePhoto.after"
          :phase="modalPhase"
        />
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  NButton,
  NCheckbox,
  NInputNumber,
  NModal,
  NPagination,
  NSpin,
} from "naive-ui";
import { api } from "../../utils/axios";
import ScoreAppliedCard from "./ScoreAppliedCard.vue";
import ScoreBarsDiff from "./ScoreBarsDiff.vue";
import { useScoreMorph } from "@/composables/useScoreMorph";
import type { AppliedPage, AppliedPhoto } from "../../types/scoreSmoothing";

const props = defineProps<{ userId: string | number }>();

const perPage = ref(12);
const page = ref(1);
const showAll = ref(false);
const playToken = ref(0);

const loading = ref(false);
const error = ref<string | null>(null);
const photos = ref<AppliedPhoto[]>([]);
const total = ref(0);

const photoModal = ref(false);
const activePhoto = ref<AppliedPhoto | null>(null);
const {
  phase: modalPhase,
  toggle: modalToggle,
  reset: modalReset,
} = useScoreMorph();

const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / perPage.value)),
);

const pageShiftLabel = computed(() => {
  if (photos.value.length === 0) return "—";
  const sum = photos.value.reduce((acc, photo) => acc + photo.totalShift, 0);
  return (sum / photos.value.length).toFixed(1);
});

async function load() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await api.get<AppliedPage>(
      `/api/admin/users/${props.userId}/score-smoothing/applied`,
      { params: { page: page.value, perPage: perPage.value } },
    );
    photos.value = data.photos;
    total.value = data.total;
  } catch (e: any) {
    error.value =
      e?.response?.data?.message ?? "No se pudieron cargar las fotos ajustadas.";
  } finally {
    loading.value = false;
  }
}

// Cambiar el tamaño de página invalida la paginación en curso.
watch(perPage, () => {
  page.value = 1;
  load();
});

watch(page, () => load());

function openPhoto(photo: AppliedPhoto) {
  activePhoto.value = photo;
  modalReset();
  photoModal.value = true;
}

load();
</script>

<style scoped>
.applied-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.controls {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.control-actions {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #94a3b8;
}

.state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border: 1px dashed #e8ecf0;
  border-radius: 10px;
  font-size: 12px;
  color: #94a3b8;
  background: #fcfdfe;
}

.state-error {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}

.summary {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  background: #f8fafc;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.1;
}

.stat-accent .stat-value {
  color: #2563eb;
}

.stat-label {
  font-size: 10px;
  color: #94a3b8;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.pager {
  justify-content: center;
}

.modal-photo {
  width: 100%;
  border-radius: 10px;
  margin-bottom: 12px;
}

.modal-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.modal-state {
  font-size: 11px;
  color: #64748b;
}
</style>
