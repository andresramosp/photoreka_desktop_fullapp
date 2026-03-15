<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Analyzer Processes</h1>
      <p>Monitor and manage all analyzer processes across users</p>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <n-input
        v-model:value="searchQuery"
        placeholder="Search by user name or email…"
        clearable
        size="small"
        style="max-width: 280px"
        @update:value="debouncedFetch"
      >
        <template #prefix>
          <n-icon size="16"><SearchIcon /></n-icon>
        </template>
      </n-input>

      <n-select
        v-model:value="filterStage"
        placeholder="Stage"
        clearable
        size="small"
        style="width: 160px"
        :options="stageOptions"
        @update:value="fetchProcesses"
      />

      <n-select
        v-model:value="filterMode"
        placeholder="Mode"
        clearable
        size="small"
        style="width: 140px"
        :options="modeOptions"
        @update:value="fetchProcesses"
      />

      <div class="filters-spacer" />

      <n-tag :bordered="false" size="small" type="info">
        {{ filteredCount }} process{{ filteredCount !== 1 ? "es" : "" }}
      </n-tag>
    </div>

    <!-- Processes Table -->
    <div class="table-wrapper">
      <div class="table-body">
        <div v-if="loading" class="table-loading-state">
          <n-spin show />
        </div>
        <n-data-table
          v-else
          :columns="columns"
          :data="paginatedProcesses"
          :row-key="(row: ProcessRow) => row.id"
          :row-class-name="rowClassName"
          :row-props="
            (row: ProcessRow) => ({
              onClick: () => selectProcess(row),
              style: 'cursor: pointer',
            })
          "
          :bordered="false"
          size="small"
          :max-height="360"
          striped
          @update:sorter="handleSort"
        />
      </div>
      <div class="table-pagination">
        <n-pagination
          v-model:page="currentPage"
          :page-size="pageSize"
          :item-count="processes.length"
          size="small"
        />
      </div>
    </div>

    <!-- Process Detail Panel -->
    <transition name="slide-up">
      <div v-if="selectedProcess" class="detail-panel">
        <div class="detail-header">
          <div class="detail-title-row">
            <div class="detail-process-icon">
              <n-icon size="22" color="#6366f1"><AnalyticsIcon /></n-icon>
            </div>
            <div class="detail-title-info">
              <h2>Process #{{ selectedProcess.id }}</h2>
              <span class="detail-email">
                {{ selectedProcess.userName || "Unknown user" }}
                <template v-if="selectedProcess.userEmail">
                  — {{ selectedProcess.userEmail }}
                </template>
              </span>
            </div>
            <button class="close-detail-btn" @click="selectedProcess = null">
              <n-icon size="18"><CloseIcon /></n-icon>
            </button>
          </div>
        </div>

        <n-spin :show="detailLoading">
          <div class="detail-body">
            <div class="detail-grid">
              <!-- Process Info -->
              <div class="detail-card">
                <h4>Process Info</h4>
                <div class="info-row">
                  <span class="info-label">ID</span>
                  <span class="info-value">#{{ selectedProcess.id }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Package</span>
                  <span class="info-value">{{
                    selectedProcess.packageId
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Stage</span>
                  <n-tag
                    size="tiny"
                    :type="stageTagType(selectedProcess.currentStage)"
                  >
                    <span
                      v-if="isStageActive(selectedProcess.currentStage)"
                      class="stage-spinner"
                    />
                    {{ formatStageName(selectedProcess.currentStage) }}
                  </n-tag>
                </div>
                <div
                  v-if="
                    selectedProcess.hadRetry ||
                    selectedProcess.mode === 'retry_process'
                  "
                  class="info-row"
                >
                  <span class="info-label">Retry</span>
                  <n-tag size="tiny" type="warning">
                    Had auto-retry
                    <span v-if="selectedProcess.photosPending > 0">
                      &mdash; {{ selectedProcess.photosPending }} pending
                    </span>
                  </n-tag>
                </div>
                <div class="info-row">
                  <span class="info-label">Fast mode</span>
                  <span class="info-value">{{
                    selectedProcess.isFastMode ? "Yes" : "No"
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Photos</span>
                  <span class="info-value">
                    {{ selectedProcess.photosCompleted }}/{{
                      selectedProcess.photosTotal
                    }}
                    <span
                      v-if="selectedProcess.photosPending > 0"
                      class="cell-dim"
                    >
                      ({{ selectedProcess.photosPending }} pending)
                    </span>
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Created</span>
                  <span class="info-value">{{
                    formatDate(selectedProcess.createdAt)
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Updated</span>
                  <span class="info-value">{{
                    formatDate(selectedProcess.updatedAt)
                  }}</span>
                </div>
                <div v-if="isProcessStale(selectedProcess)" class="info-row">
                  <span class="info-label">Status</span>
                  <n-tag size="tiny" type="error">
                    ⚠ Process may be dead — last update
                    {{ minutesAgo(selectedProcess.updatedAt) }} min ago
                  </n-tag>
                </div>
                <div
                  v-if="selectedProcess.mode === 'admin_retry'"
                  class="info-row"
                >
                  <span class="info-label">Mode</span>
                  <n-tag size="tiny" type="info">Admin Retry</n-tag>
                </div>
                <div v-if="selectedProcess.notes" class="info-row">
                  <span class="info-label">Source</span>
                  <span class="info-value notes-value">{{
                    selectedProcess.notes
                  }}</span>
                </div>
              </div>

              <!-- Task Progress -->
              <div class="detail-card">
                <h4>Task Progress</h4>
                <template
                  v-if="
                    selectedProcess.processSheetSummary &&
                    selectedProcess.processSheetSummary.length > 0
                  "
                >
                  <div class="cost-category-header">
                    <span>Task</span>
                    <span>Done</span>
                    <span>Pending</span>
                  </div>
                  <div
                    v-for="task in selectedProcess.processSheetSummary"
                    :key="task.taskName"
                    class="cost-category-row"
                  >
                    <span class="cat-name">{{
                      formatTaskName(task.taskName)
                    }}</span>
                    <span>{{ task.completed }}/{{ task.total }}</span>
                    <span :class="{ 'pending-badge': task.pending > 0 }">{{
                      task.pending
                    }}</span>
                  </div>
                </template>
                <p v-else class="no-data">No task data available</p>
              </div>

              <!-- Cost Report -->
              <div class="detail-card">
                <h4>Cost Report</h4>
                <template v-if="selectedProcess.costReport">
                  <div class="info-row">
                    <span class="info-label">Total cost</span>
                    <span class="info-value cost-value">
                      €{{
                        selectedProcess.costReport.totalCostInEur?.toFixed(4)
                      }}
                    </span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Total calls</span>
                    <span class="info-value">{{
                      selectedProcess.costReport.totalCalls
                    }}</span>
                  </div>

                  <!-- By Task -->
                  <div
                    v-if="selectedProcess.costReport.byTask"
                    class="cost-categories"
                  >
                    <h5 class="cost-sub-header">By Task</h5>
                    <div class="cost-category-header">
                      <span>Task</span>
                      <span>Cost</span>
                      <span>Calls</span>
                    </div>
                    <div
                      v-for="(val, key) in selectedProcess.costReport.byTask"
                      :key="key"
                      class="cost-category-row"
                    >
                      <span class="cat-name">{{
                        formatTaskName(String(key))
                      }}</span>
                      <span>€{{ val.costInEur?.toFixed(4) }}</span>
                      <span>{{ val.calls }}</span>
                    </div>
                  </div>

                  <!-- By Model -->
                  <div
                    v-if="selectedProcess.costReport.byModel"
                    class="cost-categories"
                  >
                    <h5 class="cost-sub-header">By Model</h5>
                    <div class="cost-category-header">
                      <span>Model</span>
                      <span>Cost</span>
                      <span>Calls</span>
                    </div>
                    <div
                      v-for="(val, key) in selectedProcess.costReport.byModel"
                      :key="key"
                      class="cost-category-row"
                    >
                      <span class="cat-name">{{ key }}</span>
                      <span>€{{ val.costInEur?.toFixed(4) }}</span>
                      <span>{{ val.calls }}</span>
                    </div>
                  </div>
                </template>
                <p v-else class="no-data">No cost data</p>
              </div>
            </div>

            <!-- Actions -->
            <div class="detail-actions">
              <n-button
                size="small"
                type="warning"
                disabled
                title="Coming soon"
              >
                Stop Process
              </n-button>
              <n-button
                size="small"
                type="info"
                :loading="healthLoading"
                @click="runHealthCheck"
              >
                Health Check
              </n-button>
              <n-button
                size="small"
                type="primary"
                :disabled="retryLoading || !canRetry(selectedProcess)"
                :loading="retryLoading"
                @click="confirmRetry"
              >
                Manual Retry
              </n-button>
            </div>
          </div>
        </n-spin>
      </div>
    </transition>

    <!-- Health Report Modal -->
    <HealthReportModal
      v-model:show="healthModalVisible"
      :title="`Health Check — Process #${selectedProcess?.id ?? ''}`"
      :loading="healthLoading"
      :report="healthReport"
      :error="healthError"
      @retry="runHealthCheck"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from "vue";
import {
  NButton,
  NTag,
  NIcon,
  NInput,
  NSelect,
  NDataTable,
  NSpin,
  NPagination,
  useMessage,
  useDialog,
} from "naive-ui";
import type { DataTableColumn, DataTableSortState } from "naive-ui";
import {
  SearchOutline as SearchIcon,
  CloseOutline as CloseIcon,
  AnalyticsOutline as AnalyticsIcon,
} from "@vicons/ionicons5";
import { api, api_analyzer } from "../../utils/axios";
import { useAutoRefresh } from "../../composables/useAutoRefresh";
import HealthReportModal from "../../components/admin/HealthReportModal.vue";
import type { HealthReport } from "../../components/admin/HealthReportModal.vue";

interface ProcessRow {
  id: string;
  packageId: string;
  mode: string;
  currentStage: string | null;
  isFastMode: boolean;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  photosTotal: number;
  photosCompleted: number;
  photosPending: number;
  totalCostEur: number;
  createdAt: string;
  updatedAt: string;
  costReport?: any;
  processSheetSummary?: any[];
  hadRetry?: boolean;
  notes?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  init: "Initializing",
  vision_tasks: "Vision Tasks",
  clip_embeddings: "Clip Embeddings",
  vision_context_story_accents: "Vision",
  tags_context_story: "Tags",
  tags_visual_accents: "Visual Tags",
  chunks_context_story_visual_accents: "Chunks",
  visual_color_embedding_task: "Color Embeddings",
  finished: "Finished",
  failed: "Failed",
};

function formatStageName(stage: string | null): string {
  if (!stage) return "—";
  return (
    STAGE_LABELS[stage] ??
    stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const message = useMessage();
const dialog = useDialog();

const processes = ref<ProcessRow[]>([]);
const loading = ref(false);
const selectedProcess = ref<ProcessRow | null>(null);
const detailLoading = ref(false);

const searchQuery = ref("");
const filterStage = ref<string | null>(null);
const filterMode = ref<string | null>(null);
const sortBy = ref<string | null>(null);
const sortDir = ref<string | null>(null);

const currentPage = ref(1);
const pageSize = 20;

const paginatedProcesses = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return processes.value.slice(start, start + pageSize);
});

const stageOptions = [
  { label: "Initializing", value: "init" },
  { label: "Finished", value: "finished" },
  { label: "Failed", value: "failed" },
  { label: "Vision", value: "vision_context_story_accents" },
  { label: "Tags", value: "tags_context_story" },
  { label: "Clip Embeddings", value: "clip_embeddings" },
];

const modeOptions = [
  { label: "Normal", value: "adding" },
  { label: "Auto-retry", value: "retry_process" },
  { label: "Admin Retry", value: "admin_retry" },
];

const filteredCount = computed(() => processes.value.length);

// Debounce helper
let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchProcesses(), 300);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaskName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function stageTagType(
  stage: string | null,
): "success" | "error" | "warning" | "info" | "default" {
  if (!stage) return "default";
  if (stage === "finished") return "success";
  if (stage === "failed") return "error";
  if (stage === "init") return "warning";
  return "info";
}

function isStageActive(stage: string | null): boolean {
  return !!stage && stage !== "finished" && stage !== "failed";
}

function minutesAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function isProcessStale(row: ProcessRow): boolean {
  return isStageActive(row.currentStage) && minutesAgo(row.updatedAt) > 10;
}

function canRetry(row: ProcessRow): boolean {
  const terminal =
    row.currentStage === "finished" || row.currentStage === "failed";
  return terminal || isProcessStale(row);
}

function rowClassName(row: ProcessRow) {
  if (row.currentStage === "failed") return "row-failed";
  if (selectedProcess.value?.id === row.id) return "row-selected";
  return "";
}

// Columns
const columns = computed<DataTableColumn<ProcessRow>[]>(() => [
  {
    title: "ID",
    key: "id",
    width: 70,
    sorter: true,
    render(row) {
      return h("span", { class: "cell-user-name" }, `#${row.id}`);
    },
  },
  {
    title: "User",
    key: "userName",
    width: 160,
    render(row) {
      return h("div", { style: "line-height: 1.3" }, [
        h("div", { class: "cell-user-name" }, row.userName || "—"),
        row.userEmail
          ? h(
              "div",
              {
                style:
                  "font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
              },
              row.userEmail,
            )
          : null,
      ]);
    },
  },
  {
    title: "Stage",
    key: "currentStage",
    width: 160,
    render(row) {
      const label = formatStageName(row.currentStage);
      const active = isStageActive(row.currentStage);
      const stale = isProcessStale(row);
      const tagType = stale ? "error" : stageTagType(row.currentStage);
      return h(
        NTag,
        { size: "tiny", type: tagType },
        {
          default: () =>
            stale
              ? [`⚠ ${label}`]
              : active
                ? [h("span", { class: "stage-spinner" }), ` ${label}`]
                : label,
        },
      );
    },
  },
  {
    title: "Photos",
    key: "photosTotal",
    width: 90,
    sorter: true,
    render(row) {
      if (!row.photosTotal) return h("span", { class: "cell-dim" }, "—");
      return h("span", null, `${row.photosCompleted}/${row.photosTotal}`);
    },
  },
  {
    title: "Cost (€)",
    key: "totalCostEur",
    width: 90,
    sorter: true,
    render(row) {
      return h(
        "span",
        { class: "cell-cost" },
        row.totalCostEur > 0 ? `€${row.totalCostEur.toFixed(4)}` : "—",
      );
    },
  },
  {
    title: "Created",
    key: "createdAt",
    width: 140,
    sorter: true,
    render(row) {
      return h("span", { class: "cell-dim" }, formatDate(row.createdAt));
    },
  },
]);

// API calls
async function fetchProcesses(silent = false) {
  if (!silent) loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (searchQuery.value) params.search = searchQuery.value;
    if (filterStage.value) params.stage = filterStage.value;
    if (filterMode.value) params.mode = filterMode.value;
    if (sortBy.value) {
      params.sortBy = sortBy.value;
      params.sortDir = sortDir.value || "desc";
    }

    const { data } = await api.get("/api/admin/processes", { params });
    processes.value = data.processes;
  } catch {
    message.error("Failed to load processes");
  } finally {
    loading.value = false;
  }
}

async function selectProcess(row: ProcessRow) {
  detailLoading.value = true;
  selectedProcess.value = row;
  try {
    const { data } = await api.get(`/api/admin/processes/${row.id}`);
    selectedProcess.value = data.process;
  } catch {
    message.error("Failed to load process details");
  } finally {
    detailLoading.value = false;
  }
}

function handleSort(options: DataTableSortState) {
  if (options.order) {
    sortBy.value = options.columnKey as string;
    sortDir.value = options.order === "ascend" ? "asc" : "desc";
  } else {
    sortBy.value = null;
    sortDir.value = null;
  }
  fetchProcesses();
}

async function silentRefresh() {
  await fetchProcesses(true);
  if (selectedProcess.value) {
    try {
      const { data } = await api.get(
        `/api/admin/processes/${selectedProcess.value.id}`,
      );
      selectedProcess.value = data.process;
    } catch {
      // silent fail on detail refresh
    }
  }
}

// Auto-refresh every 3 seconds
const { isRefreshing } = useAutoRefresh(silentRefresh, 3000);

// Health check
const healthModalVisible = ref(false);
const healthLoading = ref(false);
const healthReport = ref<HealthReport | null>(null);
const healthError = ref(false);

async function runHealthCheck() {
  if (!selectedProcess.value) return;
  healthReport.value = null;
  healthError.value = false;
  healthLoading.value = true;
  healthModalVisible.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/processes/${selectedProcess.value.id}/health`,
    );
    healthReport.value = data.report;
  } catch {
    healthError.value = true;
  } finally {
    healthLoading.value = false;
  }
}

// Manual retry
const retryLoading = ref(false);

function confirmRetry() {
  if (!selectedProcess.value) return;
  const p = selectedProcess.value;
  dialog.warning({
    title: "Confirm Manual Retry",
    content: `Launch admin_retry for Process #${p.id}? This will re-run pending tasks without charging the user.`,
    positiveText: "Retry",
    negativeText: "Cancel",
    onPositiveClick: () => launchRetry(),
  });
}

async function launchRetry() {
  if (!selectedProcess.value) return;
  retryLoading.value = true;
  try {
    const { data } = await api_analyzer.post(
      `/api/admin/processes/${selectedProcess.value.id}/retry`,
    );
    message.success(`Retry launched for Process #${data.processId}`);
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to launch retry";
    message.error(msg);
  } finally {
    retryLoading.value = false;
  }
}

onMounted(() => {
  fetchProcesses();
});
</script>

<style scoped>
.admin-section {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  padding: 0 !important;
}

.section-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.section-header p {
  margin: 0 0 20px;
  color: #94a3b8;
  font-size: 14px;
}

/* ===== Filters bar ===== */
.filters-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filters-spacer {
  flex: 1;
}

/* ===== Table ===== */
.table-wrapper {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  overflow: hidden;
}

.table-body {
  min-height: 0;
}

.table-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.table-pagination {
  padding: 10px 16px;
  display: flex;
  justify-content: center;
  border-top: 1px solid #f1f5f9;
}

.table-wrapper > .n-spin-container,
.table-wrapper :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.n-data-table-th) {
  background: #f8fafc !important;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

:deep(.n-data-table-td) {
  font-size: 13px;
  padding: 8px 12px !important;
}

:deep(.n-data-table-tbody tr) {
  cursor: pointer;
  transition: background-color 0.15s;
}

:deep(.n-data-table-tbody tr:hover) {
  background-color: #f1f5f9 !important;
}

:deep(.row-failed) {
  background-color: #fef2f2 !important;
}

:deep(.row-selected) {
  background: #eff6ff !important;
}

.cell-user-name {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-dim {
  color: #94a3b8;
  font-size: 13px;
}

.cell-cost {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

/* ===== Stage Spinner ===== */
:deep(.stage-spinner) {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: stage-spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 4px;
}

@keyframes stage-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Detail Panel ===== */
.detail-panel {
  margin-top: 20px;
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  overflow: hidden;
}

.detail-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.detail-process-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.detail-title-info {
  flex: 1;
  min-width: 0;
}

.detail-title-info h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.detail-email {
  font-size: 13px;
  color: #94a3b8;
}

.close-detail-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.close-detail-btn:hover {
  background: #f1f5f9;
  color: #475569;
}

.detail-body {
  padding: 20px 24px 24px;
}

/* ===== Detail Grid ===== */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.detail-card {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 16px 18px;
}

.detail-card h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
}

.info-row:last-of-type {
  border-bottom: none;
}

.info-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.info-value {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  margin: 0;
  font-style: italic;
}

/* ===== Cost ===== */
.cost-value {
  font-weight: 700;
  color: #6366f1;
}

.cost-sub-header {
  margin: 14px 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cost-categories {
  margin-top: 10px;
}

.cost-category-header {
  display: grid;
  grid-template-columns: 1fr 80px 60px;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
}

.cost-category-row {
  display: grid;
  grid-template-columns: 1fr 80px 60px;
  gap: 8px;
  font-size: 12px;
  color: #334155;
  padding: 4px 0;
  border-bottom: 1px solid #f8fafc;
}

.cat-name {
  font-weight: 500;
  word-break: break-all;
}

.pending-badge {
  color: #ef4444;
  font-weight: 600;
}

.notes-value {
  font-size: 12px;
  color: #6366f1;
  font-style: italic;
  max-width: 200px;
  text-align: right;
}

/* ===== Actions ===== */
.detail-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

/* ===== Transition ===== */
.slide-up-enter-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .admin-section {
    padding: 0 4px;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filters-bar .n-input,
  .filters-bar .n-select {
    max-width: 100% !important;
    width: 100% !important;
  }

  .filters-spacer {
    display: none;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-header {
    padding: 16px;
  }

  .detail-body {
    padding: 16px;
  }

  .table-wrapper {
    border-radius: 8px;
  }

  :deep(.n-data-table) {
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .section-header h1 {
    font-size: 18px;
  }

  .detail-title-info h2 {
    font-size: 16px;
  }
}
</style>
