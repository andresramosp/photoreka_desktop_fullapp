<template>
  <div class="admin-section">
    <div class="section-header">
      <button class="back-btn" @click="goBack">
        <n-icon size="18"><ArrowBackIcon /></n-icon>
        <span>Back to users</span>
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <n-spin :size="56" />
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
                  <div class="editable-row-right">
                    <span
                      class="remaining-badge"
                      :class="
                        analyzedRemaining <= 0
                          ? 'remaining-empty'
                          : 'remaining-ok'
                      "
                    >
                      {{ analyzedRemaining }} left
                    </span>
                    <n-input-number
                      v-model:value="editUsage.analyzedPhotosLimit"
                      size="tiny"
                      :min="0"
                      :step="100"
                      style="width: 120px"
                    />
                  </div>
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
                  <div class="editable-row-right">
                    <span
                      class="remaining-badge"
                      :class="
                        creditsRemaining <= 0
                          ? 'remaining-empty'
                          : 'remaining-ok'
                      "
                    >
                      {{ creditsRemaining }} left
                    </span>
                    <n-input-number
                      v-model:value="editUsage.creditsAvailable"
                      size="tiny"
                      :min="0"
                      :step="100"
                      style="width: 120px"
                    />
                  </div>
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
              <template v-if="user.costSummary">
                <div class="info-row">
                  <span class="info-label">Total cost</span>
                  <span class="info-value cost-value">
                    €{{ user.costSummary.totalCostEur?.toFixed(4) }}
                  </span>
                </div>
                <div v-if="user.costSummary.byCategory" class="cost-categories">
                  <div class="cost-category-header">
                    <span>Category</span>
                    <span>Cost</span>
                    <span>Calls</span>
                  </div>
                  <div
                    v-for="(val, key) in user.costSummary.byCategory"
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

          <!-- Credit Ledger Card -->
          <div class="credits-card">
            <div class="credits-card-header">
              <h4>Credit Charges</h4>
              <div class="credits-controls">
                <n-select
                  v-model:value="creditCategoryFilter"
                  placeholder="All categories"
                  clearable
                  size="tiny"
                  style="width: 160px"
                  :options="creditCategoryOptions"
                  @update:value="fetchCreditLedger(1)"
                />
                <input
                  v-model="creditDateFrom"
                  type="date"
                  class="date-input"
                  @change="fetchCreditLedger(1)"
                />
                <input
                  v-model="creditDateTo"
                  type="date"
                  class="date-input"
                  @change="fetchCreditLedger(1)"
                />
                <n-button
                  size="tiny"
                  quaternary
                  :loading="creditsLoading"
                  @click="fetchCreditLedger(creditPage)"
                >
                  <template #icon>
                    <n-icon size="14"><RefreshIcon /></n-icon>
                  </template>
                </n-button>
              </div>
            </div>

            <!-- Summary KPIs -->
            <div v-if="creditSummary" class="credits-summary">
              <div class="credits-kpi">
                <span class="credits-kpi-label">Credits charged</span>
                <span class="credits-kpi-value primary">{{
                  creditSummary.totalCredits.toLocaleString()
                }}</span>
              </div>
              <div class="credits-kpi">
                <span class="credits-kpi-label">Raw cost (my side)</span>
                <span class="credits-kpi-value"
                  >€{{ creditSummary.totalCostEur.toFixed(4) }}</span
                >
              </div>
              <div v-if="creditSummary.totalCredits > 0" class="credits-kpi">
                <span class="credits-kpi-label">Est. billed EUR</span>
                <span class="credits-kpi-value"
                  >€{{ (creditSummary.totalCredits * 0.001).toFixed(4) }}</span
                >
              </div>
            </div>

            <div
              v-if="creditsLoading && creditRows.length === 0"
              class="credits-loading"
            >
              <n-spin :size="28" />
            </div>
            <div v-else-if="creditRows.length === 0" class="credits-empty">
              No credit charges recorded yet
            </div>
            <div v-else class="credits-table-wrap">
              <table class="credits-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Task</th>
                    <th>Model</th>
                    <th class="num">Credits</th>
                    <th class="num">Raw cost</th>
                    <th class="num">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in creditRows" :key="row.id">
                    <td class="dim">{{ formatDateTime(row.createdAt) }}</td>
                    <td>
                      <n-tag
                        size="tiny"
                        :bordered="false"
                        :type="creditCategoryTagType(row.category)"
                      >
                        {{ row.category }}
                      </n-tag>
                    </td>
                    <td class="dim">{{ row.task || "—" }}</td>
                    <td class="dim model-cell">{{ row.model || "—" }}</td>
                    <td class="num credits-val">{{ row.creditsCharged }}</td>
                    <td class="num dim">€{{ row.costInEur.toFixed(4) }}</td>
                    <td class="num dim">
                      {{
                        row.marginMultiplier != null
                          ? `×${row.marginMultiplier}`
                          : "fixed"
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="creditMeta && creditMeta.lastPage > 1"
              class="credits-pagination"
            >
              <n-pagination
                v-model:page="creditPage"
                :page-size="creditMeta.perPage"
                :item-count="creditMeta.total"
                size="small"
                @update:page="fetchCreditLedger"
              />
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
              <n-spin :size="28" />
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
                <n-spin :size="28" />
              </div>
              <div v-else-if="photosError" class="photos-empty">
                Failed to load photos.
              </div>
              <div v-else-if="userPhotos.length === 0" class="photos-empty">
                No photos found.
              </div>
              <div v-else>
                <div
                  class="photos-tabs"
                  role="tablist"
                  aria-label="Photo groups"
                >
                  <button
                    class="photos-tab"
                    :class="{
                      'photos-tab-active': activePhotosTab === 'workspace',
                    }"
                    role="tab"
                    :aria-selected="activePhotosTab === 'workspace'"
                    @click="activePhotosTab = 'workspace'"
                  >
                    Workspace
                    <span class="photos-tab-count">{{
                      workspacePhotos.length
                    }}</span>
                  </button>
                  <button
                    class="photos-tab"
                    :class="{
                      'photos-tab-active': activePhotosTab === 'lightbox',
                    }"
                    role="tab"
                    :aria-selected="activePhotosTab === 'lightbox'"
                    @click="activePhotosTab = 'lightbox'"
                  >
                    Lightbox
                    <span class="photos-tab-count">{{
                      lightboxPhotos.length
                    }}</span>
                  </button>
                </div>

                <div v-if="activePhotos.length === 0" class="photos-empty">
                  {{
                    activePhotosTab === "workspace"
                      ? "No analyzed photos (processed)."
                      : "No un-analyzed photos (uploaded)."
                  }}
                </div>
                <div v-else class="user-photos-grid">
                  <div
                    v-for="photo in activePhotos"
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
          <!-- Deleted Photos Section -->
          <div class="photos-section deleted-photos-section">
            <button class="photos-section-toggle" @click="toggleDeletedPhotos">
              <span class="photos-section-title">
                Deleted photos
                <span class="photos-section-count">
                  {{ deletedCountLabel }}
                </span>
              </span>
              <n-icon
                size="16"
                :style="{
                  transform: deletedPhotosExpanded
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  color: '#94a3b8',
                }"
              >
                <ChevronDownIcon />
              </n-icon>
            </button>

            <div v-if="deletedPhotosExpanded" class="photos-section-body">
              <div v-if="deletedPhotosLoading" class="photos-loading">
                <n-spin :size="28" />
              </div>
              <div v-else-if="deletedPhotosError" class="photos-empty">
                Failed to load deleted photos.
              </div>
              <div v-else-if="deletedPhotos.length === 0" class="photos-empty">
                No deleted photos.
              </div>
              <div v-else>
                <div class="deleted-photos-controls">
                  <n-checkbox
                    :checked="deletedAllSelected"
                    @update:checked="selectAllDeleted"
                  >
                    Select all
                  </n-checkbox>
                  <div class="deleted-photos-actions">
                    <span class="deleted-selected-count">
                      {{ deletedSelectedIds.length }} selected
                    </span>
                    <n-button
                      size="small"
                      type="success"
                      :disabled="deletedSelectedIds.length === 0"
                      :loading="deletedRestoring"
                      @click="restoreDeletedPhotos"
                    >
                      Restore selected
                    </n-button>
                  </div>
                </div>
                <div class="user-photos-grid deleted-photos-grid">
                  <div
                    v-for="photo in deletedPhotos"
                    :key="photo.id"
                    class="user-photo-thumb-wrap deleted-photo-thumb-wrap"
                    :class="{
                      'deleted-photo-selected': isDeletedSelected(photo.id),
                    }"
                    :title="`${photo.originalFileName ?? String(photo.id)} | Deleted ${formatDate(photo.deletedAt)}`"
                    @click="toggleDeletedSelection(photo.id)"
                  >
                    <img
                      v-if="photo.thumbnailUrl"
                      :src="photo.thumbnailUrl"
                      :alt="photo.originalFileName ?? String(photo.id)"
                      class="user-photo-thumb"
                      loading="lazy"
                    />
                    <div v-else class="deleted-photo-missing">No thumbnail</div>
                    <span class="user-photo-id">#{{ photo.id }}</span>
                    <span class="deleted-photo-meta">
                      Delete in
                      {{ formatDeletionCountdown(photo.timeRemainingMs) }}
                    </span>
                    <span
                      v-if="isDeletedSelected(photo.id)"
                      class="deleted-photo-check"
                    >
                      Selected
                    </span>
                  </div>
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
  NSpin,
  NAvatar,
  NModal,
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
  deletedPhotosCount: number;
  totalCostEur: number;
  usage: any;
  costSummary: {
    totalCostEur: number;
    byCategory: Record<string, { costInEur: number; calls: number }>;
  } | null;
  avatar?: string | null;
  googleId?: string | null;
  catalogPatterns?: any;
  paymentSummary?: PaymentSummary | null;
}

