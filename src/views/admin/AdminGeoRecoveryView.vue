<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Geo Recovery</h1>
      <p>Monitor anonymous geo-recovery sessions and manage free-run quotas</p>
    </div>

    <div class="summary-card">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Free-run quota — today</h3>
          <p class="panel-description">
            Daily counters for anonymous geo-recovery access.
          </p>
        </div>
        <n-button
          size="small"
          quaternary
          :loading="statsLoading"
          title="Refresh"
          @click="loadStats"
        >
          Refresh
        </n-button>
      </div>

      <div v-if="stats" class="quota-grid">
        <div class="quota-item">
          <span class="quota-label">Global runs today</span>
          <span
            class="quota-value"
            :class="{ 'quota-full': stats.globalCount >= stats.globalLimit }"
          >
            {{ stats.globalCount }} / {{ stats.globalLimit }}
          </span>
        </div>
        <div class="quota-item">
          <span class="quota-label">Distinct IPs today</span>
          <span class="quota-value">{{ stats.ipCount }}</span>
        </div>
        <div class="quota-item">
          <span class="quota-label">IP limit per day</span>
          <span class="quota-value">{{ stats.ipLimit }}</span>
        </div>
      </div>
      <div v-else-if="statsLoading" class="summary-loading-state">
        <SpiralGridLoader variant="primary" :size="40" />
      </div>
      <div v-else class="summary-empty-state">Could not load quota stats.</div>

      <div class="reset-row">
        <n-button
          type="error"
          ghost
          size="small"
          :loading="resetting"
          @click="handleResetFreeRuns"
        >
          Reset today's free-run counters
        </n-button>
        <span class="reset-hint">
          Removes rate-limit keys for today so testing or a genuine reset can
          proceed. Existing sessions are not affected.
        </span>
      </div>
    </div>

    <div class="section-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Analyses</h3>
          <p class="panel-description">
            Combined payment and cost summaries per geo-recovery run.
          </p>
        </div>
        <n-button
          size="small"
          quaternary
          :loading="analysesLoading"
          title="Refresh"
          @click="loadAnalyses"
        >
          Refresh
        </n-button>
      </div>

      <div class="table-wrapper">
        <div class="table-body">
          <div
            v-if="analysesLoading && !analyses.length"
            class="table-loading-state"
          >
            <SpiralGridLoader variant="primary" :size="40" />
          </div>
          <n-data-table
            v-else
            :columns="analysisColumns"
            :data="analyses"
            :row-key="(row: AnalysisRow) => row.id"
            :bordered="false"
            size="small"
            :max-height="520"
            striped
          />
        </div>
        <div
          v-if="analysesMeta"
          class="table-pagination table-pagination-split"
        >
          <span class="dim">{{ analysesMeta.total }} analyses total</span>
          <n-pagination
            v-model:page="analysesPage"
            :page-count="analysesMeta.lastPage"
            :page-slot="5"
            size="small"
            @update:page="loadAnalyses"
          />
        </div>
      </div>
    </div>

    <div class="section-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Active sessions</h3>
          <p class="panel-description">
            Redis sessions created in the last 7 days.
          </p>
        </div>
        <n-button
          size="small"
          quaternary
          :loading="sessionsLoading"
          title="Refresh"
          @click="loadSessions"
        >
          Refresh
        </n-button>
      </div>

      <div class="table-wrapper">
        <div class="table-body">
          <div
            v-if="sessionsLoading && !sessions.length"
            class="table-loading-state"
          >
            <SpiralGridLoader variant="primary" :size="40" />
          </div>
          <n-data-table
            v-else
            :columns="sessionColumns"
            :data="pagedSessions"
            :row-key="(row: SessionRow) => row.sessionId"
            :bordered="false"
            size="small"
            :max-height="420"
            striped
          />
        </div>
        <div
          v-if="sessions.length > pageSize"
          class="table-pagination table-pagination-split"
        >
          <span class="dim">{{ sessions.length }} sessions total</span>
          <n-pagination
            v-model:page="page"
            :page-count="Math.ceil(sessions.length / pageSize)"
            :page-slot="5"
            size="small"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { NButton, NDataTable, NPagination, NTag, useMessage } from "naive-ui";
import type { DataTableColumn } from "naive-ui";
import { api } from "../../utils/axios";
import SpiralGridLoader from "../../components/SpiralGridLoader.vue";

const message = useMessage();

interface FreeRunStats {
  date: string;
  globalCount: number;
  globalLimit: number;
  ipCount: number;
  ipLimit: number;
}

interface JobSnapshot {
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  located: number;
  progressPercent: number;
  startedAt: string;
}

interface SessionRow {
  sessionId: string;
  createdAt: string;
  paid: boolean;
  isFreeRun?: boolean;
  photos: unknown[];
  job: JobSnapshot | null;
}

interface AnalysisRow {
  id: number;
  sessionId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  photoCount: number;
  amountEur: number;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  totalCostEur: number;
  costLogCount: number;
  costCategories: string[];
  costReferenceIds: string[];
  lastCostAt: string | null;
}

