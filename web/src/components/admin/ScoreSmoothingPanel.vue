<template>
  <div class="smoothing-panel">
    <!-- Simular y ejecutar son el mismo cálculo; lo único que cambia es si escribe.
         Por eso no hay dos vistas: la simulación ya dice qué está hecho y qué falta. -->
    <div class="controls">
      <div v-if="mode === 'process'" class="control">
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
          :disabled="busy"
          @click="simulate"
        >
          {{ report ? "Volver a simular" : "Simular" }}
        </n-button>
        <n-button
          size="small"
          type="warning"
          secondary
          :disabled="busy || !hasPending"
          :loading="applying"
          @click="confirmApply"
        >
          Ejecutar
          {{ counts.photosPending ? `(${counts.photosPending} fotos)` : "" }}
        </n-button>
        <n-button
          v-if="mode === 'user'"
          size="small"
          type="error"
          tertiary
          :disabled="busy"
          :loading="reverting"
          title="Copia el original del LLM encima de los scores activos de este usuario. No recalcula nada."
          @click="confirmRevert"
        >
          Revertir
        </n-button>
      </div>
    </div>

    <p class="hint">
      {{ hintText }}
      <br />
      Simular y ejecutar hacen el mismo cálculo con la
      <strong>configuración del backend</strong> (<code
        >config/score_smoothing.ts</code
      >
      y las variables de entorno); simular no escribe. Al ejecutar, lo que falta
      pasa a estar hecho y desaparece de la lista.
    </p>

    <div v-if="loading" class="state">
      <n-spin :size="26" />
      <span>{{ loadingText }}</span>
    </div>

    <div v-else-if="applying" class="state">
      <n-spin :size="26" />
      <span>
        Recalculando y escribiendo los scores corregidos. Tarda lo mismo que la
        simulación; al terminar, lo que falta se queda a cero.
      </span>
    </div>

    <div v-else-if="reverting" class="state">
      <n-spin :size="26" />
      <span>Devolviendo los scores originales del LLM…</span>
    </div>

    <div v-else-if="error" class="state state-error">{{ error }}</div>

    <template v-else-if="report">
      <!-- Resumen: primero lo que falta y lo hecho, que es la pregunta del panel -->
      <div class="summary">
        <div class="stat" :class="{ 'stat-accent': hasPending }">
          <span class="stat-value">{{ counts.photosPending }}</span>
          <span class="stat-label">fotos por aplicar</span>
        </div>
        <div class="stat stat-done">
          <span class="stat-value">{{ counts.photosDone }}</span>
          <span class="stat-label">fotos ya aplicadas</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ indexedGroups.length }}</span>
          <span class="stat-label">grupos con cambios</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ report.photosInGraph }}</span>
          <span class="stat-label">fotos en el grafo</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ report.largestGroup }}</span>
          <span class="stat-label">mayor</span>
        </div>
        <!-- La medida directa de clipVerifyThreshold: si sale 0, el corte no está
             haciendo nada en este catálogo. -->
        <div class="stat">
          <span class="stat-value">{{ report.clipRejectedPairs ?? 0 }}</span>
          <span class="stat-label">parejas que tira CLIP</span>
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
      </div>

      <div v-if="!hasPending" class="state state-clear">
        Nada pendiente: todo lo que produce el motor con la configuración actual
        ya está escrito. Cuando el usuario suba fotos nuevas, vuelve a simular.
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

      <p class="legend">
        Cada fila es un grupo donde
        <strong>todas las fotos son vecinas entre sí</strong>: se afectan unas a
        otras y a ninguna más. La primera tarjeta, fija a la izquierda, es la
        mediana del grupo — la referencia hacia la que tiran, marcada también
        con la línea vertical de cada barra. Si ves fotos que no pintan nada
        ahí, sube el umbral.
      </p>

      <div class="groups-head">
        <!-- Los dos estados suman el total: no hay ningún cubo escondido. -->
        <n-radio-group v-model:value="filter" size="small">
          <n-radio-button value="pending">
            Lo que falta ({{ counts.groupsPending }} grupos)
          </n-radio-button>
          <n-radio-button value="done">
            Lo hecho ({{ counts.groupsDone }} grupos)
          </n-radio-button>
          <n-radio-button value="all">
            Todo ({{ indexedGroups.length }} grupos)
          </n-radio-button>
        </n-radio-group>

        <div class="groups-toggles">
          <n-checkbox v-model:checked="showAll" size="small">
            Ver todos los criterios
          </n-checkbox>
          <div class="control-inline">
            <span class="per-page-label">grupos/pág.</span>
            <n-input-number
              v-model:value="perPage"
              size="small"
              :min="5"
              :max="100"
              :step="5"
              style="width: 82px"
            />
          </div>
        </div>
      </div>

      <div v-if="filteredGroups.length === 0" class="state">
        {{ emptyFilterText }}
      </div>

      <template v-else>
        <div class="groups">
          <ScoreGroupCard
            v-for="group in pagedGroups"
            :key="group.index"
            :group="group.group"
            :index="group.index"
            :show-all="showAll"
            @open="openPhoto"
          />
        </div>

        <n-pagination
          v-if="pageCount > 1"
          v-model:page="page"
          :page-count="pageCount"
          :page-slot="7"
          size="small"
          class="pager"
        />
      </template>
    </template>

    <div v-else class="state state-idle">
      Simula para ver los grupos de casi-duplicados, cuáles ya están aplicados y
      cuáles faltan. No se escribe nada en base de datos.
    </div>

    <!-- Foto ampliada -->
    <n-modal
      v-model:show="photoModal"
      preset="card"
      style="max-width: 720px; width: 92vw"
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
            {{ modalPhase > 0.5 ? "Ver original" : "Ver corregido" }}
          </n-button>
          <span class="modal-state">
            {{ modalPhase > 0.5 ? "valores corregidos" : "original del LLM" }} ·
            {{ statusLabel(activePhoto) }}
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
  NRadioButton,
  NRadioGroup,
  NSpin,
  useDialog,
  useMessage,
} from "naive-ui";
import { api } from "../../utils/axios";
import ScoreGroupCard from "./ScoreGroupCard.vue";
import ScoreBarsDiff from "./ScoreBarsDiff.vue";
import { useScoreMorph } from "@/composables/useScoreMorph";
import { groupStatus, photoStatus } from "../../utils/scoreSmoothingStatus";
import type {
  PreviewGroup,
  PreviewPhoto,
  SmoothingReport,
} from "../../types/scoreSmoothing";

