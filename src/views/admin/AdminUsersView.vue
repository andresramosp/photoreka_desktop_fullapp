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

      <n-select
        v-model:value="filterActive"
        placeholder="Status"
        clearable
        size="small"
        style="width: 130px"
        :options="activeOptions"
        @update:value="fetchUsers"
      />

      <n-select
        v-model:value="filterNeedsReview"
        placeholder="Photo review"
        clearable
        size="small"
        style="width: 155px"
        :options="reviewFilterOptions"
      />

      <div class="filters-spacer" />

      <n-tag :bordered="false" size="small" type="info">
        {{ filteredCount }} user{{ filteredCount !== 1 ? "s" : "" }}
      </n-tag>

      <n-button
        size="small"
        quaternary
        :disabled="users.length === 0"
        title="Copy all emails to clipboard"
        @click="copyEmails"
      >
        <template #icon>
          <n-icon size="15"><CopyIcon /></n-icon>
        </template>
        Copy emails
      </n-button>
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
              onClick: () => goToUser(row),
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
          :item-count="filteredUsers.length"
          size="small"
        />
      </div>
    </div>

    <!-- Global Activity Log -->
    <div class="activity-section">
      <div class="activity-section-header">
        <h2>Global Activity</h2>
        <div class="activity-controls">
          <span class="activity-live-badge">● LIVE</span>
          <n-input
            v-model:value="activitySearch"
            placeholder="Search user…"
            clearable
            size="tiny"
            style="width: 160px"
            @update:value="debouncedActivityFetch"
          >
            <template #prefix>
              <n-icon size="14"><SearchIcon /></n-icon>
            </template>
          </n-input>
          <n-select
            v-model:value="activityFilter"
            placeholder="All types"
            clearable
            size="tiny"
            style="width: 170px"
            :options="activityTypeOptions"
            @update:value="fetchGlobalActivities(1)"
          />
          <n-button
            size="tiny"
            quaternary
            :loading="activitiesLoading"
            title="Refresh"
            @click="fetchGlobalActivities(activityPage)"
          >
            <template #icon>
              <n-icon size="14"><RefreshIcon /></n-icon>
            </template>
          </n-button>
        </div>
      </div>

      <div class="table-wrapper">
        <div class="table-body">
          <div
            v-if="activitiesLoading && activities.length === 0"
            class="table-loading-state"
          >
            <n-spin show />
          </div>
          <n-data-table
            v-else
            :columns="activityColumns"
            :data="activities"
            :row-key="(row: GlobalActivityItem) => row.id"
            :bordered="false"
            size="small"
            :max-height="400"
            striped
          />
        </div>
        <div
          v-if="activityMeta && activityMeta.lastPage > 1"
          class="table-pagination"
        >
          <n-pagination
            v-model:page="activityPage"
            :page-size="activityMeta.perPage"
            :item-count="activityMeta.total"
            size="small"
            @update:page="fetchGlobalActivities"
          />
        </div>
      </div>
    </div>

    <!-- Review Images Modal -->
    <n-modal
      v-model:show="reviewModalVisible"
      preset="card"
      :title="`Photos — ${reviewModalUserName} (${reviewModalItems.length})`"
      style="max-width: 920px; width: 95vw"
      :segmented="{ content: true, footer: true }"
    >
      <div v-if="reviewModalLoading" class="photos-modal-loading">
        <n-spin show />
      </div>
      <div v-else-if="reviewModalError" class="photos-modal-error">
        Failed to load photos.
      </div>
      <div v-else-if="reviewModalItems.length === 0" class="photos-modal-empty">
        No photos found for this user.
      </div>
      <div v-else class="photos-grid">
        <div
          v-for="photo in reviewModalItems"
          :key="photo.id"
          class="photo-thumb-wrap"
          :title="photo.originalFileName ?? String(photo.id)"
        >
          <img
            :src="photo.thumbnailUrl"
            :alt="photo.originalFileName ?? String(photo.id)"
            class="photo-thumb"
            loading="lazy"
          />
          <span class="photo-thumb-id">#{{ photo.id }}</span>
        </div>
      </div>
      <template #footer>
        <div class="review-modal-footer">
          <span
            v-if="reviewModalReviewedAt"
            class="review-modal-status reviewed"
          >
            ✓ Reviewed on {{ formatDate(reviewModalReviewedAt) }}
          </span>
          <span v-else class="review-modal-status pending"
            >Not yet reviewed</span
          >
          <n-button
            type="success"
            :loading="reviewModalMarkingReviewed"
            @click="markPhotosReviewed"
          >
            {{ reviewModalReviewedAt ? "Update review" : "Mark as reviewed" }}
          </n-button>
        </div>
      </template>
    </n-modal>

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
import { ref, computed, onMounted, onUnmounted, h } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NTag,
  NIcon,
  NInput,
  NSelect,
  NDataTable,
  NModal,
  NSpin,
  NPagination,
  useMessage,
} from "naive-ui";
import type { DataTableColumn, DataTableSortState } from "naive-ui";
import {
  SearchOutline as SearchIcon,
  TrashOutline as TrashIcon,
  BanOutline as BanIcon,
  CheckmarkCircleOutline as ActivateIcon,
  RefreshOutline as RefreshIcon,
  CopyOutline as CopyIcon,
  EyeOutline as EyeIcon,
  CheckmarkDoneOutline as CheckedIcon,
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
  photosReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photosCount: number;
  totalCostEur: number;
  usage: any;
  costHistory: any;
}

