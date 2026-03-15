<template>
  <div class="admin-section">
    <div class="section-header">
      <h1>Users</h1>
      <p>View all registered users, manage roles and account status</p>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <n-input
        v-model:value="searchQuery"
        placeholder="Search by name or email…"
        clearable
        size="small"
        style="max-width: 280px"
        @update:value="debouncedFetch"
      >
        <template #prefix>
          <n-icon size="16"><SearchIcon /></n-icon>
        </template>
      </n-input>

      <!-- <n-select
        v-model:value="filterRole"
        placeholder="Role"
        clearable
        size="small"
        style="width: 120px"
        :options="roleOptions"
        @update:value="fetchUsers"
      /> -->

      <n-select
        v-model:value="filterActive"
        placeholder="Status"
        clearable
        size="small"
        style="width: 130px"
        :options="activeOptions"
        @update:value="fetchUsers"
      />

      <!-- <n-select
        v-model:value="filterProvider"
        placeholder="Provider"
        clearable
        size="small"
        style="width: 130px"
        :options="providerOptions"
        @update:value="fetchUsers"
      /> -->

      <div class="filters-spacer" />

      <n-tag :bordered="false" size="small" type="info">
        {{ filteredCount }} user{{ filteredCount !== 1 ? "s" : "" }}
      </n-tag>
    </div>

    <!-- Users Table -->
    <div class="table-wrapper">
      <div class="table-body">
        <div v-if="loading" class="table-loading-state">
          <n-spin show />
        </div>
        <n-data-table
          v-else
          :columns="columns"
          :data="paginatedUsers"
          :row-key="(row: UserRow) => row.id"
          :row-class-name="rowClassName"
          :row-props="
            (row: UserRow) => ({
              onClick: () => selectUser(row),
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
          :item-count="users.length"
          size="small"
        />
      </div>
    </div>

    <!-- User Detail Panel -->
    <transition name="slide-up">
      <div v-if="selectedUser" class="detail-panel">
        <div class="detail-header">
          <div class="detail-title-row">
            <n-avatar
              :size="40"
              round
              :src="selectedUser.avatar || undefined"
              style="background: #6366f1; font-size: 15px; flex-shrink: 0"
            >
              {{ userInitials(selectedUser.name) }}
            </n-avatar>
            <div class="detail-title-info">
              <h2>{{ selectedUser.name }}</h2>
              <span class="detail-email">{{ selectedUser.email }}</span>
            </div>
            <button class="close-detail-btn" @click="selectedUser = null">
              <n-icon size="18"><CloseIcon /></n-icon>
            </button>
          </div>
        </div>

        <n-spin :show="detailLoading">
          <div class="detail-body">
            <!-- Info grid -->
            <div class="detail-grid">
              <div class="detail-card">
                <h4>Account</h4>
                <div class="info-row">
                  <span class="info-label">ID</span>
                  <span class="info-value">#{{ selectedUser.id }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Role</span>
                  <n-tag
                    size="tiny"
                    :type="
                      selectedUser.role === 'admin' ? 'warning' : 'default'
                    "
                  >
                    {{ selectedUser.role }}
                  </n-tag>
                </div>
                <div class="info-row">
                  <span class="info-label">Status</span>
                  <n-tag
                    size="tiny"
                    :type="selectedUser.isActive ? 'success' : 'error'"
                  >
                    {{ selectedUser.isActive ? "Active" : "Inactive" }}
                  </n-tag>
                </div>
                <div class="info-row">
                  <span class="info-label">Provider</span>
                  <span class="info-value">{{
                    selectedUser.provider || "email"
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email confirmed</span>
                  <n-tag
                    size="tiny"
                    :type="
                      selectedUser.emailConfirmedAt ? 'success' : 'warning'
                    "
                  >
                    {{
                      selectedUser.emailConfirmedAt
                        ? formatDate(selectedUser.emailConfirmedAt)
                        : "Pending"
                    }}
                  </n-tag>
                </div>
                <div class="info-row">
                  <span class="info-label">Profiles</span>
                  <span class="info-value">{{
                    selectedUser.profiles || "—"
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Source</span>
                  <span class="info-value">{{
                    selectedUser.preferredSource || "—"
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Created</span>
                  <span class="info-value">{{
                    formatDate(selectedUser.createdAt)
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Updated</span>
                  <span class="info-value">{{
                    formatDate(selectedUser.updatedAt)
                  }}</span>
                </div>
              </div>

              <div class="detail-card">
                <h4>Usage & Credits</h4>
                <template v-if="selectedUser.usage">
                  <div class="info-row">
                    <span class="info-label">Photos uploaded</span>
                    <span class="info-value">{{
                      selectedUser.photosCount
                    }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Photos limit</span>
                    <span class="info-value">{{
                      selectedUser.usage.photosLimit
                    }}</span>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Analyzed used</span>
                    <span class="info-value">{{
                      selectedUser.usage.analyzedPhotosUsed || 0
                    }}</span>
                  </div>

                  <!-- Editable: analyzedPhotosLimit -->
                  <div class="info-row editable-row">
                    <span class="info-label">Analyzed limit</span>
                    <n-input-number
                      v-model:value="editUsage.analyzedPhotosLimit"
                      size="tiny"
                      :min="0"
                      :step="100"
                      style="width: 120px"
                    />
                  </div>

                  <div class="info-row">
                    <span class="info-label">Credits used</span>
                    <span class="info-value">{{
                      selectedUser.usage.creditsUsed || 0
                    }}</span>
                  </div>

                  <!-- Editable: creditsAvailable -->
                  <div class="info-row editable-row">
                    <span class="info-label">Credits available</span>
                    <n-input-number
                      v-model:value="editUsage.creditsAvailable"
                      size="tiny"
                      :min="0"
                      :step="100"
                      style="width: 120px"
                    />
                  </div>

                  <n-button
                    size="small"
                    type="primary"
                    :loading="savingUsage"
                    :disabled="!usageChanged"
                    style="margin-top: 12px"
                    @click="saveUsage"
                  >
                    Save usage changes
                  </n-button>
                </template>
                <p v-else class="no-data">No usage data</p>
              </div>

              <div class="detail-card">
                <h4>Cost History</h4>
                <template v-if="selectedUser.costHistory">
                  <div class="info-row">
                    <span class="info-label">Total cost</span>
                    <span class="info-value cost-value">
                      €{{ selectedUser.costHistory.totalCostInEur?.toFixed(4) }}
                    </span>
                  </div>
                  <div
                    v-if="selectedUser.costHistory.byCategory"
                    class="cost-categories"
                  >
                    <div class="cost-category-header">
                      <span>Category</span>
                      <span>Cost</span>
                      <span>Calls</span>
                    </div>
                    <div
                      v-for="(val, key) in selectedUser.costHistory.byCategory"
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

            <!-- Activity Log Card -->
            <div class="activity-card">
              <div class="activity-card-header">
                <h4>Activity Log</h4>
                <div class="activity-controls">
                  <n-select
                    v-model:value="activityFilter"
                    placeholder="All types"
                    clearable
                    size="tiny"
                    style="width: 170px"
                    :options="activityTypeOptions"
                    @update:value="fetchActivities(1)"
                  />
                  <n-button
                    size="tiny"
                    quaternary
                    :loading="activitiesLoading"
                    title="Refresh activities"
                    @click="fetchActivities(activityPage)"
                  >
                    <template #icon><n-icon size="14"><RefreshIcon /></n-icon></template>
                  </n-button>
                </div>
              </div>

              <div
                v-if="activitiesLoading && activities.length === 0"
                class="activity-loading"
              >
                <n-spin size="small" />
              </div>
              <div v-else-if="activities.length === 0" class="activity-empty">
                No activity recorded yet
              </div>
              <div v-else class="activity-timeline">
                <div
                  v-for="act in activities"
                  :key="act.id"
                  class="activity-item"
                >
                  <div class="activity-dot" :class="activityColor(act.type)" />
                  <div class="activity-content">
                    <div class="activity-top">
                      <n-tag
                        size="tiny"
                        :bordered="false"
                        :type="activityTagType(act.type)"
                      >
                        {{ activityLabel(act.type) }}
                      </n-tag>
                      <span class="activity-time">{{
                        formatDateTime(act.createdAt)
                      }}</span>
                    </div>
                    <div class="activity-meta">
                      {{ activitySummary(act) }}
                    </div>
                    <!-- Expandable chat content -->
                    <template
                      v-if="act.type === 'chat_message' && act.metadata && (act.metadata.question || act.metadata.answer)"
                    >
                      <button
                        class="activity-expand-btn"
                        @click="act._expanded = !act._expanded"
                      >
                        {{ act._expanded ? "Collapse" : "Show conversation" }}
                      </button>
                      <div v-if="act._expanded" class="activity-chat-detail">
                        <div
                          v-if="act.metadata.question"
                          class="chat-bubble chat-q"
                        >
                          <span class="chat-label">User</span>
                          {{ act.metadata.question }}
                        </div>
                        <div
                          v-if="act.metadata.answer"
                          class="chat-bubble chat-a"
                        >
                          <span class="chat-label">Agent</span>
                          {{ act.metadata.answer }}
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
              <div
                v-if="activityMeta && activityMeta.lastPage > 1"
                class="activity-pagination"
              >
                <n-pagination
                  v-model:page="activityPage"
                  :page-size="activityMeta.perPage"
                  :item-count="activityMeta.total"
                  size="small"
                  @update:page="fetchActivities"
                />
              </div>
            </div>
          </div>
        </n-spin>
      </div>
    </transition>

    <!-- Delete confirmation modal -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" type="error">
      <template #header>Delete User</template>
      <p>
        Are you sure you want to delete
        <strong>{{ userToDelete?.name }}</strong> ({{ userToDelete?.email }})?
        This will soft-delete all their photos and permanently remove the
        account.
      </p>
      <template #action>
        <n-button @click="showDeleteModal = false">Cancel</n-button>
        <n-button type="error" :loading="deleting" @click="confirmDelete">
          Delete
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from "vue";
import {
  NButton,
  NTag,
  NIcon,
  NInput,
  NSelect,
  NDataTable,
  NAvatar,
  NModal,
  NSpin,
  NInputNumber,
  NPagination,
  useMessage,
} from "naive-ui";
import type { DataTableColumn, DataTableSortState } from "naive-ui";
import {
  SearchOutline as SearchIcon,
  CloseOutline as CloseIcon,
  TrashOutline as TrashIcon,
  BanOutline as BanIcon,
  CheckmarkCircleOutline as ActivateIcon,
  RefreshOutline as RefreshIcon,
} from "@vicons/ionicons5";
import { api } from "../../utils/axios";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  provider: string | null;
  preferredSource: string | null;
  profiles: string | null;
  emailConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photosCount: number;
  totalCostEur: number;
  usage: any;
  costHistory: any;
  avatar?: string | null;
  googleId?: string | null;
  catalogPatterns?: any;
}

const message = useMessage();

const users = ref<UserRow[]>([]);
const loading = ref(false);
const selectedUser = ref<UserRow | null>(null);
const detailLoading = ref(false);

const searchQuery = ref("");
const filterRole = ref<string | null>(null);
const filterActive = ref<string | null>(null);
const filterProvider = ref<string | null>(null);
const sortBy = ref<string | null>(null);
const sortDir = ref<string | null>(null);

const currentPage = ref(1);
const pageSize = 20;

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return users.value.slice(start, start + pageSize);
});

const showDeleteModal = ref(false);
const userToDelete = ref<UserRow | null>(null);
const deleting = ref(false);
const savingUsage = ref(false);

const editUsage = ref({
  analyzedPhotosLimit: 0,
  creditsAvailable: 0,
});

// ─── Activity Log ───
interface ActivityItem {
  id: number;
  type: string;
  action: string;
  description: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  _expanded?: boolean;
}

const activities = ref<ActivityItem[]>([]);
const activitiesLoading = ref(false);
const activityPage = ref(1);
const activityFilter = ref<string | null>(null);
const activityMeta = ref<{
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
} | null>(null);

const activityTypeOptions = [
  { label: "Search (semantic)", value: "search_semantic" },
  { label: "Search (tags)", value: "search_tags" },
  { label: "Search (visual)", value: "search_visual" },
  { label: "Chat", value: "chat_message" },
  { label: "Photo upload", value: "photo_upload" },
  { label: "Photo analyze", value: "photo_analyze" },
  { label: "Photo delete", value: "photo_delete" },
  { label: "Photo download", value: "photo_download" },
  { label: "Photo duplicates", value: "photo_duplicates" },
  { label: "Photo insight", value: "photo_insight" },
  { label: "Collection", value: "collection_create" },
  { label: "Series", value: "series_create" },
  { label: "Portfolio build", value: "portfolio_build" },
  { label: "3D View", value: "view_3d" },
  { label: "Embeddings", value: "generate_embeddings" },
  { label: "Login", value: "login" },
  { label: "Register", value: "register" },
];

let activityRefreshTimer: ReturnType<typeof setInterval> | null = null;

watch(selectedUser, (u) => {
  if (activityRefreshTimer) {
    clearInterval(activityRefreshTimer);
    activityRefreshTimer = null;
  }
  if (u) {
    activityPage.value = 1;
    activityFilter.value = null;
    fetchActivities(1);
    activityRefreshTimer = setInterval(() => fetchActivities(activityPage.value), 20000);
  } else {
    activities.value = [];
    activityMeta.value = null;
  }
});

onUnmounted(() => {
  if (activityRefreshTimer) clearInterval(activityRefreshTimer);
});

async function fetchActivities(page: number = 1) {
  if (!selectedUser.value) return;
  activitiesLoading.value = true;
  try {
    const params: Record<string, any> = { page, limit: 30 };
    if (activityFilter.value) params.type = activityFilter.value;
    const { data } = await api.get(
      `/api/admin/users/${selectedUser.value.id}/activities`,
      { params },
    );
    activities.value = data.activities.map((a: any) => ({
      ...a,
      _expanded: false,
    }));
    activityMeta.value = data.meta;
    activityPage.value = page;
  } catch {
    message.error("Failed to load activities");
  } finally {
    activitiesLoading.value = false;
  }
}

const ACTIVITY_LABELS: Record<string, string> = {
  login: "Login",
  register: "Register",
  search_semantic: "Semantic search",
  search_tags: "Tag search",
  search_visual: "Visual search",
  chat_message: "Chat",
  photo_upload: "Photo upload",
  photo_analyze: "Analysis",
  photo_delete: "Photo delete",
  photo_download: "Download",
  photo_duplicates: "Duplicates check",
  photo_insight: "Photo insight",
  photo_swap: "Photo swap",
  photo_note: "Photo note",
  collection_create: "Collection created",
  collection_update: "Collection updated",
  collection_delete: "Collection deleted",
  collection_add_photos: "Collection +photos",
  collection_remove_photos: "Collection -photos",
  series_create: "Series created",
  series_update: "Series updated",
  series_delete: "Series deleted",
  series_add_photos: "Series +photos",
  series_remove_photos: "Series -photos",
  portfolio_build: "Portfolio build",
  view_3d: "3D View",
  generate_embeddings: "Embeddings",
  canvas_create: "Canvas created",
  canvas_delete: "Canvas deleted",
};

function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] || type;
}

function activityTagType(
  type: string,
): "default" | "info" | "success" | "warning" | "error" {
  if (type.startsWith("search_")) return "info";
  if (type === "chat_message") return "warning";
  if (type.startsWith("photo_delete") || type.includes("delete"))
    return "error";
  if (type.startsWith("photo_") || type === "generate_embeddings")
    return "success";
  if (
    type.startsWith("collection_") ||
    type.startsWith("series_") ||
    type.startsWith("canvas_")
  )
    return "default";
  if (type === "login" || type === "register") return "info";
  return "default";
}

function activityColor(type: string): string {
  if (type.startsWith("search_")) return "dot-blue";
  if (type === "chat_message") return "dot-amber";
  if (type.includes("delete")) return "dot-red";
  if (type.startsWith("photo_")) return "dot-green";
  if (type === "portfolio_build" || type === "view_3d") return "dot-purple";
  return "dot-gray";
}

function activitySummary(act: ActivityItem): string {
  const m = act.metadata;
  if (!m) return "";
  switch (act.type) {
    case "search_semantic":
      return `"${m.query || ""}" — ${m.resultCount ?? "?"} results`;
    case "search_tags":
      return `${(m.includedTags || []).join(", ")} — ${m.resultCount ?? "?"} results`;
    case "search_visual":
      return `${m.resultCount ?? "?"} similar photos found`;
    case "chat_message":
      return `${m.toolsUsed?.length || 0} tools · ${m.costEur != null ? "€" + Number(m.costEur).toFixed(4) : ""}`;
    case "photo_upload":
      return `${m.fileName || "photo"} (${m.source})`;
    case "photo_analyze":
      return `${m.photoCount} photo(s)`;
    case "photo_delete":
      return `${m.count} photo(s) deleted`;
    case "photo_download":
      return `${m.count} photo(s) · ${m.format}`;
    case "photo_duplicates":
      return `${m.checkedCount ?? "?"} checked · ${m.matchCount ?? 0} matches`;
    case "photo_insight":
      return `${m.insightType || "general"} · ${m.provider || ""}`;
    case "collection_create":
    case "series_create":
      return `"${m.name || ""}" · ${m.initialPhotos || 0} photos`;
    case "collection_add_photos":
    case "series_add_photos":
      return `+${m.photoCount} photos`;
    case "collection_remove_photos":
    case "series_remove_photos":
      return `-${m.photoCount} photos`;
    case "portfolio_build":
      return `${m.action || ""} · ${m.photosAnalyzed ?? "?"} photos`;
    case "view_3d":
      return `${m.chunkCategory || "all"} · ${m.photoCount ?? "?"} photos · ${m.outputDims}D`;
    case "login":
      return m.provider || "email";
    case "register":
      return m.provider || "email";
    default:
      return "";
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const roleOptions = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
];

const activeOptions = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const providerOptions = [
  { label: "Email", value: "email" },
  { label: "Google", value: "google" },
];

const filteredCount = computed(() => users.value.length);

const usageChanged = computed(() => {
  if (!selectedUser.value?.usage) return false;
  return (
    editUsage.value.analyzedPhotosLimit !==
      selectedUser.value.usage.analyzedPhotosLimit ||
    editUsage.value.creditsAvailable !==
      selectedUser.value.usage.creditsAvailable
  );
});

// Debounce helper
let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchUsers(), 300);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function userInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function rowClassName(row: UserRow) {
  if (!row.isActive) return "row-inactive";
  if (selectedUser.value?.id === row.id) return "row-selected";
  return "";
}

// Columns
const columns = computed<DataTableColumn<UserRow>[]>(() => [
  {
    title: "Name",
    key: "name",
    sorter: true,
    width: 180,
    render(row) {
      return h("span", { class: "cell-user-name" }, row.name);
    },
  },
  {
    title: "Email",
    key: "email",
    sorter: true,
    width: 250,
    render(row) {
      return h("div", { class: "cell-user" }, [
        h("span", { class: "cell-user-email-only" }, row.email),
      ]);
    },
  },

  {
    title: "Status",
    key: "isActive",
    width: 90,
    sorter: true,
    render(row) {
      return h(
        NTag,
        { size: "tiny", type: row.isActive ? "success" : "error" },
        { default: () => (row.isActive ? "Active" : "Inactive") },
      );
    },
  },
  {
    title: "Email",
    key: "emailConfirmedAt",
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          size: "tiny",
          type: row.emailConfirmedAt ? "success" : "warning",
          bordered: false,
        },
        { default: () => (row.emailConfirmedAt ? "Confirmed" : "Pending") },
      );
    },
  },
  {
    title: "Photos",
    key: "photosCount",
    width: 100,
    sorter: true,
    render(row) {
      return h("span", null, String(row.usage?.analyzedPhotosUsed || 0));
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
    title: "Credits",
    key: "credits",
    width: 100,
    render(row) {
      if (!row.usage) return h("span", { class: "cell-dim" }, "—");
      const used = row.usage.creditsUsed || 0;
      const available = row.usage.creditsAvailable || 0;
      return h("span", null, `${used}/${available}`);
    },
  },
  {
    title: "Created",
    key: "createdAt",
    width: 110,
    sorter: true,
    render(row) {
      return h("span", { class: "cell-dim" }, formatDate(row.createdAt));
    },
  },
  {
    title: "",
    key: "actions",
    width: 130,
    fixed: "right" as const,
    render(row) {
      return h("div", { class: "cell-actions" }, [
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            type: row.isActive ? "warning" : "success",
            title: row.isActive ? "Deactivate" : "Activate",
            onClick: (e: Event) => {
              e.stopPropagation();
              toggleActive(row);
            },
          },
          {
            icon: () =>
              h(
                NIcon,
                { size: 16 },
                {
                  default: () => h(row.isActive ? BanIcon : ActivateIcon),
                },
              ),
          },
        ),
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            type: "error",
            title: "Delete user",
            disabled: row.role === "admin",
            onClick: (e: Event) => {
              e.stopPropagation();
              promptDelete(row);
            },
          },
          {
            icon: () => h(NIcon, { size: 16 }, { default: () => h(TrashIcon) }),
          },
        ),
      ]);
    },
  },
]);