const props = defineProps<{
  /** 'user' simula el pool de fotos recientes; 'process' solo las fotos del análisis. */
  mode: "user" | "process";
  targetId: string | number;
}>();

const message = useMessage();
const dialog = useDialog();

/** Solo en modo proceso: ahí la simulación es corta y el tope evita ruido. */
const maxGroups = ref(25);

type Filter = "pending" | "done" | "all";
/** Se arranca en lo pendiente: es la pregunta con la que se abre el panel. */
const filter = ref<Filter>("pending");
const page = ref(1);
const perPage = ref(200);
const showAll = ref(false);

const loading = ref(false);
const applying = ref(false);
const reverting = ref(false);
const error = ref<string | null>(null);
const report = ref<SmoothingReport | null>(null);

/** Las tres acciones se pisan entre sí: solo una a la vez. */
const busy = computed(() => loading.value || applying.value || reverting.value);

const photoModal = ref(false);
const activePhoto = ref<PreviewPhoto | null>(null);
const {
  phase: modalPhase,
  toggle: modalToggle,
  reset: modalReset,
} = useScoreMorph();

const hintText = computed(() =>
  props.mode === "user"
    ? "Simula las fotos más recientes del usuario —el mismo pool que la pasada automática al terminar un análisis—, sin muestra ni tope de grupos: lo que ves es exactamente lo que se va a aplicar."
    : "Simula sobre las fotos de este análisis, igual que haría el enganche automático al terminarlo. Incluye a sus casi-duplicados del resto del catálogo.",
);

const loadingText = computed(() =>
  props.mode === "user"
    ? "Recorriendo las fotos más recientes: agrupando casi-duplicados y calculando ajustes."
    : "Calculando grupos y ajustes…",
);

/**
 * Los grupos que el motor mueve. Los que no toca no son un caso a revisar —ni están
 * hechos ni faltan—, así que no se listan: solo ensuciarían la cuenta. Por eso
 * "lo que falta" y "lo hecho" suman siempre el total.
 */
const indexedGroups = computed(() => {
  const entries: { group: PreviewGroup; index: number; status: string }[] = [];

  for (const group of report.value?.previewGroups ?? []) {
    const status = groupStatus(group);
    if (status === "noop") continue;
    entries.push({ group, index: entries.length, status });
  }

  return entries;
});

const counts = computed(() => {
  let groupsPending = 0;
  let groupsDone = 0;
  let photosPending = 0;
  let photosDone = 0;

  for (const entry of indexedGroups.value) {
    if (entry.status === "pending") groupsPending++;
    else groupsDone++;

    for (const photo of entry.group.photos) {
      const status = photoStatus(photo);
      if (status === "pending") photosPending++;
      else if (status === "done") photosDone++;
    }
  }

  return { groupsPending, groupsDone, photosPending, photosDone };
});

const hasPending = computed(() => counts.value.photosPending > 0);