interface GlobalActivityItem {
  id: number;
  type: string;
  action: string;
  description: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  user: { id: number; name: string; email: string } | null;
}

const router = useRouter();
const message = useMessage();

const users = ref<UserRow[]>([]);
const loading = ref(false);

const searchQuery = ref("");
const filterActive = ref<string | null>(null);
const filterNeedsReview = ref<string | null>(null);
const sortBy = ref<string | null>(null);
const sortDir = ref<string | null>(null);

const currentPage = ref(1);
const pageSize = 20;

const reviewFilterOptions = [
  { label: "Needs review", value: "pending" },
  { label: "Reviewed", value: "reviewed" },
];

function getUserPhotoCount(user: UserRow): number {
  return Number(user.usage?.analyzedPhotosUsed ?? user.photosCount ?? 0);
}

function hasReviewablePhotos(user: UserRow): boolean {
  return getUserPhotoCount(user) > 0;
}

const filteredUsers = computed(() => {
  if (filterNeedsReview.value === "pending")
    return users.value.filter(
      (u) => hasReviewablePhotos(u) && !u.photosReviewedAt,
    );
  if (filterNeedsReview.value === "reviewed")
    return users.value.filter(
      (u) => hasReviewablePhotos(u) && !!u.photosReviewedAt,
    );
  return users.value;
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredUsers.value.slice(start, start + pageSize);
});

const showDeleteModal = ref(false);
const userToDelete = ref<UserRow | null>(null);
const deleting = ref(false);

// ─── Review Images Modal ───
const reviewModalVisible = ref(false);
const reviewModalLoading = ref(false);
const reviewModalError = ref(false);
const reviewModalMarkingReviewed = ref(false);
const reviewModalUserId = ref<number | null>(null);
const reviewModalUserName = ref("");
const reviewModalReviewedAt = ref<string | null>(null);
const reviewModalItems = ref<
  { id: number; thumbnailUrl: string; originalFileName: string | null }[]
>([]);

async function openReviewModal(row: UserRow) {
  reviewModalUserId.value = row.id;
  reviewModalUserName.value = row.name;
  reviewModalReviewedAt.value = row.photosReviewedAt;
  reviewModalItems.value = [];
  reviewModalError.value = false;
  reviewModalLoading.value = true;
  reviewModalVisible.value = true;
  try {
    const { data } = await api.get(`/api/admin/users/${row.id}/photos`);
    reviewModalItems.value = data.photos;
  } catch {
    reviewModalError.value = true;
  } finally {
    reviewModalLoading.value = false;
  }
}

