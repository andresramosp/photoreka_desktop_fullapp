<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Health Dashboard</h1>
      <p>
        Photo integrity, global embeddings status, and user-level diagnostics
      </p>
    </div>

    <!-- Overview Cards -->
    <div class="overview-cards">
      <div class="stat-card">
        <div class="stat-value" :class="scoreClass(overview?.globalScore)">
          {{ overview?.globalScore ?? "—" }}%
        </div>
        <div class="stat-label">Global Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ overview?.totalPhotos ?? "—" }}</div>
        <div class="stat-label">Total Photos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ overview?.totalUsers ?? "—" }}</div>
        <div class="stat-label">Users with Photos</div>
      </div>
      <div
        class="stat-card"
        :class="{ 'stat-warn': (overview?.missingEmbeddings ?? 0) > 0 }"
      >
        <div class="stat-value">{{ overview?.missingEmbeddings ?? "—" }}</div>
        <div class="stat-label">Photos w/o CLIP</div>
      </div>
      <div
        class="stat-card"
        :class="{ 'stat-warn': (overview?.missingDescriptions ?? 0) > 0 }"
      >
        <div class="stat-value">{{ overview?.missingDescriptions ?? "—" }}</div>
        <div class="stat-label">Photos w/o Descriptions</div>
      </div>
      <div
        class="stat-card"
        :class="{ 'stat-warn': (overview?.missingColorHistogram ?? 0) > 0 }"
      >
        <div class="stat-value">
          {{ overview?.missingColorHistogram ?? "—" }}
        </div>
        <div class="stat-label">Photos w/o Color</div>
      </div>
    </div>

    <!-- Embeddings Sections -->
    <div class="embeddings-grid">
      <!-- CLIP Embeddings -->
      <div class="embeddings-section">
        <div class="embeddings-header">
          <h3>CLIP Embeddings</h3>
          <p>
            Per-photo visual embeddings generated from images via CLIP model
          </p>
        </div>
        <div class="embeddings-body">
          <div class="embeddings-stats">
            <div class="emb-stat">
              <span
                class="emb-count"
                :class="{ 'emb-bad': (overview?.missingEmbeddings ?? 0) > 0 }"
              >
                {{ overview?.missingEmbeddings ?? "—" }}
              </span>
              <span class="emb-label">Photos without CLIP</span>
            </div>
            <div class="emb-stat">
              <span class="emb-count emb-total">
                {{ overview?.totalPhotos ?? "—" }}
              </span>
              <span class="emb-label">Total photos</span>
            </div>
          </div>
          <n-button
            size="small"
            type="warning"
            :loading="globalClipLoading"
            :disabled="
              globalClipLoading || (overview?.missingEmbeddings ?? 0) === 0
            "
            @click="confirmGlobalClip"
          >
            Repair CLIP
          </n-button>
        </div>
      </div>

      <!-- Tag Embeddings -->
      <div class="embeddings-section">
        <div class="embeddings-header">
          <h3>Tag Embeddings</h3>
          <p>Text embeddings for photo tags used in semantic search</p>
        </div>
        <div class="embeddings-body">
          <div class="embeddings-stats">
            <div class="emb-stat">
              <span
                class="emb-count"
                :class="{
                  'emb-bad': (overview?.tagsWithoutEmbedding ?? 0) > 0,
                }"
              >
                {{ overview?.tagsWithoutEmbedding ?? "—" }}
              </span>
              <span class="emb-label">Tags without embedding</span>
            </div>
            <div class="emb-stat">
              <span class="emb-count emb-total">
                {{ overview?.tagsTotal ?? "—" }}
              </span>
              <span class="emb-label">Total tags</span>
            </div>
          </div>
          <n-button
            size="small"
            type="warning"
            :loading="globalEmbLoading"
            :disabled="
              globalEmbLoading || (overview?.tagsWithoutEmbedding ?? 0) === 0
            "
            @click="confirmGlobalTagEmbeddings"
          >
            Repair Tags
          </n-button>
        </div>
      </div>

      <!-- Chunk Embeddings -->
      <div class="embeddings-section">
        <div class="embeddings-header">
          <h3>Chunk Embeddings</h3>
          <p>Text embeddings for description chunks used in semantic search</p>
        </div>
        <div class="embeddings-body">
          <div class="embeddings-stats">
            <div class="emb-stat">
              <span
                class="emb-count"
                :class="{
                  'emb-bad': (overview?.chunksWithoutEmbedding ?? 0) > 0,
                }"
              >
                {{ overview?.chunksWithoutEmbedding ?? "—" }}
              </span>
              <span class="emb-label">Chunks without embedding</span>
            </div>
            <div class="emb-stat">
              <span class="emb-count emb-total">
                {{ overview?.chunksTotal ?? "—" }}
              </span>
              <span class="emb-label">Total chunks</span>
            </div>
          </div>
          <n-button
            size="small"
            type="warning"
            :loading="globalEmbLoading"
            :disabled="
              globalEmbLoading || (overview?.chunksWithoutEmbedding ?? 0) === 0
            "
            @click="confirmGlobalChunkEmbeddings"
          >
            Repair Chunks
          </n-button>
        </div>
      </div>
    </div>

    <!-- Users Table -->
    <div class="table-wrapper">
      <div class="table-header-bar">
        <n-input
          v-model:value="searchQuery"
          placeholder="Search by user name or email…"
          clearable
          size="small"
          style="max-width: 280px"
          @update:value="filterUsers"
        >
          <template #prefix>
            <n-icon size="16"><SearchIcon /></n-icon>
          </template>
        </n-input>
        <div class="filters-spacer" />
        <n-button
          size="small"
          quaternary
          :loading="overviewLoading"
          @click="fetchOverview"
        >
          Refresh
        </n-button>
      </div>
      <div class="table-body">
        <div v-if="overviewLoading" class="table-loading-state">
          <n-spin show />
        </div>
        <n-data-table
          v-else
          :columns="columns"
          :data="paginatedUsers"
          :row-key="(row: UserHealthRow) => row.userId"
          :row-class-name="rowClassName"
          :row-props="
            (row: UserHealthRow) => ({
              onClick: () => selectUser(row),
              style: 'cursor: pointer',
            })
          "
          :bordered="false"
          size="small"
          :max-height="360"
          striped
        />
      </div>
      <div class="table-pagination">
        <n-pagination
          v-model:page="currentPage"
          :page-size="pageSize"
          :item-count="filteredUsers.length"
          size="small"
        />
      </div>
    </div>

    <!-- User Detail Panel -->
    <transition name="slide-up">
      <div v-if="selectedUser" class="detail-panel">
        <div class="detail-header">
          <div class="detail-title-row">
            <div class="detail-process-icon">
              <n-icon size="22" color="#6366f1"><PersonIcon /></n-icon>
            </div>
            <div class="detail-title-info">
              <h2>{{ selectedUser.userName }}</h2>
              <span class="detail-email">{{ selectedUser.userEmail }}</span>
            </div>
            <button class="close-detail-btn" @click="selectedUser = null">
              <n-icon size="18"><CloseIcon /></n-icon>
            </button>
          </div>
        </div>
        <div class="detail-body">
          <div class="detail-quick-stats">
            <div class="quick-stat">
              <span class="qs-value">{{ selectedUser.totalPhotos }}</span>
              <span class="qs-label">Photos</span>
            </div>
            <div class="quick-stat">
              <span class="qs-value"
                >{{ selectedUser.withEmbedding }}/{{
                  selectedUser.totalPhotos
                }}</span
              >
              <span class="qs-label">CLIP</span>
            </div>
            <div class="quick-stat">
              <span class="qs-value"
                >{{ selectedUser.withDescriptions }}/{{
                  selectedUser.totalPhotos
                }}</span
              >
              <span class="qs-label">Descriptions</span>
            </div>
            <div class="quick-stat">
              <span class="qs-value"
                >{{ selectedUser.withColorHistogram }}/{{
                  selectedUser.totalPhotos
                }}</span
              >
              <span class="qs-label">Color</span>
            </div>
            <div class="quick-stat">
              <span
                class="qs-value"
                :class="scoreClass(selectedUser.quickScore)"
                >{{ selectedUser.quickScore }}%</span
              >
              <span class="qs-label">Quick Score</span>
            </div>
          </div>
          <div class="detail-actions">
            <n-button
              size="small"
              type="info"
              :loading="healthCheckLoading"
              @click="runUserHealthCheck"
            >
              Run Full Health Check
            </n-button>
            <n-button
              size="small"
              type="primary"
              :loading="retryLoading"
              :disabled="retryLoading"
              @click="confirmUserRetry"
            >
              Repair All Unhealthy
            </n-button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Health Report Modal -->
    <HealthReportModal
      v-model:show="healthModalVisible"
      :title="`Health Check — ${selectedUser?.userName ?? ''}`"
      :loading="healthCheckLoading"
      :report="healthReport"
      :error="healthError"
      @retry="runUserHealthCheck"
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
  NDataTable,
  NSpin,
  NPagination,
  NProgress,
  useMessage,
  useDialog,
} from "naive-ui";
import type { DataTableColumn } from "naive-ui";
import {
  SearchOutline as SearchIcon,
  CloseOutline as CloseIcon,
  PersonOutline as PersonIcon,
} from "@vicons/ionicons5";
import { api } from "../../utils/axios";
import HealthReportModal from "../../components/admin/HealthReportModal.vue";
import type { HealthReport } from "../../components/admin/HealthReportModal.vue";

