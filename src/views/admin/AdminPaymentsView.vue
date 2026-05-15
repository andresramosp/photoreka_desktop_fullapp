<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Payments</h1>
      <p>Review transactions, revenue, refunds and user purchases</p>
    </div>

    <div v-if="overviewLoading && !overview" class="loading-state">
      <n-spin size="medium" />
    </div>

    <template v-else-if="overview">
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Net Revenue</span>
          <span class="kpi-value primary"
            >€{{ money(overview.totals.netRevenueEur) }}</span
          >
        </div>

        <div class="kpi-card">
          <span class="kpi-label">This Month</span>
          <span class="kpi-value"
            >€{{ money(overview.totals.thisMonthRevenueEur) }}</span
          >
          <span
            v-if="overview.totals.monthOverMonthPct !== null"
            class="kpi-badge"
            :class="
              overview.totals.monthOverMonthPct >= 0
                ? 'badge-up'
                : 'badge-down'
            "
          >
            {{ overview.totals.monthOverMonthPct >= 0 ? "▲" : "▼" }}
            {{ Math.abs(overview.totals.monthOverMonthPct).toFixed(1) }}%
          </span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Transactions</span>
          <span class="kpi-value">{{ overview.totals.totalPayments }}</span>
          <span class="kpi-sub"
            >{{ overview.totals.completedPayments }} completed</span
          >
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Pending</span>
          <span class="kpi-value">{{ overview.totals.pendingPayments }}</span>
          <span class="kpi-sub">€{{ money(overview.totals.pendingEur) }}</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Refunded</span>
          <span class="kpi-value warn"
            >€{{ money(overview.totals.refundedEur) }}</span
          >
          <span class="kpi-sub"
            >{{ overview.totals.refundedPayments }} transaction{{
              overview.totals.refundedPayments !== 1 ? "s" : ""
            }}</span
          >
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Paying Users</span>
          <span class="kpi-value">{{ overview.totals.payingUsers }}</span>
          <span class="kpi-sub"
            >Avg €{{ money(overview.totals.avgOrderEur) }}</span
          >
        </div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <h3 class="card-title">Monthly Revenue</h3>
          <n-button
            size="tiny"
            quaternary
            :loading="overviewLoading"
            title="Refresh overview"
            @click="fetchOverview"
          >
            <template #icon>
              <n-icon size="14"><RefreshIcon /></n-icon>
            </template>
          </n-button>
        </div>
        <div class="chart-area">
          <div class="bar-chart">
            <div
              v-for="m in overview.monthly"
              :key="m.month"
              class="bar-col"
              @mouseenter="hoveredMonth = m"
              @mouseleave="hoveredMonth = null"
            >
              <div v-if="hoveredMonth === m" class="bar-tooltip">
                <strong>{{ formatMonthLabel(m.month) }}</strong
                ><br />
                €{{ money(m.revenueEur) }} · {{ m.count }} tx
              </div>
              <div
                class="bar-fill"
                :class="{ 'bar-current': m.month === currentMonthKey }"
                :style="{ height: barHeight(m.revenueEur) + '%' }"
              ></div>
              <span class="bar-label">{{ shortMonth(m.month) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <h3 class="card-title">Status Breakdown</h3>
          <div class="breakdown-list">
            <div
              v-for="item in overview.byStatus"
              :key="item.status"
              class="breakdown-row"
            >
              <div class="breakdown-info">
                <span class="breakdown-name">
                  <span
                    class="status-dot"
                    :style="{ background: statusColor(item.status) }"
                  ></span>
                  {{ statusLabel(item.status) }}
                </span>
                <n-tag size="tiny" :type="statusTagType(item.status)">
                  {{ item.count }}
                </n-tag>
              </div>
              <div class="breakdown-meta">
                <span>€{{ money(item.amountEur) }}</span>
                <span class="dim">{{ statusHint(item.status) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Package Types</h3>
          <div class="breakdown-list">
            <div
              v-for="item in overview.byType"
              :key="item.type"
              class="breakdown-row"
            >
              <div class="breakdown-info">
                <span class="breakdown-name">{{ typeLabel(item.type) }}</span>
                <span class="cost-value">€{{ money(item.revenueEur) }}</span>
              </div>
              <div class="breakdown-meta">
                <span>{{ item.count }} transaction{{ item.count !== 1 ? "s" : "" }}</span>
                <span class="dim">{{ grantSummary(item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Top Users by Revenue</h3>
        <div v-if="overview.topUsers.length === 0" class="no-data">
          No payment data yet
        </div>
        <div v-else class="user-table">
          <div class="user-header">
            <span>User</span>
            <span>Revenue</span>
            <span>Refunded</span>
            <span>Transactions</span>
            <span>Last Payment</span>
          </div>
          <button
            v-for="user in overview.topUsers"
            :key="user.id"
            class="user-row"
            @click="filterByUser(user.id)"
          >
            <span class="user-main">
              <span class="user-name">{{ user.name }}</span>
              <span class="dim">{{ user.email }}</span>
            </span>
            <span class="cost-value">€{{ money(user.revenueEur) }}</span>
            <span>€{{ money(user.refundedEur) }}</span>
            <span>{{ user.paymentCount }}</span>
            <span class="dim">{{ formatDate(user.lastPaymentAt) }}</span>
          </button>
        </div>
      </div>

      <div class="transactions-section">
        <div class="transactions-header">
          <h2>Transaction History</h2>
          <div class="transactions-actions">
            <n-tag
              v-if="userIdFilter"
              size="small"
              type="info"
              closable
              @close="clearUserFilter"
            >
              User #{{ userIdFilter }}
            </n-tag>
            <n-tag :bordered="false" size="small" type="info">
              {{ paymentMeta?.total || 0 }} transaction{{
                (paymentMeta?.total || 0) !== 1 ? "s" : ""
              }}
            </n-tag>
          </div>
        </div>

        <div class="filters-bar">
          <n-input
            v-model:value="searchQuery"
            placeholder="Search user, product or Stripe ID..."
            clearable
            size="small"
            style="max-width: 320px"
            @update:value="debouncedFetchPayments"
          >
            <template #prefix>
              <n-icon size="16"><SearchIcon /></n-icon>
            </template>
          </n-input>

          <n-select
            v-model:value="statusFilter"
            placeholder="Status"
            clearable
            size="small"
            style="width: 140px"
            :options="statusOptions"
            @update:value="fetchPayments(1)"
          />

          <n-select
            v-model:value="typeFilter"
            placeholder="Type"
            clearable
            size="small"
            style="width: 160px"
            :options="typeOptions"
            @update:value="fetchPayments(1)"
          />

          <div class="filters-spacer" />

          <n-button
            size="small"
            quaternary
            :loading="paymentsLoading"
            title="Refresh transactions"
            @click="fetchPayments(paymentPage)"
          >
            <template #icon>
              <n-icon size="15"><RefreshIcon /></n-icon>
            </template>
            Refresh
          </n-button>
        </div>

        <div class="table-wrapper">
          <div class="table-body">
            <div v-if="paymentsLoading && payments.length === 0" class="table-loading-state">
              <n-spin show />
            </div>
            <n-data-table
              v-else
              :columns="columns"
              :data="payments"
              :row-key="(row: PaymentRow) => row.id"
              :bordered="false"
              size="small"
              :max-height="430"
              striped
            />
          </div>
          <div v-if="paymentMeta && paymentMeta.lastPage > 1" class="table-pagination">
            <n-pagination
              v-model:page="paymentPage"
              :page-size="paymentMeta.perPage"
              :item-count="paymentMeta.total"
              size="small"
              @update:page="fetchPayments"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NDataTable,
  NIcon,
  NInput,
  NPagination,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from "naive-ui";
import type { DataTableColumn } from "naive-ui";
import {
  CopyOutline as CopyIcon,
  OpenOutline as OpenIcon,
  RefreshOutline as RefreshIcon,
  SearchOutline as SearchIcon,
} from "@vicons/ionicons5";
import { api } from "../../utils/axios";

interface PaymentsOverview {
  totals: {
    totalPayments: number;
    completedPayments: number;
    pendingPayments: number;
    failedPayments: number;
    refundedPayments: number;
    payingUsers: number;
    netRevenueEur: number;
    refundedEur: number;
    pendingEur: number;
    thisMonthRevenueEur: number;
    lastMonthRevenueEur: number;
    monthOverMonthPct: number | null;
    avgOrderEur: number;
    photosGranted: number;
    analyzedPhotosGranted: number;
    creditsGranted: number;
  };
  monthly: {
    month: string;
    revenueEur: number;
    refundedEur: number;
    count: number;
    byType: Record<string, number>;
  }[];
  byStatus: { status: PaymentStatus; count: number; amountEur: number }[];
  byType: PaymentTypeBreakdown[];
  topUsers: {
    id: number;
    name: string;
    email: string;
    paymentCount: number;
    revenueEur: number;
    refundedEur: number;
    lastPaymentAt: string | null;
  }[];
}

type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
type PaymentType = "photo_package" | "credits";

interface PaymentTypeBreakdown {
  type: PaymentType;
  count: number;
  revenueEur: number;
  photosGranted: number;
  analyzedPhotosGranted: number;
  creditsGranted: number;
}

interface PaymentRow {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  type: PaymentType;
  packageId: string;
  productName: string | null;
  photosGranted: number;
  analyzedPhotosGranted: number;
  creditsGranted: number;
  amountEur: number;
  status: PaymentStatus;
  createdAt: string | null;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();

const overview = ref<PaymentsOverview | null>(null);
const overviewLoading = ref(false);
const hoveredMonth = ref<PaymentsOverview["monthly"][0] | null>(null);

const payments = ref<PaymentRow[]>([]);
const paymentsLoading = ref(false);
const paymentPage = ref(1);
const paymentMeta = ref<{
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
} | null>(null);

const searchQuery = ref("");
const statusFilter = ref<PaymentStatus | null>(null);
const typeFilter = ref<PaymentType | null>(null);
const userIdFilter = ref<string | null>(routeQueryString("userId"));

const statusOptions = [
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
];

const typeOptions = [
  { label: "Photo Package", value: "photo_package" },
  { label: "Credits", value: "credits" },
];

const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const maxMonthlyRevenue = computed(() => {
  if (!overview.value) return 1;
  return Math.max(...overview.value.monthly.map((m) => m.revenueEur), 0.01);
});

let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedFetchPayments() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchPayments(1), 300);
}

function routeQueryString(key: string): string | null {
  const value = route.query[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function money(value: number): string {
  return Number(value || 0).toFixed(2);
}

function barHeight(value: number): number {
  return Math.max((value / maxMonthlyRevenue.value) * 100, 2);
}

function shortMonth(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    pending: "Pending",
    completed: "Completed",
    failed: "Failed",
    refunded: "Refunded",
  };
  return labels[status];
}

function statusHint(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    pending: "Awaiting Stripe confirmation",
    completed: "Provisioned to users",
    failed: "Expired or unsuccessful",
    refunded: "Reversed in Stripe",
  };
  return labels[status];
}

function statusTagType(
  status: PaymentStatus,
): "default" | "info" | "success" | "warning" | "error" {
  if (status === "completed") return "success";
  if (status === "pending") return "warning";
  if (status === "failed") return "error";
  if (status === "refunded") return "info";
  return "default";
}

function statusColor(status: PaymentStatus): string {
  const colors: Record<PaymentStatus, string> = {
    completed: "#22c55e",
    pending: "#f59e0b",
    failed: "#ef4444",
    refunded: "#3b82f6",
  };
  return colors[status];
}

function typeLabel(type: PaymentType): string {
  return type === "photo_package" ? "Photo Package" : "Credits";
}

function grantSummary(item: PaymentTypeBreakdown): string {
  if (item.type === "credits") return `${item.creditsGranted.toLocaleString()} credits`;
  return `${item.analyzedPhotosGranted.toLocaleString()} analyzed photos`;
}

function paymentGrantSummary(row: PaymentRow): string {
  if (row.type === "credits") return `${row.creditsGranted.toLocaleString()} credits`;
  const parts = [`${row.photosGranted.toLocaleString()} photos`];
  if (row.analyzedPhotosGranted > 0) {
    parts.push(`${row.analyzedPhotosGranted.toLocaleString()} analyzed`);
  }
  return parts.join(" · ");
}

async function copyText(text: string | null, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    message.success(`${label} copied`);
  } catch {
    message.error("Failed to copy to clipboard");
  }
}

function goToUser(userId: number) {
  router.push({ name: "admin-user-detail", params: { id: userId } });
}

function filterByUser(userId: number) {
  router.push({ name: "admin-payments", query: { userId } });
}

function clearUserFilter() {
  router.push({ name: "admin-payments" });
}

const columns = computed<DataTableColumn<PaymentRow>[]>(() => [
  {
    title: "Date",
    key: "createdAt",
    width: 130,
    render(row) {
      return h("span", { class: "cell-dim" }, formatDateTime(row.createdAt));
    },
  },
  {
    title: "User",
    key: "user",
    width: 190,
    render(row) {
      return h(
        "button",
        {
          class: "cell-user-link",
          onClick: () => goToUser(row.userId),
        },
        [
          h("span", { class: "cell-user-name" }, row.userName),
          h("span", { class: "cell-dim" }, row.userEmail),
        ],
      );
    },
  },
  {
    title: "Product",
    key: "productName",
    minWidth: 180,
    render(row) {
      return h("div", { class: "cell-product" }, [
        h("span", { class: "cell-product-name" }, row.productName || row.packageId),
        h("span", { class: "cell-dim" }, typeLabel(row.type)),
      ]);
    },
  },
  {
    title: "Status",
    key: "status",
    width: 105,
    render(row) {
      return h(
        NTag,
        { size: "tiny", type: statusTagType(row.status), bordered: false },
        { default: () => statusLabel(row.status) },
      );
    },
  },
  {
    title: "Amount",
    key: "amountEur",
    width: 100,
    render(row) {
      return h("span", { class: "cost-value" }, `€${money(row.amountEur)}`);
    },
  },
  {
    title: "Granted",
    key: "granted",
    width: 155,
    render(row) {
      return h("span", { class: "cell-dim" }, paymentGrantSummary(row));
    },
  },
  {
    title: "Stripe",
    key: "stripe",
    width: 92,
    fixed: "right" as const,
    render(row) {
      return h("div", { class: "cell-actions" }, [
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            title: "Copy Stripe session ID",
            disabled: !row.stripeSessionId,
            onClick: () => copyText(row.stripeSessionId, "Session ID"),
          },
          { icon: () => h(NIcon, { size: 15 }, { default: () => h(CopyIcon) }) },
        ),
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            title: "Open user",
            onClick: () => goToUser(row.userId),
          },
          { icon: () => h(NIcon, { size: 15 }, { default: () => h(OpenIcon) }) },
        ),
      ]);
    },
  },
]);

async function fetchOverview() {
  overviewLoading.value = true;
  try {
    const { data } = await api.get("/api/admin/payments/overview");
    overview.value = data;
  } catch {
    message.error("Failed to load payments overview");
  } finally {
    overviewLoading.value = false;
  }
}

async function fetchPayments(page: number = 1) {
  paymentsLoading.value = true;
  try {
    const params: Record<string, any> = { page, limit: 30 };
    if (searchQuery.value) params.search = searchQuery.value;
    if (statusFilter.value) params.status = statusFilter.value;
    if (typeFilter.value) params.type = typeFilter.value;
    if (userIdFilter.value) params.userId = userIdFilter.value;

    const { data } = await api.get("/api/admin/payments", { params });
    payments.value = data.payments;
    paymentMeta.value = data.meta;
    paymentPage.value = page;
  } catch {
    message.error("Failed to load transactions");
  } finally {
    paymentsLoading.value = false;
  }
}

watch(
  () => route.query.userId,
  () => {
    userIdFilter.value = routeQueryString("userId");
    fetchPayments(1);
  },
);

onMounted(() => {
  fetchOverview();
  fetchPayments(1);
});
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

.loading-state,
.table-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
}

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