async function markPhotosReviewed() {
  if (!reviewModalUserId.value) return;
  reviewModalMarkingReviewed.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/users/${reviewModalUserId.value}/mark-photos-reviewed`,
    );
    reviewModalReviewedAt.value = data.photosReviewedAt;
    const idx = users.value.findIndex((u) => u.id === reviewModalUserId.value);
    if (idx !== -1) {
      users.value[idx] = {
        ...users.value[idx],
        photosReviewedAt: data.photosReviewedAt,
      };
    }
    message.success("Photos marked as reviewed");
    // cerrar dialog
    reviewModalVisible.value = false;
  } catch {
    message.error("Failed to mark photos as reviewed");
  } finally {
    reviewModalMarkingReviewed.value = false;
  }
}

// ─── Global Activity Log ───
const activities = ref<GlobalActivityItem[]>([]);
const activitiesLoading = ref(false);
const activityPage = ref(1);
const activityFilter = ref<string | null>(null);
const activitySearch = ref("");
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
  { label: "Photo upload", value: "photos_uploaded" },
  { label: "Photo analyze", value: "photo_analyze" },
  { label: "Photo delete", value: "photo_delete" },
  { label: "Photo download", value: "photo_download" },
  { label: "Photo duplicates", value: "photo_duplicates" },
  { label: "Photo insight", value: "photo_insight" },
  { label: "Photo swap", value: "photo_swap" },
  { label: "Photo note", value: "photo_note" },
  { label: "Collection create", value: "collection_create" },
  { label: "Collection update", value: "collection_update" },
  { label: "Collection delete", value: "collection_delete" },
  { label: "Collection +photos", value: "collection_add_photos" },
  { label: "Collection -photos", value: "collection_remove_photos" },
  { label: "Series create", value: "series_create" },
  { label: "Series update", value: "series_update" },
  { label: "Series delete", value: "series_delete" },
  { label: "Series +photos", value: "series_add_photos" },
  { label: "Series -photos", value: "series_remove_photos" },
  { label: "Portfolio build", value: "portfolio_build" },
  { label: "Report build", value: "report_build" },
  { label: "Location inference", value: "location_inference" },
  { label: "3D View", value: "view_3d" },
  { label: "Embeddings", value: "generate_embeddings" },
  { label: "Canvas create", value: "canvas_create" },
  { label: "Canvas delete", value: "canvas_delete" },
  { label: "Login", value: "login" },
  { label: "Register", value: "register" },
  { label: "Filter / Sort", value: "filter_apply" },
  { label: "Navigation", value: "ui_action" },
];

let activityRefreshTimer: ReturnType<typeof setInterval> | null = null;

onUnmounted(() => {
  if (activityRefreshTimer) clearInterval(activityRefreshTimer);
});

const activeOptions = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const filteredCount = computed(() => filteredUsers.value.length);

function goToUser(row: UserRow) {
  router.push({ name: "admin-user-detail", params: { id: row.id } });
}

async function copyEmails() {
  const emails = users.value.map((u) => u.email).join(", ");
  try {
    await navigator.clipboard.writeText(emails);
    message.success(
      `${users.value.length} email${users.value.length !== 1 ? "s" : ""} copied to clipboard`,
    );
  } catch {
    message.error("Failed to copy to clipboard");
  }
}

// Debounce helpers
let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedFetch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchUsers(), 300);
}

let activityDebounceTimer: ReturnType<typeof setTimeout>;
function debouncedActivityFetch() {
  clearTimeout(activityDebounceTimer);
  activityDebounceTimer = setTimeout(() => fetchGlobalActivities(1), 300);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function rowClassName(row: UserRow) {
  if (!row.isActive) return "row-inactive";
  return "";
}

// ─── Activity helpers ───
const ACTIVITY_LABELS: Record<string, string> = {
  login: "Login",
  register: "Register",
  search_semantic: "Semantic search",
  search_tags: "Tag search",
  search_visual: "Visual search",
  chat_message: "Chat",
  photos_uploaded: "Photos uploaded",
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
  photo_rank: "Photo rank",
  filter_apply: "Filter / Sort",
  ui_action: "Navigation",
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
  if (
    type.startsWith("photo_") ||
    type === "photos_uploaded" ||
    type === "generate_embeddings"
  )
    return "success";
  if (
    type.startsWith("collection_") ||
    type.startsWith("series_") ||
    type.startsWith("canvas_")
  )
    return "default";
  if (type === "login" || type === "register") return "info";
  if (type === "ui_action" || type === "filter_apply" || type === "photo_rank")
    return "default";
  return "default";
}

function activitySummary(act: GlobalActivityItem): string {
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
    case "photos_uploaded":
      return `${m.count} photo(s) · ${m.source || "local"}`;
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
      return `${m.action || ""} · ${m.currentPhotos ?? "?"} photos`;
    case "view_3d":
      return `${m.chunkCategory || "all"} · ${m.photoCount ?? "?"} photos · ${m.outputDims}D`;
    case "login":
      return m.provider || "email";
    case "register":
      return m.provider || "email";
    case "ui_action":
      return m.action === "enter_route" ? `→ ${m.name}` : m.action || "";
    case "filter_apply": {
      const parts: string[] = [];
      if (m.context) parts.push(String(m.context));
      if (m.filter) parts.push(String(m.filter));
      if (m.filters) parts.push((m.filters as string[]).join(", "));
      if (m.sortType) parts.push(String(m.sortType));
      if (m.criteria) parts.push((m.criteria as string[]).join(", "));
      if (m.genre) parts.push(String(m.genre));
      if (m.sortingType) parts.push(String(m.sortingType));
      return parts.join(" · ");
    }
    case "photo_rank":
      return `photo ${m.photoId ?? "?"} → rank ${m.rank ?? "?"}`;
    default:
      return "";
  }
}

// ─── Users Table Columns ───
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
      return h("span", null, String(getUserPhotoCount(row)));
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
  // {
  //   title: "Credits",
  //   key: "credits",
  //   width: 100,
  //   render(row) {
  //     if (!row.usage) return h("span", { class: "cell-dim" }, "—");
  //     const used = row.usage.creditsUsed || 0;
  //     const available = row.usage.creditsAvailable || 0;
  //     return h("span", null, `${used}/${available}`);
  //   },
  // },
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
    title: "Review",
    key: "_review",
    width: 105,
    render(row) {
      if (!hasReviewablePhotos(row)) return null;

      const reviewed = !!row.photosReviewedAt;
      return h(
        NButton,
        {
          size: "tiny",
          type: reviewed ? "success" : "warning",
          secondary: true,
          title: reviewed
            ? `Reviewed on ${formatDate(row.photosReviewedAt)}`
            : "Photos not yet reviewed",
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            openReviewModal(row);
          },
        },
        {
          icon: () =>
            h(
              NIcon,
              { size: 14 },
              { default: () => h(reviewed ? CheckedIcon : EyeIcon) },
            ),
          default: () => (reviewed ? "Reviewed" : "Review"),
        },
      );
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

// ─── Global Activity Columns ───
const activityColumns = computed<DataTableColumn<GlobalActivityItem>[]>(() => [
  {
    title: "Time",
    key: "createdAt",
    width: 120,
    render(row) {
      return h("span", { class: "cell-dim" }, formatDateTime(row.createdAt));
    },
  },
  {
    title: "User",
    key: "user",
    width: 180,
    render(row) {
      if (!row.user) return h("span", { class: "cell-dim" }, "—");
      return h(
        "a",
        {
          class: "cell-user-link",
          onClick: (e: Event) => {
            e.stopPropagation();
            router.push({
              name: "admin-user-detail",
              params: { id: row.user!.id },
            });
          },
        },
        row.user.name,
      );
    },
  },
  {
    title: "Type",
    key: "type",
    width: 140,
    render(row) {
      return h(
        NTag,
        {
          size: "tiny",
          bordered: false,
          type: activityTagType(row.type),
        },
        { default: () => activityLabel(row.type) },
      );
    },
  },
  {
    title: "Details",
    key: "details",
    render(row) {
      return h("span", { class: "cell-activity-detail" }, activitySummary(row));
    },
  },
]);

// ─── API calls ───
async function fetchUsers() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (searchQuery.value) params.search = searchQuery.value;
    if (filterActive.value !== null && filterActive.value !== undefined)
      params.isActive = filterActive.value;
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

async function fetchGlobalActivities(page: number = 1) {
  activitiesLoading.value = true;
  try {
    const params: Record<string, any> = { page, limit: 30 };
    if (activityFilter.value) params.type = activityFilter.value;
    if (activitySearch.value) params.search = activitySearch.value;
    const { data } = await api.get("/api/admin/activities", { params });
    activities.value = data.activities;
    activityMeta.value = data.meta;
    activityPage.value = page;
  } catch {
    message.error("Failed to load activities");
  } finally {
    activitiesLoading.value = false;
  }
}

async function toggleActive(row: UserRow) {
  try {
    await api.patch(`/api/admin/users/${row.id}/toggle-active`);
    message.success(
      `User ${row.isActive ? "deactivated" : "activated"} successfully`,
    );
    await fetchUsers();
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
    await fetchUsers();
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to delete user";
    message.error(msg);
  } finally {
    deleting.value = false;
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
  fetchGlobalActivities(1);
  activityRefreshTimer = setInterval(
    () => fetchGlobalActivities(activityPage.value),
    20000,
  );
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

/* ===== Activity Section ===== */
.activity-section {
  margin-top: 28px;
}

.activity-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.activity-section-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1e293b;
}

.activity-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-live-badge {
  font-size: 10px;
  font-weight: 700;
  color: #22c55e;
  letter-spacing: 0.5px;
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.cell-user-link {
  color: #6366f1;
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.cell-user-link:hover {
  text-decoration: underline;
}

.cell-activity-detail {
  font-size: 12px;
  color: #64748b;
  word-break: break-word;
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

  .table-wrapper {
    border-radius: 8px;
  }

  :deep(.n-data-table) {
    font-size: 12px;
  }

  .activity-section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .activity-controls {
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .section-header h1 {
    font-size: 18px;
  }
}

/* ===== Review Images Modal ===== */
.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 2px;
}

.photo-thumb-wrap {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: #f1f5f9;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.photo-thumb-id {
  position: absolute;
  bottom: 3px;
  left: 4px;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 1px 4px;
  line-height: 1.4;
}

.photos-modal-loading,
.photos-modal-error,
.photos-modal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: #94a3b8;
  font-size: 14px;
}

.review-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.review-modal-status {
  font-size: 13px;
  font-weight: 500;
}

.review-modal-status.reviewed {
  color: #22c55e;
}

.review-modal-status.pending {
  color: #94a3b8;
}
</style>