interface UserHealthRow {
  userId: number;
  userName: string;
  userEmail: string;
  totalPhotos: number;
  withEmbedding: number;
  withDescriptions: number;
  withColorHistogram: number;
  quickScore: number;
}

interface OverviewData {
  totalUsers: number;
  totalPhotos: number;
  globalScore: number;
  missingEmbeddings: number;
  missingDescriptions: number;
  missingColorHistogram: number;
  tagsWithoutEmbedding: number;
  tagsTotal: number;
  chunksWithoutEmbedding: number;
  chunksTotal: number;
  users: UserHealthRow[];
}

const message = useMessage();
const dialog = useDialog();

// Overview state
const overview = ref<OverviewData | null>(null);
const overviewLoading = ref(false);
const allUsers = ref<UserHealthRow[]>([]);
const searchQuery = ref("");
const currentPage = ref(1);
const pageSize = 20;

// User detail state
const selectedUser = ref<UserHealthRow | null>(null);
const healthCheckLoading = ref(false);
const healthModalVisible = ref(false);
const healthReport = ref<HealthReport | null>(null);
const healthError = ref(false);
const retryLoading = ref(false);

// Global embeddings state
const globalEmbLoading = ref(false);
const globalClipLoading = ref(false);

function scoreClass(score: number | undefined) {
  if (score === undefined) return "";
  if (score >= 95) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

const filteredUsers = computed(() => {
  if (!searchQuery.value) return allUsers.value;
  const term = searchQuery.value.toLowerCase();
  return allUsers.value.filter(
    (u) =>
      u.userName.toLowerCase().includes(term) ||
      u.userEmail.toLowerCase().includes(term),
  );
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredUsers.value.slice(start, start + pageSize);
});

function filterUsers() {
  currentPage.value = 1;
}

function rowClassName(row: UserHealthRow) {
  if (selectedUser.value?.userId === row.userId) return "row-selected";
  if (row.quickScore < 70) return "row-failed";
  return "";
}

function selectUser(row: UserHealthRow) {
  selectedUser.value = row;
}

// Columns
const columns = computed<DataTableColumn<UserHealthRow>[]>(() => [
  {
    title: "User",
    key: "userName",
    width: 200,
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
    title: "Photos",
    key: "totalPhotos",
    width: 80,
    sorter: (a, b) => a.totalPhotos - b.totalPhotos,
    render(row) {
      return h("span", { class: "cell-user-name" }, String(row.totalPhotos));
    },
  },
  {
    title: "CLIP",
    key: "withEmbedding",
    width: 110,
    render(row) {
      const pct =
        row.totalPhotos > 0
          ? Math.round((row.withEmbedding / row.totalPhotos) * 100)
          : 100;
      return h(
        "div",
        { style: "display: flex; align-items: center; gap: 6px" },
        [
          h(NProgress, {
            type: "line",
            percentage: pct,
            showIndicator: false,
            status: pct === 100 ? "success" : pct >= 70 ? "warning" : "error",
            style: "flex: 1",
          }),
          h(
            "span",
            { style: "font-size: 11px; color: #64748b; min-width: 32px" },
            `${pct}%`,
          ),
        ],
      );
    },
  },
  {
    title: "Descriptions",
    key: "withDescriptions",
    width: 110,
    render(row) {
      const pct =
        row.totalPhotos > 0
          ? Math.round((row.withDescriptions / row.totalPhotos) * 100)
          : 100;
      return h(
        "div",
        { style: "display: flex; align-items: center; gap: 6px" },
        [
          h(NProgress, {
            type: "line",
            percentage: pct,
            showIndicator: false,
            status: pct === 100 ? "success" : pct >= 70 ? "warning" : "error",
            style: "flex: 1",
          }),
          h(
            "span",
            { style: "font-size: 11px; color: #64748b; min-width: 32px" },
            `${pct}%`,
          ),
        ],
      );
    },
  },
  {
    title: "Color",
    key: "withColorHistogram",
    width: 110,
    render(row) {
      const pct =
        row.totalPhotos > 0
          ? Math.round((row.withColorHistogram / row.totalPhotos) * 100)
          : 100;
      return h(
        "div",
        { style: "display: flex; align-items: center; gap: 6px" },
        [
          h(NProgress, {
            type: "line",
            percentage: pct,
            showIndicator: false,
            status: pct === 100 ? "success" : pct >= 70 ? "warning" : "error",
            style: "flex: 1",
          }),
          h(
            "span",
            { style: "font-size: 11px; color: #64748b; min-width: 32px" },
            `${pct}%`,
          ),
        ],
      );
    },
  },
  {
    title: "Score",
    key: "quickScore",
    width: 80,
    sorter: (a, b) => a.quickScore - b.quickScore,
    render(row) {
      const cls =
        row.quickScore >= 95
          ? "score-good"
          : row.quickScore >= 70
            ? "score-warn"
            : "score-bad";
      return h("span", { class: `cell-score ${cls}` }, `${row.quickScore}%`);
    },
  },
]);

// API calls
async function fetchOverview() {
  overviewLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/health/overview");
    overview.value = data;
    allUsers.value = data.users;
  } catch {
    message.error("Failed to load health overview");
  } finally {
    overviewLoading.value = false;
  }
}

