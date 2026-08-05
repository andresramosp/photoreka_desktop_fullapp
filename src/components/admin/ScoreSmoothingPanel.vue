<template>
  <div class="smoothing-panel">
    <!-- Simular (qué pasaría) y ver lo ya aplicado (qué hay escrito) son dos
         preguntas distintas: se separan para no confundir una con otra. -->
    <div v-if="mode === 'user'" class="tabs">
      <button
        type="button"
        class="tab"
        :class="{ 'tab--active': tab === 'sim' }"
        @click="tab = 'sim'"
      >
        Simulador
      </button>
      <button
        type="button"
        class="tab"
        :class="{ 'tab--active': tab === 'applied' }"
        @click="tab = 'applied'"
      >
        Ya aplicado
      </button>
    </div>

    <ScoreSmoothingApplied v-if="tab === 'applied'" :user-id="targetId" />

    <template v-else>
      <!-- Controles -->
      <div class="controls">
        <div v-if="mode === 'user'" class="control">
          <label>Muestra #{{ sampleSeed }}</label>
          <div class="control-inline">
            <n-input-number
              v-model:value="sampleSize"
              size="small"
              :min="50"
              :max="5000"
              :step="100"
              style="width: 110px"
            />
            <n-button
              size="small"
              tertiary
              :disabled="loading"
              title="Sortear otras fotos. Sin tocarlo, la muestra es siempre la misma, así que repetir la simulación da exactamente el mismo resultado."
              @click="sampleSeed++"
            >
              otra
            </n-button>
          </div>
        </div>

        <div class="control">
          <label>Grupos</label>
          <n-input-number
            v-model:value="maxGroups"
            size="small"
            :min="5"
            :max="200"
            :step="5"
            style="width: 90px"
          />
        </div>

        <div class="control control-actions">
          <n-button
            size="small"
            type="primary"
            :loading="loading"
            :disabled="loading"
            @click="run(true)"
          >
            Simular
          </n-button>
          <n-button
            size="small"
            type="warning"
            secondary
            :disabled="loading || applying || !report"
            :loading="applying"
            @click="confirmApply"
          >
            {{
              mode === "process" ? "Aplicar al análisis" : "Aplicar al usuario"
            }}
          </n-button>
        </div>
      </div>

      <p class="hint">
        {{ hintText }}
        <br />
        Tanto <strong>Simular</strong> como <strong>Aplicar</strong> usan la
        configuración del backend (<code>config/score_smoothing.ts</code> y las
        variables de entorno). Aquí solo eliges cuánto mirar; simular no escribe
        nada.
      </p>

      <div v-if="loading" class="state">
        <n-spin :size="26" />
        <span>Calculando grupos y ajustes…</span>
      </div>

      <div v-else-if="error" class="state state-error">{{ error }}</div>

      <template v-else-if="report">
        <!-- Resumen -->
        <div class="summary">
          <div class="stat">
            <span class="stat-value">{{ report.photosInGraph }}</span>
            <span class="stat-label">en grupos</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ report.groups }}</span>
            <span class="stat-label">grupos</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ report.largestGroup }}</span>
            <span class="stat-label">mayor</span>
          </div>
          <div class="stat stat-accent">
            <span class="stat-value">{{ report.photosChanged }}</span>
            <span class="stat-label">fotos ajustadas</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ report.barsChanged }}</span>
            <span class="stat-label">barras</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ report.threshold }}</span>
            <span class="stat-label">
              umbral {{ report.strategy === "dhash" ? "(bits)" : "(coseno)" }}
            </span>
          </div>
          <div class="stat">
            <span class="stat-value"
              >{{ (report.durationMs / 1000).toFixed(1) }}s</span
            >
            <span class="stat-label">{{ report.strategy }}</span>
          </div>
          <n-tag
            v-if="!report.dryRun"
            size="small"
            type="warning"
            :bordered="false"
          >
            Aplicado
          </n-tag>
        </div>

        <!-- Movimiento por criterio -->
        <details v-if="report.perCriterion.length" class="criteria">
          <summary>Movimiento por criterio</summary>
          <table>
            <thead>
              <tr>
                <th>criterio</th>
                <th>fotos</th>
                <th>medio</th>
                <th>máx</th>
                <th>cruzan 7.0</th>
                <th>σ ruido LLM</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stat in report.perCriterion" :key="stat.criterion">
                <td>{{ stat.criterion.replace(/_/g, " ") }}</td>
                <td>{{ stat.photosMoved }}</td>
                <td>{{ stat.avgAbsShift.toFixed(2) }}</td>
                <td>{{ stat.maxAbsShift.toFixed(2) }}</td>
                <td>{{ stat.crossedSeven }}</td>
                <td>{{ stat.noiseSigma ?? "—" }}</td>
              </tr>
            </tbody>
          </table>
        </details>

        <!-- Grupos -->
        <p class="legend">
          Cada fila es un grupo donde
          <strong>todas las fotos son vecinas entre sí</strong>: se afectan unas
          a otras y a ninguna más. La primera tarjeta, fija a la izquierda, es
          la mediana del grupo — la referencia hacia la que tiran, marcada
          también con la línea vertical de cada barra. Si ves fotos que no
          pintan nada ahí, sube el umbral.
        </p>

        <div class="groups-head">
          <span>
            {{ visibleGroups.length }} grupos mostrados
            <template v-if="hiddenGroups > 0">
              ({{ hiddenGroups }} sin cambios ocultos)
            </template>
          </span>
          <div class="groups-toggles">
            <n-checkbox v-model:checked="onlyChanged" size="small">
              Solo grupos con cambios
            </n-checkbox>
            <n-checkbox v-model:checked="showAll" size="small">
              Ver todos los criterios
            </n-checkbox>
          </div>
        </div>

        <div v-if="visibleGroups.length === 0" class="state">
          No se formó ningún grupo con este método. Prueba con otra vecindad o
          una muestra mayor.
        </div>

        <div v-else class="groups">
          <ScoreGroupCard
            v-for="(group, index) in visibleGroups"
            :key="index"
            :group="group"
            :index="index"
            :show-all="showAll"
            @open="openPhoto"
          />
        </div>
      </template>

      <div v-else class="state state-idle">
        Ejecuta una simulación para ver los grupos de casi-duplicados y cómo
        cambiarían sus puntuaciones. No se escribe nada en base de datos.
      </div>

      <!-- Foto ampliada -->
      <n-modal
        v-model:show="photoModal"
        preset="card"
        style="max-width: 720px; width: 92vw"
        :title="`Foto #${activePhoto?.id ?? ''}`"
      >
        <img
          v-if="activePhoto?.thumbnailUrl"
          :src="activePhoto.thumbnailUrl"
          class="modal-photo"
          :alt="String(activePhoto?.id)"
        />
        <ScoreBarsDiff
          v-if="activePhoto"
          :before="activePhoto.before"
          :after="activePhoto.after"
        />
      </n-modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  NButton,
  NCheckbox,
  NInputNumber,
  NModal,
  NSpin,
  NTag,
  useDialog,
  useMessage,
} from "naive-ui";
import { api } from "../../utils/axios";
import ScoreGroupCard from "./ScoreGroupCard.vue";
import ScoreBarsDiff from "./ScoreBarsDiff.vue";
import ScoreSmoothingApplied from "./ScoreSmoothingApplied.vue";
import type {
  PreviewGroup,
  PreviewPhoto,
  SmoothingReport,
} from "../../types/scoreSmoothing";