.kpi-value.warn {
  color: #f59e0b;
}

.kpi-sub,
.dim {
  color: #94a3b8;
  font-size: 12px;
}

.kpi-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
  width: fit-content;
}

.badge-up {
  background: #f0fdf4;
  color: #22c55e;
}

.badge-down {
  background: #fef2f2;
  color: #ef4444;
}

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

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-title-row .card-title {
  margin: 0;
}

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
}

.bar-fill {
  width: 100%;
  max-width: 48px;
  background: #c7d2fe;
  border-radius: 4px 4px 0 0;
  min-height: 3px;
  transition: height 0.3s ease;
}

.bar-fill.bar-current {
  background: #6366f1;
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

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

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

.breakdown-info,
.breakdown-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.breakdown-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.cost-value {
  font-weight: 700;
  color: #6366f1;
  font-variant-numeric: tabular-nums;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

.user-table {
  overflow-x: auto;
}

.user-header,
.user-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 8px;
  align-items: center;
}

.user-header {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.user-row {
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid #f8fafc;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 8px 0;
  text-align: left;
}

.user-row:hover {
  background: #f8fafc;
}

.user-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  color: #1e293b;
}

.transactions-section {
  margin-top: 28px;
}

.transactions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}

.transactions-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1e293b;
}

.transactions-actions,
.filters-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filters-bar {
  margin-bottom: 16px;
}

.filters-spacer {
  flex: 1;
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

.cell-user-link {
  background: none;
  border: none;
  color: #1e293b;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.cell-user-link:hover .cell-user-name {
  color: #6366f1;
  text-decoration: underline;
}

.cell-user-name,
.cell-product-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-product {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-actions {
  display: flex;
  gap: 2px;
}

@media (max-width: 768px) {
  .admin-section {
    padding: 0 8px;
  }

  .kpi-grid,
  .two-col {
    grid-template-columns: 1fr;
  }

  .card {
    padding: 16px;
  }

  .transactions-header {
    flex-direction: column;
    align-items: flex-start;
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

  .user-header,
  .user-row {
    grid-template-columns: 1.6fr 1fr 1fr 0.8fr 1fr;
    min-width: 720px;
  }
}

@media (max-width: 480px) {
  .section-header h1 {
    font-size: 18px;
  }
}
</style>