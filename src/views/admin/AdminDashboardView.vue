<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Dashboard</h1>
      <p>System overview at a glance</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <n-spin size="medium" />
    </div>

    <template v-else-if="data">
      <!-- ═══ KPI Cards ═══ -->
      <div class="kpi-grid">
        <div class="kpi-card clickable" @click="goTo('admin-users')">
          <span class="kpi-label">Users</span>
          <span class="kpi-value primary">{{ data.users.total }}</span>
          <span class="kpi-sub">{{ data.users.active }} active</span>
          <span v-if="data.users.recentSignups > 0" class="kpi-badge badge-new">
            +{{ data.users.recentSignups }} this week
          </span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Photos</span>
          <span class="kpi-value">{{
            data.photos.total.toLocaleString()
          }}</span>
        </div>

        <div class="kpi-card clickable" @click="goTo('admin-processes')">
          <span class="kpi-label">Processes</span>
          <span class="kpi-value">{{ data.processes.total }}</span>
          <div class="kpi-tags">
            <span v-if="data.processes.active > 0" class="mini-tag tag-active">
              {{ data.processes.active }} active
            </span>
            <span v-if="data.processes.failed > 0" class="mini-tag tag-failed">
              {{ data.processes.failed }} failed
            </span>
          </div>
        </div>

        <div class="kpi-card clickable" @click="goTo('admin-health')">
          <span class="kpi-label">Health Score</span>
          <span class="kpi-value" :class="scoreClass(data.health.globalScore)">
            {{ data.health.globalScore }}%
          </span>
        </div>

        <div class="kpi-card clickable" @click="goTo('admin-costs')">
          <span class="kpi-label">Total Cost</span>
          <span class="kpi-value primary"
            >€{{ fmt(data.costs.totalCostEur) }}</span
          >
        </div>

        <div class="kpi-card clickable" @click="goTo('admin-costs')">
          <span class="kpi-label">This Month</span>
          <span class="kpi-value">€{{ fmt(data.costs.thisMonthCostEur) }}</span>
          <span
            v-if="data.costs.monthOverMonthPct !== null"
            class="kpi-badge"
            :class="
              data.costs.monthOverMonthPct >= 0 ? 'badge-up' : 'badge-down'
            "
          >
            {{ data.costs.monthOverMonthPct >= 0 ? "▲" : "▼" }}
            {{ Math.abs(data.costs.monthOverMonthPct).toFixed(1) }}%
          </span>
        </div>
      </div>

      <!-- ═══ Alerts Section ═══ -->
      <div v-if="hasAlerts" class="alerts-section">
        <div
          v-if="data.processes.failed > 0"
          class="alert-card alert-error"
          @click="goTo('admin-processes')"
        >
          <span class="alert-icon">!</span>
          <div class="alert-content">
            <strong
              >{{ data.processes.failed }} failed process{{
                data.processes.failed > 1 ? "es" : ""
              }}</strong
            >
            <span class="alert-hint">Click to review</span>
          </div>
        </div>
        <div
          v-if="data.health.missingEmbeddings > 0"
          class="alert-card alert-warn"
          @click="goTo('admin-health')"
        >
          <span class="alert-icon">⚠</span>
          <div class="alert-content">
            <strong
              >{{ data.health.missingEmbeddings }} photos without CLIP
              embeddings</strong
            >
            <span class="alert-hint">Click to fix</span>
          </div>
        </div>
        <div
          v-if="data.health.missingDescriptions > 0"
          class="alert-card alert-warn"
          @click="goTo('admin-health')"
        >
          <span class="alert-icon">⚠</span>
          <div class="alert-content">
            <strong
              >{{ data.health.missingDescriptions }} photos without
              descriptions</strong
            >
            <span class="alert-hint">Click to fix</span>
          </div>
        </div>
        <div
          v-if="data.health.tagsWithoutEmbedding > 0"
          class="alert-card alert-info"
          @click="goTo('admin-health')"
        >
          <span class="alert-icon">i</span>
          <div class="alert-content">
            <strong
              >{{ data.health.tagsWithoutEmbedding }} tags without
              embeddings</strong
            >
            <span class="alert-hint">Run global embeddings</span>
          </div>
        </div>
        <div
          v-if="data.health.chunksWithoutEmbedding > 0"
          class="alert-card alert-info"
          @click="goTo('admin-health')"
        >
          <span class="alert-icon">i</span>
          <div class="alert-content">
            <strong
              >{{ data.health.chunksWithoutEmbedding }} chunks without
              embeddings</strong
            >
            <span class="alert-hint">Run global embeddings</span>
          </div>
        </div>
      </div>

      <!-- ═══ Two-column layout: Recent Processes + Monthly Trend ═══ -->
      <div class="two-col">
        <!-- Recent Processes -->
        <div class="card">
          <div class="card-title-row">
            <h3 class="card-title">Recent Processes</h3>
            <button class="link-btn" @click="goTo('admin-processes')">
              View all →
            </button>
          </div>
          <div v-if="data.recentProcesses.length === 0" class="no-data">
            No processes yet
          </div>
          <div v-else class="process-list">
            <div
              v-for="p in data.recentProcesses"
              :key="p.id"
              class="process-row"
            >
              <div class="process-info">
                <span class="process-user">{{ p.userName || "—" }}</span>
                <span class="process-date">{{ formatDate(p.createdAt) }}</span>
              </div>
              <div class="process-status">
                <span
                  class="stage-tag"
                  :class="'stage-' + stageType(p.currentStage)"
                >
                  {{ formatStage(p.currentStage) }}
                </span>
              </div>
              <div class="process-stats">
                <span class="process-photos"
                  >{{ p.photosCompleted }}/{{ p.photosTotal }}</span
                >
                <span v-if="p.totalCostEur > 0" class="process-cost"
                  >€{{ fmt(p.totalCostEur) }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Monthly Cost Trend -->
        <div class="card">
          <div class="card-title-row">
            <h3 class="card-title">Cost Trend (6 months)</h3>
            <button class="link-btn" @click="goTo('admin-costs')">
              Details →
            </button>
          </div>
          <div class="chart-area">
            <div class="bar-chart">
              <div
                v-for="m in data.monthlyTrend"
                :key="m.month"
                class="bar-col"
                @mouseenter="hoveredMonth = m"
                @mouseleave="hoveredMonth = null"
              >
                <div class="bar-tooltip" v-if="hoveredMonth === m">
                  <strong>{{ formatMonthLabel(m.month) }}</strong
                  ><br />
                  €{{ fmt(m.costEur) }}
                </div>
                <div
                  class="bar-fill"
                  :style="{ height: barHeight(m.costEur) + '%' }"
                  :class="{ 'bar-current': m.month === currentMonthKey }"
                ></div>
                <span class="bar-label">{{ shortMonth(m.month) }}</span>
              </div>
            </div>
          </div>
          <div class="chart-summary">
            <span
              >LLM calls:
              <strong>{{
                data.costs.totalCalls.toLocaleString()
              }}</strong></span
            >
          </div>
        </div>
      </div>

      <!-- ═══ Quick Links ═══ -->
      <div class="quick-links">
        <button class="quick-link" @click="goTo('admin-processes')">
          <span class="ql-icon">⚡</span>
          <span class="ql-label">Processes</span>
        </button>
        <button class="quick-link" @click="goTo('admin-users')">
          <span class="ql-icon">👥</span>
          <span class="ql-label">Users</span>
        </button>
        <button class="quick-link" @click="goTo('admin-costs')">
          <span class="ql-icon">💰</span>
          <span class="ql-label">Costs</span>
        </button>
        <button class="quick-link" @click="goTo('admin-payments')">
          <span class="ql-icon">€</span>
          <span class="ql-label">Payments</span>
        </button>
        <button class="quick-link" @click="goTo('admin-health')">
          <span class="ql-icon">🩺</span>
          <span class="ql-label">Health</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { NSpin, useMessage } from "naive-ui";
import { api } from "../../utils/axios";

interface DashboardData {
  users: { total: number; active: number; recentSignups: number };
  photos: { total: number };
  processes: { total: number; active: number; failed: number };
  health: {
    globalScore: number;
    missingEmbeddings: number;
    missingDescriptions: number;
    missingColorHistogram: number;
    tagsWithoutEmbedding: number;
    chunksWithoutEmbedding: number;
  };
  costs: {
    totalCostEur: number;
    thisMonthCostEur: number;
    lastMonthCostEur: number;
    monthOverMonthPct: number | null;
    totalCalls: number;
  };
  recentProcesses: {
    id: string;
    userName: string | null;
    currentStage: string | null;
    photosTotal: number;
    photosCompleted: number;
    totalCostEur: number;
    createdAt: string;
  }[];
  monthlyTrend: { month: string; costEur: number }[];
}

const router = useRouter();
const message = useMessage();
const loading = ref(false);
const data = ref<DashboardData | null>(null);
const hoveredMonth = ref<{ month: string; costEur: number } | null>(null);

const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const hasAlerts = computed(() => {
  if (!data.value) return false;
  const d = data.value;
  return (
    d.processes.failed > 0 ||
    d.health.missingEmbeddings > 0 ||
    d.health.missingDescriptions > 0 ||
    d.health.tagsWithoutEmbedding > 0 ||
    d.health.chunksWithoutEmbedding > 0
  );
});

const maxMonthlyCost = computed(() => {
  if (!data.value) return 1;
  return Math.max(...data.value.monthlyTrend.map((m) => m.costEur), 0.001);
});

function fmt(n: number): string {
  return n.toFixed(4);
}

function scoreClass(score: number): string {
  if (score >= 95) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

function barHeight(cost: number): number {
  return Math.max((cost / maxMonthlyCost.value) * 100, 2);
}

function shortMonth(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STAGE_LABELS: Record<string, string> = {
  init: "Init",
  vision_tasks: "Vision",
  clip_embeddings: "CLIP",
  vision_context_story_accents: "Vision",
  tags_context_story: "Tags",
  tags_visual_accents: "Visual Tags",
  chunks_context_story_visual_accents: "Chunks",
  visual_color_embedding_task: "Colors",
  finished: "Finished",
  failed: "Failed",
};

function formatStage(stage: string | null): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage] || stage.replace(/_/g, " ");
}

function stageType(stage: string | null): string {
  if (!stage) return "default";
  if (stage === "finished") return "success";
  if (stage === "failed") return "error";
  if (stage === "init") return "warning";
  return "active";
}

function goTo(name: string) {
  router.push({ name });
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await api.get("/api/admin/dashboard");
    data.value = res.data;
  } catch {
    message.error("Failed to load dashboard data");
  } finally {
    loading.value = false;
  }
}