async function runUserHealthCheck() {
  if (!selectedUser.value) return;
  healthReport.value = null;
  healthError.value = false;
  healthCheckLoading.value = true;
  healthModalVisible.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/health/users/${selectedUser.value.userId}/check`,
    );
    healthReport.value = data.report;
  } catch {
    healthError.value = true;
  } finally {
    healthCheckLoading.value = false;
  }
}

function confirmUserRetry() {
  if (!selectedUser.value) return;
  const u = selectedUser.value;
  dialog.warning({
    title: "Confirm Repair All",
    content: `This will run a full health check on ${u.userName}'s ${u.totalPhotos} photos, then launch an admin_retry for all unhealthy photos. No cost will be charged to the user.`,
    positiveText: "Repair",
    negativeText: "Cancel",
    onPositiveClick: () => launchUserRetry(),
  });
}

async function launchUserRetry() {
  if (!selectedUser.value) return;
  retryLoading.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/health/users/${selectedUser.value.userId}/retry`,
    );
    message.success(
      `Retry launched: ${data.photosCount} photos in Process #${data.processId}`,
    );
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to launch repair";
    message.error(msg);
  } finally {
    retryLoading.value = false;
  }
}

function confirmGlobalTagEmbeddings() {
  dialog.warning({
    title: "Repair Tag Embeddings",
    content: `This will generate text embeddings for all ${overview.value?.tagsWithoutEmbedding ?? 0} tags that are missing them. This also processes chunk embeddings.`,
    positiveText: "Run",
    negativeText: "Cancel",
    onPositiveClick: () => runGlobalEmbeddings(),
  });
}

