<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Picks</h1>
      <p>Anonymous paid scoring orders: conversion, revenue, cost and progress.</p>
    </div>

    <div class="summary-card">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Overview</h3>
          <p class="panel-description">Orders created in the selected period.</p>
        </div>
        <div class="header-actions">
          <n-button
            v-for="option in PERIODS"
            :key="option"
            size="small"
            :secondary="days !== option"
            :type="days === option ? 'primary' : 'default'"
            @click="setDays(option)"
          >
            {{ option }}d
          </n-button>
          <n-button size="small" quaternary :loading="overviewLoading" @click="loadOverview">
            Refresh
          </n-button>
        </div>
      </div>

      <div v-if="overview" class="kpi-grid">
        <div v-for="kpi in kpis" :key="kpi.label" class="kpi-item">
          <span class="kpi-label">{{ kpi.label }}</span>
          <span class="kpi-value" :class="kpi.tone">{{ kpi.value }}</span>
          <span v-if="kpi.hint" class="kpi-hint">{{ kpi.hint }}</span>
        </div>
      </div>
      <div v-else-if="overviewLoading" class="state"><n-spin :size="40" /></div>
      <div v-else class="state">Could not load the overview.</div>
    </div>

    <div class="summary-card">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Free trials — today</h3>
          <p class="panel-description">Daily counters (UTC) that cap the free trial.</p>
        </div>
        <n-button size="small" quaternary :loading="trialsLoading" @click="loadTrials">Refresh</n-button>
      </div>
      <div v-if="trials" class="kpi-grid">
        <div class="kpi-item">
          <span class="kpi-label">Trials used today</span>
          <span class="kpi-value" :class="{ 'is-bad': trials.used >= trials.dailyLimit }">
            {{ trials.used }} / {{ trials.dailyLimit }}
          </span>
        </div>
        <div class="kpi-item">
          <span class="kpi-label">Distinct IPs today</span>
          <span class="kpi-value">{{ trials.ipCount }}</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-label">Trials per IP per day</span>
          <span class="kpi-value">{{ trials.ipLimit }}</span>
        </div>
      </div>
      <div class="reset-row">
        <n-button type="error" ghost size="small" :loading="resettingTrials" @click="resetTrials">
          Reset today's free-trial counters
        </n-button>
      </div>
    </div>

    <div class="section-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Orders</h3>
          <p class="panel-description">Newest first. Open shows exactly what the buyer sees.</p>
        </div>
        <div class="header-actions">
          <n-button
            v-for="option in FILTERS"
            :key="option.key"
            size="small"
            :secondary="filter !== option.key"
            :type="filter === option.key ? 'primary' : 'default'"
            @click="setFilter(option.key)"
          >
            {{ option.label }}
          </n-button>
          <n-button size="small" quaternary :loading="sessionsLoading" @click="loadSessions">
            Refresh
          </n-button>
        </div>
      </div>

      <div class="table-wrapper">
        <div v-if="sessionsLoading && !sessions.length" class="state"><n-spin :size="40" /></div>
        <n-data-table
          v-else
          :columns="columns"
          :data="sessions"
          :row-key="(row: SessionRow) => row.id"
          :bordered="false"
          size="small"
          :max-height="560"
          :scroll-x="1100"
          striped
        />
        <div v-if="meta" class="table-pagination">
          <span class="dim">{{ meta.total }} orders</span>
          <n-pagination
            v-model:page="page"
            :page-count="Math.max(1, Math.ceil(meta.total / meta.limit))"
            :page-slot="5"
            size="small"
            @update:page="loadSessions"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import {
  NButton,
  NDataTable,
  NPagination,
  NSpin,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumn,
} from "naive-ui";
import { api } from "../../utils/axios";

interface Overview {
  days: number;
  sessions: {
    total: number;
    paid: number;
    free: number;
    processing: number;
    completed: number;
    failed: number;
  };
  photos: { judged: number; failed: number };
  revenueEur: number;
  costEur: number;
  costByTask: Record<string, number>;
  marginEur: number;
  costPer1000PhotosEur: number | null;
}