onMounted(() => fetchData());
</script>

<style scoped>
.admin-section {
  max-width: 1200px;
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

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}

/* ═══ KPI Grid ═══ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.kpi-card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.kpi-card.clickable {
  cursor: pointer;
}

.kpi-card.clickable:hover {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.kpi-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.kpi-value.primary {
  color: #6366f1;
}

.kpi-sub {
  font-size: 12px;
  color: #64748b;
}

.kpi-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
  width: fit-content;
}

.badge-up {
  background: #fef2f2;
  color: #ef4444;
}

.badge-down {
  background: #f0fdf4;
  color: #22c55e;
}

.badge-new {
  background: #eff6ff;
  color: #3b82f6;
}

.kpi-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mini-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
}

.tag-active {
  background: #eff6ff;
  color: #3b82f6;
}

.tag-failed {
  background: #fef2f2;
  color: #ef4444;
}

/* ═══ Score Colors ═══ */
.score-good {
  color: #22c55e !important;
}

.score-warn {
  color: #f59e0b !important;
}

.score-bad {
  color: #ef4444 !important;
}

/* ═══ Alerts ═══ */
.alerts-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.alert-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.alert-card:hover {
  opacity: 0.85;
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.alert-warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.alert-info {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.alert-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.alert-error .alert-icon {
  background: #ef4444;
  color: #fff;
}

.alert-warn .alert-icon {
  background: #f59e0b;
  color: #fff;
}

.alert-info .alert-icon {
  background: #3b82f6;
  color: #fff;
}

.alert-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.alert-content strong {
  font-size: 13px;
  color: #1e293b;
}

.alert-hint {
  font-size: 11px;
  color: #94a3b8;
}

/* ═══ Cards ═══ */
.card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.link-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

/* ═══ Two column layout ═══ */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* ═══ Process List ═══ */
.process-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.process-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f8fafc;
}

.process-row:last-child {
  border-bottom: none;
}

.process-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.process-user {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-date {
  font-size: 11px;
  color: #94a3b8;
}

.process-status {
  flex-shrink: 0;
}

.stage-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}

.stage-success {
  background: #f0fdf4;
  color: #22c55e;
}

.stage-error {
  background: #fef2f2;
  color: #ef4444;
}

.stage-warning {
  background: #fffbeb;
  color: #f59e0b;
}

.stage-active {
  background: #eff6ff;
  color: #3b82f6;
}

.stage-default {
  background: #f8fafc;
  color: #94a3b8;
}

.process-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.process-photos {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.process-cost {
  font-size: 11px;
  color: #6366f1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ═══ Bar Chart ═══ */
.chart-area {
  padding: 0 4px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 140px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  position: relative;
  cursor: default;
}

.bar-fill {
  width: 100%;
  max-width: 48px;
  background: #c7d2fe;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
  min-height: 3px;
}

.bar-fill.bar-current {
  background: #6366f1;
}

.bar-col:hover .bar-fill {
  opacity: 0.85;
}

.bar-label {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 6px;
  font-weight: 500;
}

.bar-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  background: #1e293b;
  color: #fff;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  line-height: 1.5;
}

.chart-summary {
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.chart-summary strong {
  color: #334155;
}

/* ═══ Quick Links ═══ */
.quick-links {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-top: 4px;
}

.quick-link {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.quick-link:hover {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.ql-icon {
  font-size: 20px;
}

.ql-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

/* ═══ Responsive ═══ */
@media (max-width: 768px) {
  .admin-section {
    padding: 0 8px;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .two-col {
    grid-template-columns: 1fr;
  }

  .quick-links {
    grid-template-columns: repeat(3, 1fr);
  }

  .card {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .section-header h1 {
    font-size: 18px;
  }

  .quick-links {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