function confirmGlobalChunkEmbeddings() {
  dialog.warning({
    title: "Repair Chunk Embeddings",
    content: `This will generate text embeddings for all ${overview.value?.chunksWithoutEmbedding ?? 0} description chunks that are missing them. This also processes tag embeddings.`,
    positiveText: "Run",
    negativeText: "Cancel",
    onPositiveClick: () => runGlobalEmbeddings(),
  });
}

function confirmGlobalClip() {
  dialog.warning({
    title: "Repair CLIP Embeddings",
    content: `This will download images and generate CLIP visual embeddings for all ${overview.value?.missingEmbeddings ?? 0} photos missing them. This is resource-intensive and may take a while.`,
    positiveText: "Run",
    negativeText: "Cancel",
    onPositiveClick: () => runGlobalClipEmbeddings(),
  });
}

async function runGlobalEmbeddings() {
  globalEmbLoading.value = true;
  try {
    const { data } = await api.post("/api/admin/health/global-embeddings/run");
    message.success(
      `Global embeddings task launched (${data.tagsToProcess} tags, ${data.chunksToProcess} chunks remaining)`,
    );
    setTimeout(() => fetchOverview(), 3000);
  } catch {
    message.error("Failed to launch global embeddings task");
  } finally {
    globalEmbLoading.value = false;
  }
}

