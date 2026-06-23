<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Costs</h1>
      <p>Track LLM API costs and usage breakdown</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <n-spin :size="48" />
    </div>

    <template v-else-if="data">
      <!-- ═══ KPI Cards ═══ -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Total Cost</span>
          <span class="kpi-value primary"
            >€{{ fmt(data.totals.totalCostEur) }}</span
          >
        </div>
        <div class="kpi-card">
          <span class="kpi-label">This Month</span>
          <span class="kpi-value"
            >€{{ fmt(data.totals.thisMonthCostEur) }}</span
          >
          <span
            v-if="data.totals.monthOverMonthPct !== null"
            class="kpi-badge"
            :class="
              data.totals.monthOverMonthPct >= 0 ? 'badge-up' : 'badge-down'
            "
          >
            {{ data.totals.monthOverMonthPct >= 0 ? "▲" : "▼" }}
            {{ Math.abs(data.totals.monthOverMonthPct).toFixed(1) }}%
          </span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Last Month</span>
          <span class="kpi-value"
            >€{{ fmt(data.totals.lastMonthCostEur) }}</span
          >
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total LLM Calls</span>
          <span class="kpi-value">{{
            data.totals.totalCalls.toLocaleString()
          }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Avg / Call</span>
          <span class="kpi-value">€{{ fmt(data.totals.avgCostPerCall) }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Users</span>
          <span class="kpi-value">{{ data.totals.totalUsers }}</span>
        </div>
      </div>

      <!-- ═══ Date range filter bar ═══ -->
      <div class="filter-bar">
        <span class="filter-label">Date range</span>
        <n-date-picker
          v-model:value="dateRange"
          type="daterange"
          clearable
          size="small"
          @update:value="onDateRangeChange"
        />
      </div>

      <!-- ═══ Monthly Chart ═══ -->
      <div class="card">
        <h3 class="card-title">Monthly Cost Trend</h3>
        <div class="chart-area">
          <div class="bar-chart">
            <div
              v-for="m in data.monthly"
              :key="m.month"
              class="bar-col"
              @mouseenter="hoveredMonth = m"
              @mouseleave="hoveredMonth = null"
              @click="selectMonth(m.month)"
            >
              <div class="bar-tooltip" v-if="hoveredMonth === m">
                <strong>{{ formatMonthLabel(m.month) }}</strong
                ><br />
                €{{ fmt(m.costEur) }} · {{ m.calls }} calls
              </div>
              <div
                class="bar-fill"
                :style="{ height: barHeight(m.costEur) + '%' }"
                :class="{
                  'bar-current': m.month === currentMonthKey,
                  'bar-selected': activeMonthKey === m.month,
                  'bar-dimmed':
                    activeMonthKey !== null && activeMonthKey !== m.month,
                }"
              ></div>
              <span class="bar-label">{{ shortMonth(m.month) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Month filter badge ═══ -->
      <div v-if="dateRange" class="month-filter-badge">
        <span
          >Showing breakdown for: <strong>{{ formatDateRange() }}</strong></span
        >
        <button class="clear-filter-btn" @click="clearFilter">
          ✕ Clear filter
        </button>
      </div>

      <!-- ═══ Category + Model side-by-side ═══ -->
      <div class="two-col">
        <!-- Category Breakdown -->
        <div class="card">
          <h3 class="card-title">Cost by Category</h3>
          <div v-if="data.byCategory.length === 0" class="no-data">
            No data yet
          </div>
          <div v-else class="breakdown-list">
            <div
              v-for="c in data.byCategory"
              :key="c.category"
              class="breakdown-row"
            >
              <div class="breakdown-info">
                <span class="breakdown-name">
                  <span
                    class="cat-dot"
                    :style="{ background: catColor(c.category) }"
                  ></span>
                  {{ formatCategoryName(c.category) }}
                </span>
                <span class="breakdown-pct">{{ c.pct.toFixed(1) }}%</span>
              </div>
              <div class="breakdown-bar-bg">
                <div
                  class="breakdown-bar-fill"
                  :style="{
                    width: c.pct + '%',
                    background: catColor(c.category),
                  }"
                ></div>
              </div>
              <div class="breakdown-meta">
                <span>€{{ fmt(c.costEur) }}</span>
                <span class="dim">{{ c.calls }} calls</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Model Breakdown -->
        <div class="card">
          <h3 class="card-title">Cost by Model</h3>
          <div v-if="data.byModel.length === 0" class="no-data">
            No data yet
          </div>
          <div v-else class="breakdown-list">
            <div v-for="m in data.byModel" :key="m.model" class="breakdown-row">
              <div class="breakdown-info">
                <span class="breakdown-name">{{ m.model }}</span>
              </div>
              <div class="breakdown-meta">
                <span class="cost-value">€{{ fmt(m.costEur) }}</span>
                <span class="dim">{{ m.calls }} calls</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Transaction Log ═══ -->
      <div class="card">
        <h3 class="card-title">Transaction Log</h3>

        <!-- Filters row -->
        <div class="txn-filters">
          <select
            v-model="txnCategory"
            class="txn-select"
            @change="fetchTransactions(1)"
          >
            <option value="">All categories</option>
            <option value="photo_analysis">Photo Analysis</option>
            <option value="chat">Chat</option>
            <option value="report_review">Report Review</option>
            <option value="search">Search</option>
            <option value="portfolio_build">Portfolio Build</option>
            <option value="location_inference">Location Inference</option>
            <option value="other">Other</option>
          </select>
          <label class="txn-toggle">
            <input
              type="checkbox"
              v-model="txnOnlyCharged"
              @change="fetchTransactions(1)"
            />
            <span>Credits only</span>
          </label>
          <input
            type="date"
            v-model="txnDateFrom"
            class="date-input"
            placeholder="From"
            @change="fetchTransactions(1)"
          />
          <input
            type="date"
            v-model="txnDateTo"
            class="date-input"
            placeholder="To"
            @change="fetchTransactions(1)"
          />
          <button
            v-if="txnCategory || txnOnlyCharged || txnDateFrom || txnDateTo"
            class="clear-filter-btn"
            @click="clearTxnFilters"
          >
            ✕ Clear
          </button>
        </div>

        <!-- Summary bar -->
        <div v-if="txnSummary" class="txn-summary-bar">
          <span class="txn-kpi"
            ><span class="txn-kpi-label">Rows</span
            ><span class="txn-kpi-value">{{
              txnSummary.totalRows.toLocaleString()
            }}</span></span
          >
          <span class="txn-kpi"
            ><span class="txn-kpi-label">Total raw cost</span
            ><span class="txn-kpi-value cost-value"
              >€{{ fmt(txnSummary.totalCostEur) }}</span
            ></span
          >
          <span class="txn-kpi"
            ><span class="txn-kpi-label">Total credits</span
            ><span class="txn-kpi-value credit-value"
              >{{ txnSummary.totalCreditsCharged.toLocaleString() }} cr</span
            ></span
          >
        </div>

        <div v-if="txnLoading" class="txn-loading">
          <n-spin :size="28" />
        </div>
        <div v-else-if="txnRows.length === 0" class="no-data">
          No transactions found
        </div>
        <div v-else class="txn-table-wrap">
          <table class="txn-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Category</th>
                <th>Task</th>
                <th>Model</th>
                <th>Calls</th>
                <th>Raw cost</th>
                <th>Credits</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in txnRows" :key="row.id">
                <td class="dim nowrap">{{ fmtDate(row.createdAt) }}</td>
                <td>
                  <router-link
                    :to="`/admin/users/${row.userId}`"
                    class="user-link"
                  >
                    {{ row.userName }}
                    <span class="dim" style="font-size: 11px">{{
                      row.userEmail
                    }}</span>
                  </router-link>
                </td>
                <td>
                  <span
                    class="cat-badge"
                    :style="{
                      background: catColor(row.category) + '22',
                      color: catColor(row.category),
                    }"
                  >
                    {{ formatCategoryName(row.category) }}
                  </span>
                </td>
                <td class="dim">
                  {{ row.task ? formatTaskName(row.task) : "—" }}
                </td>
                <td class="dim nowrap">{{ row.model ?? "—" }}</td>
                <td class="dim">{{ row.calls }}</td>
                <td class="cost-value">€{{ fmt(row.costInEur) }}</td>
                <td>
                  <span
                    v-if="row.isFree"
                    class="free-badge"
                    :title="
                      row.creditsWaived != null
                        ? `Waived ${row.creditsWaived} cr (charged to company, not user)`
                        : 'Free daily usage'
                    "
                    >FREE</span
                  >
                  <span
                    v-else-if="row.creditsCharged !== null"
                    class="credit-badge"
                    >{{ row.creditsCharged }} cr</span
                  >
                  <span v-else class="dim">—</span>
                </td>
                <td class="dim">
                  <span v-if="row.isFree">—</span>
                  <span v-else-if="row.marginMultiplier !== null"
                    >×{{ row.marginMultiplier.toFixed(2) }}</span
                  >
                  <span v-else-if="row.creditsCharged !== null">fixed</span>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="txnMeta && txnMeta.lastPage > 1" class="txn-pagination">
          <button
            class="page-btn"
            :disabled="txnMeta.currentPage <= 1"
            @click="fetchTransactions(txnMeta.currentPage - 1)"
          >
            ‹
          </button>
          <span class="page-info"
            >Page {{ txnMeta.currentPage }} / {{ txnMeta.lastPage }}</span
          >
          <button
            class="page-btn"
            :disabled="txnMeta.currentPage >= txnMeta.lastPage"
            @click="fetchTransactions(txnMeta.currentPage + 1)"
          >
            ›
          </button>
        </div>
      </div>
      <!-- ═══ Task Breakdown ═══ -->
      <div class="card">
        <h3 class="card-title">Cost by Task</h3>
        <div v-if="data.byTask.length === 0" class="no-data">No data yet</div>
        <div v-else class="task-table">
          <div class="task-header">
            <span>Task</span>
            <span>Cost</span>
            <span>Calls</span>
            <span>Avg / Call</span>
          </div>
          <div v-for="t in data.byTask" :key="t.task" class="task-row">
            <span class="task-name">{{ formatTaskName(t.task) }}</span>
            <span class="cost-value">€{{ fmt(t.costEur) }}</span>
            <span>{{ t.calls }}</span>
            <span class="dim"
              >€{{ t.calls > 0 ? fmt(t.costEur / t.calls) : "0" }}</span
            >
          </div>
        </div>
      </div>
      <!-- ═══ Top Users ═══ -->
      <div class="card">
        <h3 class="card-title">Top Users by Cost</h3>
        <div v-if="data.topUsers.length === 0" class="no-data">No data yet</div>
        <div v-else class="task-table">
          <div class="task-header">
            <span>User</span>
            <span>Total Cost</span>
            <span>This Month</span>
            <span>Top Category</span>
          </div>
          <div v-for="u in data.topUsers" :key="u.id" class="task-row">
            <span class="task-name">
              {{ u.name }}
              <span class="dim" style="margin-left: 6px; font-weight: 400">{{
                u.email
              }}</span>
            </span>
            <span class="cost-value">€{{ fmt(u.totalCostEur) }}</span>
            <span>€{{ fmt(u.thisMonthCostEur) }}</span>
            <span>{{ topCategory(u.byCategory) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { NDatePicker, NSpin, useMessage } from "naive-ui";
import { useRouter } from "vue-router";
import { api } from "../../utils/axios";

interface CostsData {
  totals: {
    totalCostEur: number;
    thisMonthCostEur: number;
    lastMonthCostEur: number;
    monthOverMonthPct: number | null;
    totalCalls: number;
    avgCostPerCall: number;
    totalUsers: number;
  };
  monthly: {
    month: string;
    costEur: number;
    calls: number;
    byCategory: Record<string, number>;
  }[];
  byCategory: {
    category: string;
    costEur: number;
    calls: number;
    pct: number;
  }[];
  byModel: { model: string; costEur: number; calls: number }[];
  byTask: { task: string; costEur: number; calls: number }[];
  topUsers: {
    id: number;
    name: string;
    email: string;
    totalCostEur: number;
    thisMonthCostEur: number;
    byCategory: Record<string, { costInEur: number; calls: number }>;
  }[];
}

const message = useMessage();
const router = useRouter();
const loading = ref(false);
const data = ref<CostsData | null>(null);
const hoveredMonth = ref<CostsData["monthly"][0] | null>(null);
const dateRange = ref<[number, number] | null>(null);
const activeMonthKey = ref<string | null>(null);

const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const maxMonthlyCost = computed(() => {
  if (!data.value) return 1;
  return Math.max(...data.value.monthly.map((m) => m.costEur), 0.001);
});

function fmt(n: number): string {
  return n.toFixed(4);
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

const CATEGORY_COLORS: Record<string, string> = {
  photo_analysis: "#6366f1",
  chat: "#06b6d4",
  search: "#f59e0b",
  portfolio_review: "#10b981",
  other: "#94a3b8",
};

function catColor(cat: string): string {
  return CATEGORY_COLORS[cat] || "#94a3b8";
}

function formatCategoryName(cat: string): string {
  const names: Record<string, string> = {
    photo_analysis: "Photo Analysis",
    chat: "Chat",
    search: "Search",
    portfolio_review: "Portfolio Review",
    other: "Other",
  };
  return names[cat] || cat;
}

function formatTaskName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function topCategory(
  byCategory: Record<string, { costInEur: number; calls: number }>,
): string {
  if (!byCategory) return "—";
  const entries = Object.entries(byCategory);
  if (entries.length === 0) return "—";
  const top = entries.sort((a, b) => b[1].costInEur - a[1].costInEur)[0];
  return formatCategoryName(top[0]);
}

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateRange(): string {
  if (!dateRange.value) return "";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const from = new Date(dateRange.value[0]).toLocaleDateString("en-US", opts);
  const to = new Date(dateRange.value[1]).toLocaleDateString("en-US", opts);
  return `${from} – ${to}`;
}

async function fetchData() {
  if (!data.value) loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (dateRange.value) {
      params.dateFrom = toDateStr(dateRange.value[0]);
      params.dateTo = toDateStr(dateRange.value[1]);
    }
    const res = await api.get("/api/admin/costs/overview", { params });
    data.value = res.data;
  } catch {
    message.error("Failed to load costs data");
  } finally {
    loading.value = false;
  }
}

function selectMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  if (activeMonthKey.value === monthKey) {
    activeMonthKey.value = null;
    dateRange.value = null;
  } else {
    activeMonthKey.value = monthKey;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0); // last day of month
    dateRange.value = [start.getTime(), end.getTime()];
  }
  fetchData();
}

function onDateRangeChange(_val: [number, number] | null) {
  activeMonthKey.value = null;
  fetchData();
}

function clearFilter() {
  dateRange.value = null;
  activeMonthKey.value = null;
  fetchData();
}

// ─── Transaction log ───────────────────────────────────────────────────────

interface TxnRow {
  id: number;
  createdAt: string;
  userId: number;
  userName: string;
  userEmail: string;
  category: string;
  task: string | null;
  model: string | null;
  calls: number;
  costInEur: number;
  creditsCharged: number | null;
  marginMultiplier: number | null;
  referenceId: string | null;
  isFree: boolean;
  creditsWaived: number | null;
}

const txnRows = ref<TxnRow[]>([]);
const txnLoading = ref(false);
const txnCategory = ref("");
const txnOnlyCharged = ref(false);
const txnDateFrom = ref("");
const txnDateTo = ref("");
const txnMeta = ref<{
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
} | null>(null);
const txnSummary = ref<{
  totalCostEur: number;
  totalCreditsCharged: number;
  totalRows: number;
} | null>(null);

async function fetchTransactions(page = 1) {
  txnLoading.value = true;
  try {
    const params: Record<string, string> = { page: String(page), limit: "50" };
    if (txnCategory.value) params.category = txnCategory.value;
    if (txnOnlyCharged.value) params.onlyCharged = "true";
    if (txnDateFrom.value) params.dateFrom = txnDateFrom.value;
    if (txnDateTo.value) params.dateTo = txnDateTo.value;
    const res = await api.get("/api/admin/costs/transactions", { params });
    txnRows.value = res.data.rows;
    txnMeta.value = res.data.meta;
    txnSummary.value = res.data.summary;
  } catch {
    message.error("Failed to load transactions");
  } finally {
    txnLoading.value = false;
  }
}

function clearTxnFilters() {
  txnCategory.value = "";
  txnOnlyCharged.value = false;
  txnDateFrom.value = "";
  txnDateTo.value = "";
  fetchTransactions(1);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

onMounted(() => {
  fetchData();
  fetchTransactions(1);
});
</script>

<style scoped>
.admin-section {
  /* max-width: 1200px; */
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

/* ═══ Cards ═══ */
.card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
}

.card-title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

/* ═══ Filter bar ═══ */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

/* ═══ Bar Chart ═══ */
.chart-area {
  padding: 0 4px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 180px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  position: relative;
  cursor: pointer;
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

.bar-fill.bar-selected {
  background: #4f46e5;
  box-shadow: 0 0 0 2px #c7d2fe;
}

.bar-fill.bar-dimmed {
  opacity: 0.35;
}

.bar-col:hover .bar-fill {
  opacity: 0.85;
}

/* ═══ Month filter badge ═══ */
.month-filter-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  padding: 8px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #4338ca;
}

.month-filter-badge strong {
  color: #3730a3;
}

.clear-filter-btn {
  background: none;
  border: 1px solid #a5b4fc;
  border-radius: 6px;
  color: #6366f1;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.clear-filter-btn:hover {
  background: #e0e7ff;
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

/* ═══ Two column layout ═══ */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* ═══ Category / Model breakdowns ═══ */
.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.breakdown-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breakdown-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.breakdown-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.breakdown-pct {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.breakdown-bar-bg {
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
}

.breakdown-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.breakdown-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #334155;
}

/* ═══ Task / User Table ═══ */
.task-table {
  overflow-x: auto;
}

.task-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 0 0 8px;
  border-bottom: 1px solid #e2e8f0;
}

.task-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 8px;
  font-size: 13px;
  color: #334155;
  padding: 8px 0;
  border-bottom: 1px solid #f8fafc;
  align-items: center;
}

.task-row:last-child {
  border-bottom: none;
}

.task-name {
  font-weight: 600;
  word-break: break-word;
}

.cost-value {
  font-weight: 700;
  color: #6366f1;
  font-variant-numeric: tabular-nums;
}

.dim {
  color: #94a3b8;
  font-size: 12px;
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

  .task-header,
  .task-row {
    grid-template-columns: 1.5fr 1fr 0.7fr 1fr;
    font-size: 12px;
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
}

/* ═══ Transaction Log ═══ */
.txn-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.txn-select {
  padding: 5px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  background: #fff;
  cursor: pointer;
  outline: none;
}

.txn-select:focus {
  border-color: #a5b4fc;
}

.txn-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  user-select: none;
}

.date-input {
  padding: 5px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  background: #fff;
  outline: none;
}

.date-input:focus {
  border-color: #a5b4fc;
}

.txn-summary-bar {
  display: flex;
  gap: 24px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.txn-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.txn-kpi-label {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.txn-kpi-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.credit-value {
  color: #06b6d4;
}

.txn-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.txn-table-wrap {
  overflow-x: auto;
}

.txn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.txn-table th {
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 0 10px 8px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.txn-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f8fafc;
  vertical-align: middle;
  color: #334155;
}

.txn-table tr:last-child td {
  border-bottom: none;
}

.txn-table tr:hover td {
  background: #f8fafc;
}

.user-link {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-weight: 600;
  color: #4f46e5;
  text-decoration: none;
  font-size: 13px;
}

.user-link:hover {
  text-decoration: underline;
}

.cat-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.credit-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  background: #ecfeff;
  color: #0891b2;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.free-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f0fdf4;
  color: #16a34a;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  cursor: help;
}

.nowrap {
  white-space: nowrap;
}

.txn-pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  justify-content: center;
}

.page-btn {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 16px;
  cursor: pointer;
  color: #475569;
  transition: background 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: #f1f5f9;
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.page-info {
  font-size: 13px;
  color: #64748b;
}
</style>
