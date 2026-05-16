<template>
  <div class="admin-section">
    <div class="section-header">
      <button class="back-btn" @click="goBack">
        <n-icon size="18"><ArrowBackIcon /></n-icon>
        <span>Back to users</span>
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <n-spin show />
    </div>

    <template v-else-if="user">
      <!-- User Header -->
      <div class="detail-panel">
        <div class="detail-header">
          <div class="detail-title-row">
            <n-avatar
              :size="40"
              round
              :src="user.avatar || undefined"
              style="background: #6366f1; font-size: 15px; flex-shrink: 0"
            >
              {{ userInitials(user.name) }}
            </n-avatar>
            <div class="detail-title-info">
              <h2>{{ user.name }}</h2>
              <span class="detail-email">{{ user.email }}</span>
            </div>
            <div class="header-actions">
              <n-button
                size="small"
                :type="user.isActive ? 'warning' : 'success'"
                quaternary
                @click="toggleActive"
              >
                <template #icon>
                  <n-icon size="16">
                    <BanIcon v-if="user.isActive" />
                    <ActivateIcon v-else />
                  </n-icon>
                </template>
                {{ user.isActive ? "Deactivate" : "Activate" }}
              </n-button>
              <n-button
                size="small"
                type="info"
                quaternary
                :loading="impersonating"
                title="Open app as this user (2h token)"
                @click="impersonateUser"
              >
                <template #icon>
                  <n-icon size="16"><ImpersonateIcon /></n-icon>
                </template>
                Impersonate
              </n-button>
              <n-button
                size="small"
                type="error"
                quaternary
                :disabled="user.role === 'admin'"
                @click="promptDelete"
              >
                <template #icon>
                  <n-icon size="16"><TrashIcon /></n-icon>
                </template>
                Delete
              </n-button>
            </div>
          </div>
        </div>

        <div class="detail-body">
          <!-- Info grid -->
          <div class="detail-grid">
            <div class="detail-card">
              <h4>Account</h4>
              <div class="info-row">
                <span class="info-label">ID</span>
                <span class="info-value">#{{ user.id }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Role</span>
                <n-tag
                  size="tiny"
                  :type="user.role === 'admin' ? 'warning' : 'default'"
                >
                  {{ user.role }}
                </n-tag>
              </div>
              <div class="info-row">
                <span class="info-label">Status</span>
                <n-tag size="tiny" :type="user.isActive ? 'success' : 'error'">
                  {{ user.isActive ? "Active" : "Inactive" }}
                </n-tag>
              </div>
              <div class="info-row">
                <span class="info-label">Provider</span>
                <span class="info-value">{{ user.provider || "email" }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Email confirmed</span>
                <n-tag
                  size="tiny"
                  :type="user.emailConfirmedAt ? 'success' : 'warning'"
                >
                  {{
                    user.emailConfirmedAt
                      ? formatDate(user.emailConfirmedAt)
                      : "Pending"
                  }}
                </n-tag>
              </div>
              <div class="info-row">
                <span class="info-label">Profiles</span>
                <span class="info-value">{{ user.profiles || "—" }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Source</span>
                <span class="info-value">{{
                  user.preferredSource || "—"
                }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Created</span>
                <span class="info-value">{{ formatDate(user.createdAt) }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Updated</span>
                <span class="info-value">{{ formatDate(user.updatedAt) }}</span>
              </div>
            </div>

            <div class="detail-card">
              <h4>Usage & Credits</h4>
              <template v-if="user.usage">
                <div class="info-row">
                  <span class="info-label">Photos uploaded</span>
                  <span class="info-value">{{ user.photosCount }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Photos limit</span>
                  <span class="info-value">{{ user.usage.photosLimit }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Analyzed used</span>
                  <span class="info-value">{{
                    user.usage.analyzedPhotosUsed || 0
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
                    user.usage.creditsUsed || 0
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
              <template v-if="user.costHistory">
                <div class="info-row">
                  <span class="info-label">Total cost</span>
                  <span class="info-value cost-value">
                    €{{ user.costHistory.totalCostInEur?.toFixed(4) }}
                  </span>
                </div>
                <div v-if="user.costHistory.byCategory" class="cost-categories">
                  <div class="cost-category-header">
                    <span>Category</span>
                    <span>Cost</span>
                    <span>Calls</span>
                  </div>
                  <div
                    v-for="(val, key) in user.costHistory.byCategory"
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

            <div class="detail-card">
              <div class="detail-card-title-row">
                <h4>Payments</h4>
                <n-button size="tiny" quaternary @click="goToUserPayments">
                  View all
                </n-button>
              </div>
              <template v-if="user.paymentSummary">
                <div class="info-row">
                  <span class="info-label">Total paid</span>
                  <span class="info-value cost-value">
                    €{{ money(user.paymentSummary.totalPaidEur) }}
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Transactions</span>
                  <span class="info-value">
                    {{ user.paymentSummary.totalPayments }} total ·
                    {{ user.paymentSummary.completedPayments }} completed
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Pending / failed</span>
                  <span class="info-value">
                    {{ user.paymentSummary.pendingPayments }} /
                    {{ user.paymentSummary.failedPayments }}
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Refunded</span>
                  <span class="info-value">
                    €{{ money(user.paymentSummary.refundedEur) }} ·
                    {{ user.paymentSummary.refundedPayments }} tx
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Granted</span>
                  <span class="info-value">
                    {{ user.paymentSummary.analyzedPhotosGranted }} analyzed ·
                    {{ user.paymentSummary.creditsGranted }} credits
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Last payment</span>
                  <span class="info-value">
                    {{ formatDate(user.paymentSummary.lastPaymentAt) }}
                  </span>
                </div>
              </template>
              <p v-else class="no-data">No payment data</p>
            </div>
          </div>

          <!-- Activity Log Card -->
          <div class="activity-card">
            <div class="activity-card-header">
              <h4>Activity Log</h4>
              <div class="activity-controls">
                <span class="activity-live-badge">● LIVE</span>
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
                  <template #icon>
                    <n-icon size="14"><RefreshIcon /></n-icon>
                  </template>
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
                    v-if="
                      act.type === 'chat_message' &&
                      act.metadata &&
                      (act.metadata.question || act.metadata.answer)
                    "
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
          <!-- Photos Section -->
          <div class="photos-section">
            <button class="photos-section-toggle" @click="togglePhotos">
              <span class="photos-section-title">
                Photos
                <span class="photos-section-count">
                  {{ user.photosCount }}
                </span>
              </span>
              <n-icon
                size="16"
                :style="{
                  transform: photosExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  color: '#94a3b8',
                }"
              >
                <ChevronDownIcon />
              </n-icon>
            </button>

            <div v-if="photosExpanded" class="photos-section-body">
              <div v-if="photosLoading" class="photos-loading">
                <n-spin size="small" />
              </div>
              <div v-else-if="photosError" class="photos-empty">
                Failed to load photos.
              </div>
              <div v-else-if="userPhotos.length === 0" class="photos-empty">
                No photos found.
              </div>
              <div v-else class="user-photos-grid">
                <div
                  v-for="photo in userPhotos"
                  :key="photo.id"
                  class="user-photo-thumb-wrap"
                  :title="photo.originalFileName ?? String(photo.id)"
                >
                  <img
                    :src="photo.thumbnailUrl"
                    :alt="photo.originalFileName ?? String(photo.id)"
                    class="user-photo-thumb"
                    loading="lazy"
                  />
                  <span class="user-photo-id">#{{ photo.id }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <p>User not found</p>
      <n-button size="small" @click="goBack">Back to users</n-button>
    </div>

    <!-- Delete confirmation modal -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" type="error">
      <template #header>Delete User</template>
      <p>
        Are you sure you want to delete
        <strong>{{ user?.name }}</strong> ({{ user?.email }})? This will
        soft-delete all their photos and permanently remove the account.
      </p>
      <n-checkbox v-model:checked="runSchedulerNow" style="margin-top: 12px">
        Run deletion scheduler immediately
      </n-checkbox>
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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NTag,
  NIcon,
  NSelect,
  NAvatar,
  NModal,
  NSpin,
  NInputNumber,
  NPagination,
  NCheckbox,
  useMessage,
} from "naive-ui";
import {
  ArrowBackOutline as ArrowBackIcon,
  TrashOutline as TrashIcon,
  BanOutline as BanIcon,
  CheckmarkCircleOutline as ActivateIcon,
  RefreshOutline as RefreshIcon,
  PersonOutline as ImpersonateIcon,
  ChevronDownOutline as ChevronDownIcon,
} from "@vicons/ionicons5";
import { api } from "../../utils/axios";

interface UserDetail {
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
  paymentSummary?: PaymentSummary | null;
}

interface PaymentSummary {
  totalPayments: number;
  completedPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  totalPaidEur: number;
  refundedEur: number;
  photosGranted: number;
  analyzedPhotosGranted: number;
  creditsGranted: number;
  lastPaymentAt: string | null;
}

interface ActivityItem {
  id: number;
  type: string;
  action: string;
  description: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  _expanded?: boolean;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();

const user = ref<UserDetail | null>(null);
const loading = ref(true);

const showDeleteModal = ref(false);
const runSchedulerNow = ref(false);
const deleting = ref(false);
const savingUsage = ref(false);
const impersonating = ref(false);

const editUsage = ref({
  analyzedPhotosLimit: 0,
  creditsAvailable: 0,
});

// ─── Activity Log ───
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
  { label: "Photo upload", value: "photos_uploaded" },
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
  { label: "Filter / Sort", value: "filter_apply" },
  { label: "Navigation", value: "ui_action" },
];

let activityRefreshTimer: ReturnType<typeof setInterval> | null = null;

function goBack() {
  router.push({ name: "admin-users" });
}

function goToUserPayments() {
  if (!user.value) return;
  router.push({ name: "admin-payments", query: { userId: user.value.id } });
}

const usageChanged = computed(() => {
  if (!user.value?.usage) return false;
  return (
    editUsage.value.analyzedPhotosLimit !==
      user.value.usage.analyzedPhotosLimit ||
    editUsage.value.creditsAvailable !== user.value.usage.creditsAvailable
  );
});

async function fetchUser() {
  loading.value = true;
  try {
    const { data } = await api.get(`/api/admin/users/${route.params.id}`);
    user.value = data.user;
    editUsage.value = {
      analyzedPhotosLimit: data.user.usage?.analyzedPhotosLimit ?? 0,
      creditsAvailable: data.user.usage?.creditsAvailable ?? 0,
    };
  } catch {
    message.error("Failed to load user details");
    user.value = null;
  } finally {
    loading.value = false;
  }
}

async function fetchActivities(page: number = 1) {
  if (!user.value) return;
  activitiesLoading.value = true;
  try {
    const params: Record<string, any> = { page, limit: 30 };
    if (activityFilter.value) params.type = activityFilter.value;
    const { data } = await api.get(
      `/api/admin/users/${user.value.id}/activities`,
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

async function impersonateUser() {
  if (!user.value) return;
  impersonating.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/users/${user.value.id}/impersonate`,
    );
    const appUrl = `${window.location.origin}/auth/callback?token=${encodeURIComponent(data.token)}`;

    // Try to open directly in Microsoft Edge using the ms-edge protocol (Windows only).
    // This avoids losing the current session since it launches a separate browser.
    const edgeUrl = `microsoft-edge:${appUrl}`;
    window.location.href = edgeUrl;

    // Copy URL to clipboard regardless, as fallback if Edge isn't installed
    try {
      await navigator.clipboard.writeText(appUrl);
      message.success(
        `Opening in Edge as ${data.userName}. Link also copied — paste in another browser if Edge didn't open.`,
        { duration: 7000 },
      );
    } catch {
      message.info(
        `Link ready for ${data.userName}. Paste it in Edge or incognito. (Token valid 2h)`,
      );
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to impersonate user";
    message.error(msg);
  } finally {
    impersonating.value = false;
  }
}

async function toggleActive() {
  if (!user.value) return;
  try {
    await api.patch(`/api/admin/users/${user.value.id}/toggle-active`);
    message.success(
      `User ${user.value.isActive ? "deactivated" : "activated"} successfully`,
    );
    await fetchUser();
  } catch {
    message.error("Failed to update user status");
  }
}

function promptDelete() {
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!user.value) return;
  deleting.value = true;
  try {
    await api.delete(`/api/admin/users/${user.value.id}`, {
      params: { runSchedulerNow: runSchedulerNow.value },
    });
    message.success("User deleted successfully");
    showDeleteModal.value = false;
    runSchedulerNow.value = false;
    router.push({ name: "admin-users" });
  } catch (err: any) {
    const msg = err?.response?.data?.message || "Failed to delete user";
    message.error(msg);
  } finally {
    deleting.value = false;
  }
}

async function saveUsage() {
  if (!user.value) return;
  savingUsage.value = true;
  try {
    const { data } = await api.put(
      `/api/admin/users/${user.value.id}/usage`,
      editUsage.value,
    );
    message.success("Usage updated");
    if (user.value.usage) {
      user.value.usage.analyzedPhotosLimit = data.usage.analyzedPhotosLimit;
      user.value.usage.creditsAvailable = data.usage.creditsAvailable;
    }
  } catch {
    message.error("Failed to update usage");
  } finally {
    savingUsage.value = false;
  }
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

function activityColor(type: string): string {
  if (type.startsWith("search_")) return "dot-blue";
  if (type === "chat_message") return "dot-amber";
  if (type.includes("delete")) return "dot-red";
  if (type.startsWith("photo_") || type === "photos_uploaded")
    return "dot-green";
  if (type === "portfolio_build" || type === "view_3d") return "dot-purple";
  if (type === "ui_action" || type === "filter_apply" || type === "photo_rank")
    return "dot-gray";
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

function money(value: number | null | undefined): string {
  return Number(value || 0).toFixed(2);
}

function userInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Photos section ───
const photosExpanded = ref(false);
const photosLoading = ref(false);
const photosError = ref(false);
const userPhotos = ref<
  { id: number; thumbnailUrl: string; originalFileName: string | null }[]
>([]);

async function togglePhotos() {
  photosExpanded.value = !photosExpanded.value;
  if (
    photosExpanded.value &&
    userPhotos.value.length === 0 &&
    !photosLoading.value
  ) {
    photosLoading.value = true;
    photosError.value = false;
    try {
      const { data } = await api.get(
        `/api/admin/users/${user.value!.id}/photos`,
      );
      userPhotos.value = data.photos;
    } catch {
      photosError.value = true;
    } finally {
      photosLoading.value = false;
    }
  }
}

onMounted(async () => {
  await fetchUser();
  if (user.value) {
    fetchActivities(1);
    activityRefreshTimer = setInterval(
      () => fetchActivities(activityPage.value),
      20000,
    );
  }
});

onUnmounted(() => {
  if (activityRefreshTimer) clearInterval(activityRefreshTimer);
});
</script>

<style scoped>
.admin-section {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  padding: 0 !important;
  margin-bottom: 16px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #6366f1;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.back-btn:hover {
  background: #f1f5f9;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}

.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #94a3b8;
}

/* ===== Detail Panel ===== */
.detail-panel {
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

.header-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.detail-body {
  padding: 20px 24px 24px;
}

/* ===== Detail Grid ===== */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

.detail-card {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 16px 18px;
  min-width: 0;
}

.detail-card h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.detail-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.detail-card-title-row h4 {
  margin: 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
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
  flex-shrink: 0;
}

.info-value {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
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
  max-height: 500px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: #e2e8f0 transparent;
}

.activity-timeline::-webkit-scrollbar {
  width: 4px;
}

.activity-timeline::-webkit-scrollbar-track {
  background: transparent;
}

.activity-timeline::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 4px;
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

/* ===== Responsive ===== */
@media (max-width: 900px) {
  .admin-section {
    padding: 0 4px;
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

  .detail-title-row {
    flex-wrap: wrap;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 480px) {
  .detail-title-info h2 {
    font-size: 16px;
  }

  .info-row {
    gap: 10px;
  }

  .info-label,
  .info-value {
    font-size: 12px;
  }
}

/* ===== Photos section ===== */
.photos-section {
  margin-top: 16px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
}

.photos-section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  cursor: pointer;
  padding: 14px 18px;
  text-align: left;
  transition: background 0.15s;
}

.photos-section-toggle:hover {
  background: #f1f5f9;
}

.photos-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.photos-section-count {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #6366f1;
  border-radius: 10px;
  padding: 1px 7px;
  letter-spacing: 0;
  text-transform: none;
}

.photos-section-body {
  border-top: 1px solid #f1f5f9;
  padding: 14px 18px 18px;
}

.photos-loading,
.photos-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

.user-photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 540px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e2e8f0 transparent;
}

.user-photos-grid::-webkit-scrollbar {
  width: 4px;
}

.user-photos-grid::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 4px;
}

.user-photo-thumb-wrap {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: #e8ecf0;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.user-photo-id {
  position: absolute;
  bottom: 2px;
  left: 3px;
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 1px 3px;
  line-height: 1.4;
}
</style>