async function runGlobalClipEmbeddings() {
  globalClipLoading.value = true;
  try {
    const { data } = await api.post("/api/admin/health/global-clip/run");
    message.success(
      `CLIP embeddings task launched (${data.photosToProcess} photos to process)`,
    );
    setTimeout(() => fetchOverview(), 5000);
  } catch {
    message.error("Failed to launch CLIP embeddings task");
  } finally {
    globalClipLoading.value = false;
  }
}

onMounted(() => {
  fetchOverview();
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

/* ===== Overview Cards ===== */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}

.stat-card.stat-warn {
  border-color: #fbbf24;
  background: #fffbeb;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 4px;
}

/* ===== Score Colors ===== */
.score-good {
  color: #22c55e !important;
}

.score-warn {
  color: #f59e0b !important;
}

.score-bad {
  color: #ef4444 !important;
}

/* ===== Global Embeddings Section ===== */
.embeddings-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.embeddings-section {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 16px 20px;
}

.embeddings-header h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.embeddings-header p {
  margin: 0 0 14px;
  font-size: 13px;
  color: #94a3b8;
}

.embeddings-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.embeddings-stats {
  display: flex;
  gap: 20px;
}

.emb-stat {
  display: flex;
  align-items: center;
  gap: 8px;
}

.emb-count {
  font-size: 20px;
  font-weight: 700;
  color: #22c55e;
}

.emb-count.emb-bad {
  color: #ef4444;
}

.emb-count.emb-total {
  color: #64748b;
}

.emb-label {
  font-size: 13px;
  color: #64748b;
}

/* ===== Table ===== */
.table-wrapper {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  overflow: hidden;
}

.table-header-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.filters-spacer {
  flex: 1;
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
}

.cell-score {
  font-weight: 700;
  font-size: 13px;
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

.detail-quick-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.quick-stat {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
  min-width: 90px;
}

.qs-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.qs-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 4px;
}

.detail-actions {
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

  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .embeddings-grid {
    grid-template-columns: 1fr;
  }

  .embeddings-body {
    flex-direction: column;
    align-items: flex-start;
  }

  .embeddings-stats {
    flex-direction: column;
    gap: 8px;
  }

  .detail-quick-stats {
    gap: 8px;
  }

  .quick-stat {
    min-width: 70px;
    padding: 8px 12px;
  }
}
</style>