interface AnalysesMeta {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  firstPage: number;
  firstPageUrl: string;
  lastPageUrl: string;
  nextPageUrl: string | null;
  previousPageUrl: string | null;
}

const stats = ref<FreeRunStats | null>(null);
const statsLoading = ref(false);
const sessions = ref<SessionRow[]>([]);
const sessionsLoading = ref(false);
const analyses = ref<AnalysisRow[]>([]);
const analysesLoading = ref(false);
const analysesMeta = ref<AnalysesMeta | null>(null);
const analysesPage = ref(1);
const resetting = ref(false);

const page = ref(1);
const pageSize = ref(20);

const pagedSessions = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sessions.value.slice(start, start + pageSize.value);
});

const sessionColumns = computed<DataTableColumn<SessionRow>[]>(() => [
  {
    title: "Session ID",
    key: "sessionId",
    width: 130,
    render(row) {
      return h(
        "span",
        { class: "mono dim", title: row.sessionId },
        truncate(row.sessionId, 8),
      );
    },
  },
  {
    title: "Created",
    key: "createdAt",
    width: 155,
    render(row) {
      return h("span", { class: "dim" }, formatDate(row.createdAt));
    },
  },
  {
    title: "Photos",
    key: "photos",
    width: 80,
    render(row) {
      return row.photos.length;
    },
  },
  {
    title: "Payment",
    key: "paid",
    width: 110,
    render(row) {
      return h(
        NTag,
        { size: "tiny", type: paymentTagType(row), bordered: false },
        { default: () => paymentLabel(row) },
      );
    },
  },
  {
    title: "Job status",
    key: "job",
    width: 120,
    render(row) {
      if (!row.job) {
        return h("span", { class: "dim" }, "—");
      }

      return h(
        NTag,
        { size: "tiny", type: jobTagType(row.job.status), bordered: false },
        { default: () => row.job?.status ?? "—" },
      );
    },
  },
  {
    title: "Progress",
    key: "progress",
    minWidth: 180,
    render(row) {
      return h(
        "span",
        { class: "dim progress-text" },
        formatJobProgress(row.job),
      );
    },
  },
]);

const analysisColumns = computed<DataTableColumn<AnalysisRow>[]>(() => [
  {
    title: "Payment #",
    key: "id",
    width: 90,
    render(row) {
      return h("span", { class: "mono" }, `#${row.id}`);
    },
  },
  {
    title: "Session ID",
    key: "sessionId",
    width: 130,
    render(row) {
      return h(
        "span",
        { class: "mono dim", title: row.sessionId ?? undefined },
        truncate(row.sessionId, 8),
      );
    },
  },
  {
    title: "Email",
    key: "customerEmail",
    minWidth: 190,
    render(row) {
      return h(
        "span",
        { title: row.customerEmail ?? undefined },
        row.customerEmail || "—",
      );
    },
  },
  {
    title: "Photos",
    key: "photoCount",
    width: 80,
  },
  {
    title: "Payment Status",
    key: "status",
    width: 150,
    render(row) {
      return h(
        NTag,
        {
          size: "tiny",
          type: paymentStatusTagType(row.status),
          bordered: false,
        },
        { default: () => row.status },
      );
    },
  },
  {
    title: "Payment €",
    key: "amountEur",
    width: 110,
    render(row) {
      return h("span", { class: "mono" }, Number(row.amountEur).toFixed(2));
    },
  },
  {
    title: "Cost €",
    key: "totalCostEur",
    width: 110,
    render(row) {
      return h("span", { class: "mono" }, Number(row.totalCostEur).toFixed(4));
    },
  },

  // {
  //   title: "Ref IDs",
  //   key: "costReferenceIds",
  //   minWidth: 160,
  //   render(row) {
  //     if (!row.costReferenceIds?.length) {
  //       return h("span", { class: "dim" }, "—");
  //     }

  //     const refs = row.costReferenceIds;
  //     const displayRefs = refs.slice(0, 2);
  //     const overflow = refs.length - displayRefs.length;
  //     const items = displayRefs.map((ref) =>
  //       h("span", { class: "mono dim", title: ref }, truncate(ref, 12)),
  //     );

  //     if (overflow > 0) {
  //       items.push(h("span", { class: "dim" }, `+${overflow}`));
  //     }

  //     return h("div", { class: "ref-ids" }, items);
  //   },
  // },
  {
    title: "Stripe IDs",
    key: "stripeIds",
    minWidth: 300,
    render(row) {
      const stripeRows = [];

      if (row.stripePaymentIntentId) {
        stripeRows.push(
          renderStripeIdRow("PI:", row.stripePaymentIntentId, 20),
        );
      }
      if (row.stripeSessionId) {
        stripeRows.push(renderStripeIdRow("CS:", row.stripeSessionId, 20));
      }
      if (row.stripeCustomerId) {
        stripeRows.push(renderStripeIdRow("Cust:", row.stripeCustomerId, 18));
      }

      return h(
        "div",
        { class: "stripe-ids" },
        stripeRows.length ? stripeRows : [h("span", { class: "dim" }, "—")],
      );
    },
  },
  {
    title: "Created",
    key: "createdAt",
    width: 150,
    render(row) {
      return h("span", { class: "dim" }, formatDate(row.createdAt));
    },
  },
  {
    title: "Last cost",
    key: "lastCostAt",
    width: 150,
    render(row) {
      return h("span", { class: "dim" }, formatDate(row.lastCostAt));
    },
  },
]);