interface SessionRow {
  id: string;
  status: "open" | "processing" | "completed" | "failed";
  isFree: boolean;
  orderedCount: number;
  paidCount: number | null;
  customerEmail: string | null;
  error: string | null;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  emailSentAt: string | null;
  registered: number;
  judged: number;
  failed: number;
  duplicates: number;
  revenueEur: number;
  costEur: number;
  resultsPath: string | null;
}

const PERIODS = [7, 30, 90];
const FILTERS = [
  { key: "paid", label: "Paid" },
  { key: "free", label: "Free trial" },
  { key: "open", label: "Unpaid" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
];
const STATUS_TAG: Record<SessionRow["status"], "default" | "info" | "success" | "error"> = {
  open: "default",
  processing: "info",
  completed: "success",
  failed: "error",
};

const message = useMessage();
const dialog = useDialog();

interface TrialStats {
  date: string;
  used: number;
  dailyLimit: number;
  ipCount: number;
  ipLimit: number;
}

const trials = ref<TrialStats | null>(null);
const trialsLoading = ref(false);
const resettingTrials = ref(false);

async function loadTrials() {
  trialsLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/picks/free-trials");
    trials.value = data;
  } catch {
    trials.value = null;
  } finally {
    trialsLoading.value = false;
  }
}

async function resetTrials() {
  resettingTrials.value = true;
  try {
    await api.post("/api/admin/picks/free-trials/reset");
    message.success("Free-trial counters cleared: every IP can run a trial again today.");
    await loadTrials();
  } catch {
    message.error("Could not reset the free-trial counters.");
  } finally {
    resettingTrials.value = false;
  }
}

const days = ref(30);
const overview = ref<Overview | null>(null);
const overviewLoading = ref(false);

const filter = ref("paid");
const page = ref(1);
const sessions = ref<SessionRow[]>([]);
const meta = ref<{ page: number; limit: number; total: number } | null>(null);
const sessionsLoading = ref(false);

const eur = (n: number, decimals = 2) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
const int = (n: number) => new Intl.NumberFormat("en-US").format(n);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";

const kpis = computed(() => {
  const o = overview.value;
  if (!o) return [];
  // Free trials never reach the checkout, so they stay out of the conversion.
  const checkouts = o.sessions.total - o.sessions.free;
  const conversion = checkouts ? Math.round((o.sessions.paid / checkouts) * 100) : 0;
  return [
    { label: "Checkouts opened", value: int(checkouts) },
    { label: "Paid", value: int(o.sessions.paid), hint: `${conversion}% conversion` },
    { label: "Free trials", value: int(o.sessions.free) },
    { label: "Processing now", value: int(o.sessions.processing) },
    {
      label: "Failed",
      value: int(o.sessions.failed),
      tone: o.sessions.failed > 0 ? "is-bad" : "",
    },
    {
      label: "Photos judged",
      value: int(o.photos.judged),
      hint: o.photos.failed ? `${int(o.photos.failed)} failed` : undefined,
    },
    { label: "Revenue", value: eur(o.revenueEur) },
    {
      label: "AI cost",
      value: eur(o.costEur),
      hint: Object.entries(o.costByTask)
        .map(([task, cost]) => `${task} ${eur(cost)}`)
        .join(" · "),
    },
    {
      label: "Margin",
      value: eur(o.marginEur),
      tone: o.marginEur < 0 ? "is-bad" : "is-good",
      hint: o.costPer1000PhotosEur !== null ? `${eur(o.costPer1000PhotosEur)} cost / 1,000 photos` : undefined,
    },
  ];
});