// API calls
async function fetchUsers() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (searchQuery.value) params.search = searchQuery.value;
    if (filterRole.value) params.role = filterRole.value;
    if (filterActive.value !== null && filterActive.value !== undefined)
      params.isActive = filterActive.value;
    if (filterProvider.value) params.provider = filterProvider.value;
    if (sortBy.value) {
      params.sortBy = sortBy.value;
      params.sortDir = sortDir.value || "desc";
    }

    const { data } = await api.get("/api/admin/users", { params });
    users.value = data.users;
  } catch {
    message.error("Failed to load users");
  } finally {
    loading.value = false;
  }
}

async function selectUser(row: UserRow) {
  detailLoading.value = true;
  selectedUser.value = row;
  try {
    const { data } = await api.get(`/api/admin/users/${row.id}`);
    selectedUser.value = data.user;
    editUsage.value = {
      analyzedPhotosLimit: data.user.usage?.analyzedPhotosLimit ?? 0,
      creditsAvailable: data.user.usage?.creditsAvailable ?? 0,
    };
  } catch {
    message.error("Failed to load user details");
  } finally {
    detailLoading.value = false;
  }
}

async function toggleActive(row: UserRow) {
  try {
    await api.patch(`/api/admin/users/${row.id}/toggle-active`);
    message.success(
      `User ${row.isActive ? "deactivated" : "activated"} successfully`,
    );
    await fetchUsers();
    if (selectedUser.value?.id === row.id) {
      await selectUser(row);
    }
  } catch {
    message.error("Failed to update user status");
  }
}