const filteredGroups = computed(() => {
  if (filter.value === "all") return indexedGroups.value;
  return indexedGroups.value.filter((entry) => entry.status === filter.value);
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredGroups.value.length / perPage.value)),
);

const pagedGroups = computed(() => {
  const start = (page.value - 1) * perPage.value;
  return filteredGroups.value.slice(start, start + perPage.value);
});

const emptyFilterText = computed(() => {
  if (filter.value === "pending") return "No queda nada por aplicar.";
  if (filter.value === "done") return "Todavía no se ha aplicado ningún grupo.";
  return "No se formó ningún grupo. Prueba con otro umbral o revisa que las fotos tengan scores.";
});

// Cambiar de filtro o de tamaño de página invalida la paginación en curso.
watch([filter, perPage], () => {
  page.value = 1;
});

/** La URL es la misma para simular y para ejecutar: solo cambia `dryRun`. */
const runUrl = computed(() =>
  props.mode === "user"
    ? `/api/admin/users/${props.targetId}/score-smoothing/run`
    : `/api/admin/processes/${props.targetId}/score-smoothing`,
);

/**
 * Una pasada del motor. Con `dryRun` no escribe; sin él, escribe y devuelve el
 * informe ya actualizado — por eso al ejecutar lo pendiente desaparece sin tener
 * que volver a calcular nada.
 */
async function run(dryRun: boolean) {
  error.value = null;

  try {
    const { data } = await api.post(runUrl.value, {
      dryRun,
      // Método y umbrales salen siempre de la configuración del backend: aquí no se
      // elige CÓMO se calcula, solo cuánto se pinta.
      ...(props.mode === "process" ? { maxGroups: maxGroups.value } : {}),
    });
    report.value = data;
    page.value = 1;
    return true;
  } catch (e: any) {
    error.value =
      e?.response?.data?.message ??
      (dryRun
        ? "No se pudo ejecutar la simulación."
        : "No se pudo escribir la regularización.");
    return false;
  }
}

async function simulate() {
  loading.value = true;
  try {
    await run(true);
  } finally {
    loading.value = false;
  }
}

function confirmApply() {
  dialog.warning({
    title: "Ejecutar la regularización",
    content:
      `Se escribirán los scores corregidos de las ${counts.value.photosPending} fotos que faltan. ` +
      "Se recalcula con la configuración del backend, no con los valores de la " +
      "simulación. El original del LLM queda en artistic_scores_raw y se puede revertir.",
    positiveText: "Ejecutar",
    negativeText: "Cancelar",
    onPositiveClick: () => apply(),
  });
}

/**
 * Escribe y espera. El informe que vuelve ya es el de después de escribir, así que
 * lo pendiente se queda a cero sin una segunda pasada.
 */
async function apply() {
  applying.value = true;
  try {
    if (await run(false)) message.success("Scores corregidos escritos");
  } finally {
    applying.value = false;
  }
}

function confirmRevert() {
  dialog.warning({
    title: "Revertir al original del LLM",
    content:
      "Se copia artistic_scores_raw encima de los scores activos de este usuario. " +
      "No recalcula nada y solo toca las fotos corregidas. Después se puede volver a ejecutar.",
    positiveText: "Revertir",
    negativeText: "Cancelar",
    onPositiveClick: () => revert(),
  });
}

/** El mismo endpoint que la reversión global de /system, acotado a este usuario. */
async function revert() {
  reverting.value = true;
  try {
    const { data } = await api.post(
      "/api/admin/system/score-smoothing/revert",
      { userId: String(props.targetId) },
    );
    message.success(`${data.photosAffected} fotos devueltas al original`);
    // Lo escrito ha cambiado bajo los pies de la simulación: se rehace.
    if (report.value) await run(true);
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? "No se pudo revertir.");
  } finally {
    reverting.value = false;
  }
}

function statusLabel(photo: PreviewPhoto) {
  const status = photoStatus(photo);
  if (status === "pending") return "falta por aplicar";
  return status === "done" ? "ya aplicada" : "sin cambios";
}

function openPhoto(photo: PreviewPhoto) {
  activePhoto.value = photo;
  modalReset();
  photoModal.value = true;
}
</script>

<style scoped>
.smoothing-panel {
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

.control-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.per-page-label {
  font-size: 11px;
  color: #94a3b8;
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

.state-clear {
  color: #15803d;
  border-color: #bbf7d0;
  background: #f0fdf4;
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

.stat-done .stat-value {
  color: #15803d;
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
  flex-wrap: wrap;
  font-size: 11px;
  color: #94a3b8;
}

.groups-toggles {
  display: flex;
  align-items: center;
  gap: 14px;
}

.groups {
  display: flex;
  flex-direction: column;
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