onMounted(() => {
  loadStats();
  loadSessions();
  loadAnalyses();
});

async function loadStats() {
  statsLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/geo-recovery/stats");
    stats.value = data;
  } catch (err: any) {
    message.error(err.response?.data?.error ?? "Could not load stats");
  } finally {
    statsLoading.value = false;
  }
}

async function loadSessions() {
  sessionsLoading.value = true;
  page.value = 1;
  try {
    const { data } = await api.get("/api/admin/geo-recovery/sessions");
    sessions.value = data.sessions ?? [];
  } catch (err: any) {
    message.error(err.response?.data?.error ?? "Could not load sessions");
  } finally {
    sessionsLoading.value = false;
  }
}

async function loadAnalyses() {
  analysesLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/geo-recovery/analyses", {
      params: {
        page: analysesPage.value,
        limit: 50,
      },
    });
    analyses.value = data.analyses ?? [];
    analysesMeta.value = data.meta ?? null;
  } catch (err: any) {
    message.error(err.response?.data?.error ?? "Could not load analyses");
  } finally {
    analysesLoading.value = false;
  }
}

async function handleResetFreeRuns() {
  resetting.value = true;
  try {
    const { data } = await api.post("/api/admin/geo-recovery/reset-free-runs");
    message.success(data.message ?? "Free-run counters cleared");
    await loadStats();
  } catch (err: any) {
    message.error(err.response?.data?.error ?? "Reset failed");
  } finally {
    resetting.value = false;
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success("Copied to clipboard");
  } catch (err) {
    message.error("Failed to copy");
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value: string | null | undefined, length: number): string {
  if (!value) return "—";
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
}

function formatJobProgress(job: JobSnapshot | null): string {
  if (!job) return "—";
  if (job.status === "completed") {
    return `${job.processed} / ${job.total} (${job.located} located)`;
  }

  return `${job.processed} / ${job.total}`;
}

function paymentLabel(session: SessionRow): string {
  if (session.isFreeRun) return "Free run";
  if (session.paid) return "Paid";
  return "Unpaid";
}

function paymentTagType(session: SessionRow): "success" | "info" | "default" {
  if (session.isFreeRun) return "info";
  if (session.paid) return "success";
  return "default";
}

function jobTagType(status: string): "success" | "error" | "warning" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "warning";
}

function paymentStatusTagType(status: string): "success" | "error" | "warning" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "warning";
}

function renderStripeIdRow(label: string, value: string, length: number) {
  return h("div", { class: "stripe-id-row" }, [
    h("span", { class: "stripe-label" }, label),
    h("span", { class: "mono dim", title: value }, truncate(value, length)),
    h(
      NButton,
      {
        size: "tiny",
        text: true,
        class: "copy-btn",
        title: "Copy to clipboard",
        onClick: () => copyToClipboard(value),
      },
      { default: () => "📋" },
    ),
  ]);
}
</script>

<style scoped>
.admin-section {
  /* max-width: 1200px; */
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

.summary-card,
.section-panel {
  margin-bottom: 24px;
}

.summary-card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 20px 24px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.panel-description {
  margin: 4px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.quota-item {
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quota-label {
  font-size: 12px;
  color: #64748b;
}

.quota-value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.quota-full {
  color: #ef4444;
}

.summary-loading-state,
.summary-empty-state,
.table-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 13px;
}

.reset-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 14px;
  border-top: 1px solid #f0f2f5;
}

.reset-hint {
  font-size: 12px;
  color: #94a3b8;
}

.table-wrapper {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  overflow: hidden;
}

.table-body {
  min-height: 0;
}

.table-pagination {
  padding: 10px 16px;
  display: flex;
  justify-content: center;
  border-top: 1px solid #f1f5f9;
}

.table-pagination-split {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
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
  vertical-align: top;
}

:deep(.n-data-table-tbody tr) {
  transition: background-color 0.15s;
}

:deep(.n-data-table-tbody tr:hover) {
  background-color: #f8fafc !important;
}

.mono {
  font-family: monospace;
}

.dim {
  color: #94a3b8;
}

.progress-text {
  line-height: 1.4;
}

.stripe-ids {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ref-ids {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}

.stripe-id-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.stripe-label {
  min-width: 32px;
  font-weight: 600;
  color: #64748b;
}

.copy-btn {
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0 4px !important;
  font-size: 12px;
}

.stripe-id-row:hover .copy-btn {
  opacity: 1;
}

@media (max-width: 768px) {
  .admin-section {
    padding: 0 4px;
  }

  .panel-header {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-card {
    padding: 16px;
  }

  .table-wrapper {
    border-radius: 8px;
  }

  .table-pagination-split {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .section-header h1 {
    font-size: 18px;
  }

  .quota-value {
    font-size: 20px;
  }
}
</style>