const columns: DataTableColumn<SessionRow>[] = [
  { title: "Created", key: "createdAt", width: 130, render: (row) => when(row.createdAt) },
  {
    title: "Status",
    key: "status",
    width: 140,
    render: (row) =>
      h("div", { class: "row-tags" }, [
        h(
          NTag,
          { size: "small", bordered: false, type: STATUS_TAG[row.status], title: row.error ?? undefined },
          { default: () => row.status },
        ),
        row.isFree
          ? h(NTag, { size: "small", bordered: false, type: "warning" }, { default: () => "free" })
          : null,
      ]),
  },
  {
    title: "Email",
    key: "customerEmail",
    width: 210,
    ellipsis: { tooltip: true },
    render: (row) => row.customerEmail ?? "—",
  },
  {
    title: "Photos",
    key: "photos",
    width: 150,
    render: (row) => {
      const target = row.paidCount ?? row.orderedCount;
      return row.paidAt
        ? `${int(row.judged + row.duplicates)} / ${int(target)} judged${row.duplicates ? ` · ${int(row.duplicates)} copies` : ""}`
        : `${int(row.registered)} uploaded · quote ${int(row.orderedCount)}`;
    },
  },
  {
    title: "Failed",
    key: "failed",
    width: 70,
    render: (row) => (row.failed ? h("span", { class: "is-bad" }, int(row.failed)) : "—"),
  },
  { title: "Revenue", key: "revenueEur", width: 90, render: (row) => eur(row.revenueEur) },
  { title: "AI cost", key: "costEur", width: 90, render: (row) => eur(row.costEur, 3) },
  {
    title: "Margin",
    key: "margin",
    width: 90,
    render: (row) => {
      const margin = row.revenueEur - row.costEur;
      return h("span", { class: margin < 0 ? "is-bad" : "" }, eur(margin));
    },
  },
  { title: "Email sent", key: "emailSentAt", width: 130, render: (row) => when(row.emailSentAt) },
  {
    title: "",
    key: "actions",
    width: 150,
    fixed: "right",
    render: (row) =>
      h("div", { class: "row-actions" }, [
        row.resultsPath
          ? h(
              NButton,
              { size: "tiny", secondary: true, onClick: () => window.open(row.resultsPath!, "_blank") },
              { default: () => "Open" },
            )
          : null,
        row.paidAt && row.status !== "completed"
          ? h(
              NButton,
              { size: "tiny", type: "warning", secondary: true, onClick: () => confirmResume(row) },
              { default: () => "Resume" },
            )
          : null,
      ]),
  },
];

async function loadOverview() {
  overviewLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/picks/overview", { params: { days: days.value } });
    overview.value = data;
  } catch {
    overview.value = null;
  } finally {
    overviewLoading.value = false;
  }
}

async function loadSessions() {
  sessionsLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/picks/sessions", {
      params: { filter: filter.value, page: page.value, limit: 50 },
    });
    sessions.value = data.sessions;
    meta.value = data.meta;
  } catch {
    message.error("Could not load the orders.");
  } finally {
    sessionsLoading.value = false;
  }
}

function setDays(value: number) {
  days.value = value;
  void loadOverview();
}

function setFilter(value: string) {
  filter.value = value;
  page.value = 1;
  void loadSessions();
}

function confirmResume(row: SessionRow) {
  dialog.warning({
    title: "Resume judging?",
    content:
      "Failed photos go back to the queue and the jury picks up the pending ones. Each retried photo costs AI credits again.",
    positiveText: "Resume",
    negativeText: "Cancel",
    onPositiveClick: async () => {
      try {
        await api.post(`/api/admin/picks/sessions/${row.id}/resume`);
        message.success("Judging resumed.");
        await loadSessions();
      } catch {
        message.error("Could not resume this order.");
      }
    },
  });
}

onMounted(() => {
  void loadTrials();
  void loadOverview();
  void loadSessions();
});
</script>

<style scoped>
.admin-section {
  margin: 0 auto;
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
  flex-wrap: wrap;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
}

.kpi-item {
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-label {
  font-size: 12px;
  color: #64748b;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.kpi-hint {
  font-size: 11px;
  color: #94a3b8;
}

.is-bad {
  color: #ef4444 !important;
}

.is-good {
  color: #16a34a !important;
}

.reset-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #f0f2f5;
}

.state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 13px;
}

.table-wrapper {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  overflow: hidden;
}

.table-pagination {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #f1f5f9;
}

.dim {
  color: #94a3b8;
  font-size: 12px;
}

.row-tags {
  display: flex;
  gap: 4px;
}

.row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

:deep(.n-data-table-th) {
  background: #f8fafc !important;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
</style>