const props = defineProps<{
  /** 'user' simula sobre una muestra del catálogo; 'process' sobre las fotos del análisis. */
  mode: "user" | "process";
  targetId: string | number;
}>();

const message = useMessage();
const dialog = useDialog();

/** 'sim' = qué pasaría; 'applied' = qué hay ya escrito. Solo en modo usuario. */
const tab = ref<"sim" | "applied">("sim");

const sampleSize = ref(300);
/**
 * Semilla de la muestra. Fija por defecto para que dos simulaciones seguidas usen
 * las MISMAS fotos: si no, cambiar de método cambiaría también la muestra y no se
 * podría comparar nada.
 */
const sampleSeed = ref(1);
const maxGroups = ref(25);
const onlyChanged = ref(true);
const showAll = ref(false);

const loading = ref(false);
const applying = ref(false);
const error = ref<string | null>(null);
const report = ref<SmoothingReport | null>(null);

const photoModal = ref(false);
const activePhoto = ref<PreviewPhoto | null>(null);

const hintText = computed(() =>
  props.mode === "user"
    ? "Simula sobre una muestra aleatoria del catálogo. Los grupos de las fotos sorteadas se resuelven completos, así que lo que ves es lo que haría una pasada real sobre ellos. CLIP puede tardar en catálogos grandes; dHash es casi instantáneo."
    : "Simula sobre las fotos de este análisis, igual que haría el enganche automático al terminarlo. Incluye a sus casi-duplicados del resto del catálogo.",
);