interface DeletedPhotoItem {
  id: number;
  thumbnailUrl: string | null;
  originalFileName: string | null;
  deletedAt: string;
  retentionEndsAt: string;
  timeRemainingMs: number;
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

interface CreditLedgerRow {
  id: number;
  category: string;
  task: string | null;
  model: string | null;
  costInEur: number;
  creditsCharged: number;
  marginMultiplier: number | null;
  referenceId: string | null;
  createdAt: string;
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

// ─── Credit Ledger ───
interface CreditMeta {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}

const creditRows = ref<CreditLedgerRow[]>([]);
const creditsLoading = ref(false);
const creditPage = ref(1);
const creditMeta = ref<CreditMeta | null>(null);
const creditSummary = ref<{
  totalCredits: number;
  totalCostEur: number;
} | null>(null);
const creditCategoryFilter = ref<string | null>(null);
const creditDateFrom = ref<string>("");
const creditDateTo = ref<string>("");

const creditCategoryOptions = [
  { label: "Chat", value: "chat" },
  { label: "Search", value: "search" },
  { label: "Portfolio build", value: "portfolio_build" },
  { label: "Location inference", value: "location_inference" },
  { label: "Photo analysis", value: "photo_analysis" },
  { label: "Report review", value: "report_review" },
  { label: "Other", value: "other" },
];

function creditCategoryTagType(
  category: string,
): "default" | "info" | "success" | "warning" | "error" {
  if (category === "chat") return "warning";
  if (category === "search") return "info";
  if (category === "portfolio_build") return "success";
  if (category === "location_inference") return "info";
  if (category === "photo_analysis") return "default";
  return "default";
}

async function fetchCreditLedger(page: number = 1) {
  if (!user.value) return;
  creditsLoading.value = true;
  try {
    const params: Record<string, any> = { page, limit: 30 };
    if (creditCategoryFilter.value)
      params.category = creditCategoryFilter.value;
    if (creditDateFrom.value) params.dateFrom = creditDateFrom.value;
    if (creditDateTo.value) params.dateTo = creditDateTo.value;
    const { data } = await api.get(
      `/api/admin/users/${user.value.id}/credit-ledger`,
      { params },
    );
    creditRows.value = data.rows;
    creditMeta.value = data.meta;
    creditSummary.value = data.summary;
    creditPage.value = page;
  } catch {
    message.error("Failed to load credit ledger");
  } finally {
    creditsLoading.value = false;
  }
}

function goBack() {
  router.push({ name: "admin-users" });
}

function goToUserPayments() {
  if (!user.value) return;
  router.push({ name: "admin-payments", query: { userId: user.value.id } });
}

const analyzedRemaining = computed(() => {
  if (!user.value?.usage) return 0;
  return (
    editUsage.value.analyzedPhotosLimit -
    (user.value.usage.analyzedPhotosUsed || 0)
  );
});

const creditsRemaining = computed(() => {
  if (!user.value?.usage) return 0;
  return editUsage.value.creditsAvailable - (user.value.usage.creditsUsed || 0);
});

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
const activePhotosTab = ref<"workspace" | "lightbox">("workspace");
const userPhotos = ref<
  {
    id: number;
    thumbnailUrl: string;
    originalFileName: string | null;
    status: "processed" | "uploaded";
  }[]
>([]);

const workspacePhotos = computed(() =>
  userPhotos.value.filter((photo) => photo.status === "processed"),
);

const lightboxPhotos = computed(() =>
  userPhotos.value.filter((photo) => photo.status === "uploaded"),
);

const activePhotos = computed(() =>
  activePhotosTab.value === "workspace"
    ? workspacePhotos.value
    : lightboxPhotos.value,
);

async function fetchUserPhotos() {
  if (!user.value) return;
  photosLoading.value = true;
  photosError.value = false;
  try {
    const { data } = await api.get(`/api/admin/users/${user.value.id}/photos`);
    userPhotos.value = (data.photos || []).map((photo: any) => ({
      ...photo,
      status: photo.status === "uploaded" ? "uploaded" : "processed",
    }));
  } catch {
    photosError.value = true;
  } finally {
    photosLoading.value = false;
  }
}

async function togglePhotos() {
  photosExpanded.value = !photosExpanded.value;
  if (
    photosExpanded.value &&
    userPhotos.value.length === 0 &&
    !photosLoading.value
  ) {
    await fetchUserPhotos();
  }
}

// ─── Deleted photos section ───
const deletedPhotosExpanded = ref(false);
const deletedPhotosLoading = ref(false);
const deletedPhotosError = ref(false);
const deletedPhotos = ref<DeletedPhotoItem[]>([]);
const deletedSelectedIds = ref<number[]>([]);
const deletedRestoring = ref(false);

const deletedCountLabel = computed(
  () => user.value?.deletedPhotosCount ?? deletedPhotos.value.length,
);

const deletedAllSelected = computed(
  () =>
    deletedPhotos.value.length > 0 &&
    deletedSelectedIds.value.length === deletedPhotos.value.length,
);

function isDeletedSelected(id: number): boolean {
  return deletedSelectedIds.value.includes(id);
}

function toggleDeletedSelection(id: number) {
  const set = new Set(deletedSelectedIds.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  deletedSelectedIds.value = Array.from(set);
}

function selectAllDeleted(checked: boolean) {
  if (checked) {
    deletedSelectedIds.value = deletedPhotos.value.map((photo) => photo.id);
  } else {
    deletedSelectedIds.value = [];
  }
}

function formatDeletionCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function fetchDeletedPhotos() {
  if (!user.value) return;
  deletedPhotosLoading.value = true;
  deletedPhotosError.value = false;
  try {
    const { data } = await api.get(
      `/api/admin/users/${user.value.id}/deleted-photos`,
    );
    deletedPhotos.value = data.photos;
    if (user.value) {
      user.value.deletedPhotosCount = data.photos.length;
    }
    deletedSelectedIds.value = [];
  } catch {
    deletedPhotosError.value = true;
  } finally {
    deletedPhotosLoading.value = false;
  }
}

async function toggleDeletedPhotos() {
  deletedPhotosExpanded.value = !deletedPhotosExpanded.value;
  if (
    deletedPhotosExpanded.value &&
    deletedPhotos.value.length === 0 &&
    !deletedPhotosLoading.value
  ) {
    await fetchDeletedPhotos();
  }
}

async function restoreDeletedPhotos() {
  if (!user.value || deletedSelectedIds.value.length === 0) return;
  deletedRestoring.value = true;
  try {
    const { data } = await api.post(
      `/api/admin/users/${user.value.id}/restore-deleted-photos`,
      { ids: deletedSelectedIds.value },
    );
    const restoredIds = data.restoredIds || [];
    if (restoredIds.length > 0) {
      const restoredSet = new Set(restoredIds);
      deletedPhotos.value = deletedPhotos.value.filter(
        (photo) => !restoredSet.has(photo.id),
      );
      deletedSelectedIds.value = [];
      if (user.value) {
        user.value.deletedPhotosCount = Math.max(
          0,
          user.value.deletedPhotosCount - restoredIds.length,
        );
      }
      if (photosExpanded.value) {
        await fetchUserPhotos();
      }
      message.success(`Restored ${restoredIds.length} photo(s)`);
    } else {
      message.info("No photos restored");
    }
  } catch {
    message.error("Failed to restore photos");
  } finally {
    deletedRestoring.value = false;
  }
}

onMounted(async () => {
  await fetchUser();
  if (user.value) {
    fetchActivities(1);
    fetchCreditLedger(1);
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
  /* max-width: 1200px; */
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

.editable-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remaining-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.remaining-ok {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.remaining-empty {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
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

/* ===== Credit Ledger ===== */
.credits-card {
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  padding: 20px 24px;
  margin-top: 16px;
}

.credits-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 8px;
}

.credits-card-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.credits-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.credits-summary {
  display: flex;
  gap: 24px;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 8px;
  flex-wrap: wrap;
}

.credits-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.credits-kpi-label {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.credits-kpi-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.credits-kpi-value.primary {
  color: #6366f1;
}

.credits-loading,
.credits-empty {
  text-align: center;
  padding: 32px 0;
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
}

.credits-table-wrap {
  overflow-x: auto;
}

.credits-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.credits-table th {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 6px 8px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
  text-align: left;
}

.credits-table th.num,
.credits-table td.num {
  text-align: right;
}

.credits-table td {
  padding: 7px 8px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  white-space: nowrap;
}

.credits-table tr:last-child td {
  border-bottom: none;
}

.credits-val {
  font-weight: 700;
  color: #6366f1;
  font-variant-numeric: tabular-nums;
}

.model-cell {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dim {
  color: #94a3b8;
}

.credits-pagination {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}

.date-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  color: #334155;
  background: #fff;
  outline: none;
  width: 130px;
}

.date-input:focus {
  border-color: #6366f1;
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

.photos-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  margin-bottom: 12px;
}

.photos-tab {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.photos-tab:hover {
  background: #f8fafc;
}

.photos-tab-active {
  background: #eef2ff;
  color: #4338ca;
}

.photos-tab-count {
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: inherit;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 999px;
  padding: 3px 6px;
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

/* ===== Deleted photos ===== */
.deleted-photos-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.deleted-photos-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.deleted-selected-count {
  font-size: 12px;
  color: #64748b;
}

.deleted-photo-thumb-wrap {
  cursor: pointer;
  border: 2px solid transparent;
}

.deleted-photo-selected {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35);
}

.deleted-photo-meta {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 3px;
  padding: 1px 4px;
  line-height: 1.4;
}

.deleted-photo-check {
  position: absolute;
  top: 3px;
  right: 3px;
  font-size: 9px;
  color: #fff;
  background: rgba(34, 197, 94, 0.9);
  border-radius: 3px;
  padding: 1px 4px;
  line-height: 1.4;
}

.deleted-photo-missing {
  font-size: 10px;
  color: #94a3b8;
}
</style>
