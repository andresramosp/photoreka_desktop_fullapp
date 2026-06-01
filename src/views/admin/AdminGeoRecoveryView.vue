<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Geo Recovery</h1>
      <p>Monitor anonymous geo-recovery sessions and manage free-run quotas</p>
    </div>

    <!-- ── Free-run counters ───────────────────────────────────────────── -->
    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Free-run quota — today</h3>
        <n-button
          size="tiny"
          quaternary
          :loading="statsLoading"
          title="Refresh"
          @click="loadStats"
        >
          ↻
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
      <div v-else-if="statsLoading" class="loading-inline">
        <n-spin size="small" />
      </div>

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
          Removes rate-limit keys for today so testing (or a genuine reset) can
          proceed. Does not affect sessions already created.
        </span>
      </div>
    </div>

    <!-- ── Sessions table ─────────────────────────────────────────────── -->
    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Active sessions (Redis, last 7 days)</h3>
        <n-button
          size="tiny"
          quaternary
          :loading="sessionsLoading"
          title="Refresh"
          @click="loadSessions"
        >
          ↻
        </n-button>
      </div>

      <div v-if="sessionsLoading && !sessions.length" class="loading-inline">
        <n-spin size="small" />
      </div>

      <div v-else-if="!sessions.length" class="no-data">No sessions found</div>

      <div v-else class="sessions-table">
        <div class="tbl-head">
          <span>Session ID</span>
          <span>Created</span>
          <span>Photos</span>
          <span>Payment</span>
          <span>Job status</span>
          <span>Progress</span>
        </div>
        <div v-for="s in pagedSessions" :key="s.sessionId" class="tbl-row">
          <span class="mono dim" :title="s.sessionId">
            {{ s.sessionId.slice(0, 8) }}…
          </span>
          <span class="dim">{{ formatDate(s.createdAt) }}</span>
          <span>{{ s.photos.length }}</span>
          <span>
            <n-tag size="tiny" :type="paymentTagType(s)" :bordered="false">
              {{ paymentLabel(s) }}
            </n-tag>
          </span>
          <span>
            <n-tag
              v-if="s.job"
              size="tiny"
              :type="jobTagType(s.job.status)"
              :bordered="false"
            >
              {{ s.job.status }}
            </n-tag>
            <span v-else class="dim">—</span>
          </span>
          <span class="dim">
            <template v-if="s.job">
              {{ s.job.processed }} / {{ s.job.total }}
              <span v-if="s.job.status === 'completed'">
                ({{ s.job.located }} located)
              </span>
            </template>
            <template v-else>—</template>
          </span>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="sessions.length > pageSize" class="tbl-pagination">
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { api } from "../../utils/axios";

const message = useMessage();

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── State ─────────────────────────────────────────────────────────────────

const stats = ref<FreeRunStats | null>(null);
const statsLoading = ref(false);
const sessions = ref<SessionRow[]>([]);
const sessionsLoading = ref(false);
const resetting = ref(false);

const page = ref(1);
const pageSize = ref(20);

const pagedSessions = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sessions.value.slice(start, start + pageSize.value);
});

// ── Init ──────────────────────────────────────────────────────────────────

onMounted(() => {
  loadStats();
  loadSessions();
});

// ── Loaders ───────────────────────────────────────────────────────────────

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

// ── Actions ───────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(s: SessionRow): string {
  if (s.isFreeRun) return "Free run";
  if (s.paid) return "Paid";
  return "Unpaid";
}

function paymentTagType(s: SessionRow): "success" | "info" | "default" {
  if (s.isFreeRun) return "info";
  if (s.paid) return "success";
  return "default";
}

function jobTagType(status: string): "success" | "error" | "warning" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "warning";
}
</script>

<style scoped>
.admin-section {
  max-width: 960px;
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

/* ── Cards ─────────────────────────────────────────── */
.card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 22px 24px;
  margin-bottom: 24px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

/* ── Quota grid ────────────────────────────────────── */
.quota-grid {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.quota-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quota-label {
  font-size: 12px;
  color: #64748b;
}

.quota-value {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
}

.quota-full {
  color: #ef4444;
}

/* ── Reset row ─────────────────────────────────────── */
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

/* ── Sessions table ────────────────────────────────── */
.sessions-table {
  font-size: 13px;
}

.tbl-head,
.tbl-row {
  display: grid;
  grid-template-columns: 120px 140px 70px 100px 110px 1fr;
  gap: 8px;
  padding: 8px 6px;
  align-items: center;
}

.tbl-head {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #f0f2f5;
  padding-bottom: 10px;
  margin-bottom: 2px;
}

.tbl-row {
  border-bottom: 1px solid #f8fafc;
  color: #334155;
}

.tbl-row:last-child {
  border-bottom: none;
}

.mono {
  font-family: monospace;
}

.dim {
  color: #94a3b8;
}

/* ── Pagination ────────────────────────────────────── */
.tbl-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid #f0f2f5;
  font-size: 12px;
}

/* ── Misc ──────────────────────────────────────────── */
.loading-inline {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.no-data {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 24px 0;
}
</style>