const visibleGroups = computed<PreviewGroup[]>(() => {
  const groups = report.value?.previewGroups ?? [];
  return onlyChanged.value ? groups.filter((g) => g.changedPhotos > 0) : groups;
});

const hiddenGroups = computed(() => {
  const total = report.value?.previewGroups?.length ?? 0;
  return total - visibleGroups.value.length;
});

async function run(dryRun: boolean) {
  loading.value = true;
  error.value = null;

  try {
    const url =
      props.mode === "user"
        ? `/api/admin/users/${props.targetId}/score-smoothing/preview`
        : `/api/admin/processes/${props.targetId}/score-smoothing`;

    // Método y umbrales salen siempre de la configuración del backend, tanto al
    // simular como al aplicar: aquí solo se elige CUÁNTO se mira.
    const payload =
      props.mode === "user"
        ? {
            sampleSize: sampleSize.value,
            maxGroups: maxGroups.value,
            sampleSeed: String(sampleSeed.value),
          }
        : { dryRun, maxGroups: maxGroups.value };

    const { data } = await api.post(url, payload);
    report.value = data;

    if (!dryRun) {
      message.success(`${data.photosChanged} fotos ajustadas`);
    }
  } catch (e: any) {
    error.value =
      e?.response?.data?.message ?? "No se pudo ejecutar la regularización.";
  } finally {
    loading.value = false;
  }
}

/**
 * Aplicar de verdad. En un proceso es síncrono (son pocas fotos); en un usuario
 * arranca el trabajo completo en segundo plano, porque un catálogo grande con CLIP
 * son minutos.
 */
function confirmApply() {
  const isProcess = props.mode === "process";
  dialog.warning({
    title: "Aplicar regularización",
    content: isProcess
      ? "Los scores corregidos pasan a ser los que ve el usuario, calculados con la configuración del backend y no con los valores de la simulación. El original del LLM queda guardado en artistic_scores_raw y se puede revertir."
      : "Se recalculará el catálogo COMPLETO del usuario en segundo plano (no solo la muestra) y los scores corregidos pasan a ser los que ve el usuario. Se usa la configuración del backend, no los valores de la simulación. El original del LLM queda guardado en artistic_scores_raw y se puede revertir.",
    positiveText: "Aplicar",
    negativeText: "Cancelar",
    onPositiveClick: () => (isProcess ? run(false) : applyForUser()),
  });
}

async function applyForUser() {
  applying.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/users/${props.targetId}/score-smoothing`,
      { action: "run", dryRun: false },
    );
    message.success(
      `Lanzado en segundo plano con la configuración del backend (${data.strategy}). ` +
        `Al terminar, los scores corregidos ya son los activos. Sigue el progreso en Health → tasks.`,
    );
  } catch (e: any) {
    message.error(
      e?.response?.data?.message ?? "No se pudo lanzar la regularización.",
    );
  } finally {
    applying.value = false;
  }
}

function openPhoto(photo: PreviewPhoto) {
  activePhoto.value = photo;
  photoModal.value = true;
}
</script>

<style scoped>
.smoothing-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid #e8ecf0;
  border-radius: 8px;
  background: #f8fafc;
  align-self: flex-start;
}

.tab {
  border: none;
  background: transparent;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
}

.tab--active {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
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

.control-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-actions {
  flex-direction: row;
  gap: 8px;
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

.criteria {
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 8px 12px;
}

.criteria summary {
  cursor: pointer;
  font-size: 11px;
  color: #64748b;
}

.criteria table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 11px;
}

.criteria th {
  text-align: left;
  font-weight: 500;
  color: #94a3b8;
  padding: 3px 6px;
}

.criteria td {
  padding: 3px 6px;
  color: #475569;
  border-top: 1px solid #f8fafc;
  font-variant-numeric: tabular-nums;
}

.legend {
  margin: 0;
  padding: 8px 12px;
  border-left: 2px solid #e2e8f0;
  font-size: 11px;
  line-height: 1.6;
  color: #94a3b8;
}

.legend strong {
  color: #64748b;
}

.groups-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: #94a3b8;
}

.groups-toggles {
  display: flex;
  gap: 14px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-photo {
  width: 100%;
  border-radius: 10px;
  margin-bottom: 12px;
}
</style>