function promptDelete(row: UserRow) {
  userToDelete.value = row;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!userToDelete.value) return;
  deleting.value = true;
  try {
    await api.delete(`/api/admin/users/${userToDelete.value.id}`);
    message.success("User deleted successfully");
    showDeleteModal.value = false;
    if (selectedUser.value?.id === userToDelete.value.id) {
      selectedUser.value = null;
    }
    await fetchUsers();
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to delete user";
    message.error(msg);
  } finally {
    deleting.value = false;
  }
}

async function saveUsage() {
  if (!selectedUser.value) return;
  savingUsage.value = true;
  try {
    const { data } = await api.put(
      `/api/admin/users/${selectedUser.value.id}/usage`,
      editUsage.value,
    );
    message.success("Usage updated");
    // Update local state
    if (selectedUser.value.usage) {
      selectedUser.value.usage.analyzedPhotosLimit =
        data.usage.analyzedPhotosLimit;
      selectedUser.value.usage.creditsAvailable = data.usage.creditsAvailable;
    }
    await fetchUsers();
  } catch {
    message.error("Failed to update usage");
  } finally {
    savingUsage.value = false;
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
  fetchUsers();
}

onMounted(() => {
  fetchUsers();
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

:deep(.row-inactive) {
  opacity: 0.55;
}

:deep(.row-selected) {
  background: #eff6ff !important;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.cell-user-name {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-user-email-only {
  font-size: 13px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  vertical-align: middle;
}

.cell-dim {
  color: #94a3b8;
  font-size: 13px;
}

.cell-cost {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.cell-actions {
  display: flex;
  gap: 2px;
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

.editable-row {
  padding: 3px 0;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
  margin: 0;
  font-style: italic;
}

/* ===== Cost categories ===== */
.cost-value {
  font-weight: 700;
  color: #6366f1;
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

/* ===== Activity Log ===== */
.activity-card {
  grid-column: 1 / -1;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 16px 18px;
  margin-top: 16px;
}

.activity-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.activity-card-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.activity-controls {
  display: flex;
  gap: 8px;
}

.activity-loading,
.activity-empty {
  text-align: center;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

.activity-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.activity-item {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.dot-blue {
  background: #3b82f6;
}
.dot-amber {
  background: #f59e0b;
}
.dot-red {
  background: #ef4444;
}
.dot-green {
  background: #22c55e;
}
.dot-purple {
  background: #8b5cf6;
}
.dot-gray {
  background: #94a3b8;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-time {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
  white-space: nowrap;
}

.activity-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 3px;
  line-height: 1.4;
  word-break: break-word;
}

.activity-expand-btn {
  background: none;
  border: none;
  padding: 0;
  margin-top: 4px;
  font-size: 11px;
  color: #6366f1;
  cursor: pointer;
  font-weight: 500;
}

.activity-expand-btn:hover {
  text-decoration: underline;
}

.activity-chat-detail {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-q {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: #1e40af;
}

.chat-a {
  background: #f0fdf4;
  border: 1px solid #dcfce7;
  color: #166534;
}

.chat-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
  opacity: 0.7;
}

.activity-pagination {
  padding-top: 10px;
  display: flex;
  justify-content: center;
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
