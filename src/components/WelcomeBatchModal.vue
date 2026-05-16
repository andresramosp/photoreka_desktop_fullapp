<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="wbm-overlay" @click.self="dismiss">
        <div class="wbm-modal">
          <!-- Header -->
          <div class="wbm-header">
            <!-- <div class="wbm-logo-row">
              <AppLogo layout="horizontal" size="tiny" />
            </div> -->
            <h2 class="wbm-title">Welcome to Photoreka!</h2>
            <p class="wbm-subtitle">
              Photoreka is designed to work with
              <strong>large photo collections</strong>. The more photos you
              upload, the more powerful the experience becomes. Import a
              significant portion of your archive to unlock the full potential
              of every tool.
            </p>
          </div>

          <!-- Legend -->
          <div class="wbm-legend">
            <span class="wbm-legend-item"
              ><span class="wbm-status wbm-ok">✓</span> Works great</span
            >
            <span class="wbm-legend-item"
              ><span class="wbm-status wbm-maybe">?</span> Limited value</span
            >
            <span class="wbm-legend-item"
              ><span class="wbm-status wbm-no">✗</span> Not useful yet</span
            >
          </div>

          <!-- Feature Table -->
          <div class="wbm-table-wrapper">
            <table class="wbm-table">
              <thead>
                <tr>
                  <th class="wbm-th-photos">Photos</th>
                  <th class="wbm-th-profile">Usage Profile</th>
                  <th v-for="f in features" :key="f.key" class="wbm-th-feature">
                    <span class="wbm-feature-icon">
                      <n-icon :size="16"><component :is="f.icon" /></n-icon>
                    </span>
                    <span class="wbm-feature-label">{{ f.label }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(tier, i) in tiers"
                  :key="tier.range"
                  :class="{ 'wbm-row-highlight': i === tiers.length - 1 }"
                >
                  <td class="wbm-td-photos">
                    <span class="wbm-photo-count">{{ tier.range }}</span>
                  </td>
                  <td class="wbm-td-profile">
                    <span
                      class="wbm-profile-badge"
                      :style="{ background: tier.color }"
                    >
                      {{ tier.profile }}
                    </span>
                  </td>
                  <td v-for="f in features" :key="f.key" class="wbm-td-status">
                    <span
                      class="wbm-status"
                      :class="statusClass(tier.statuses[f.key])"
                    >
                      {{ statusIcon(tier.statuses[f.key]) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Analysis capacity -->
          <div v-if="analyzedPhotosLimit !== null" class="wbm-capacity-row">
            <div class="wbm-card wbm-card-quota">
              <span class="wbm-capacity-free-badge">Welcome Pack</span>
              <div class="wbm-capacity-info">
                <span class="wbm-capacity-number">{{
                  analyzedPhotosLimit.toLocaleString()
                }}</span>
                <span class="wbm-capacity-desc"
                  >photos included for AI analysis</span
                >
              </div>
              <router-link
                to="/settings"
                class="wbm-capacity-upgrade"
                @click="dismiss"
              >
                Need more? Upgrade &rarr;
              </router-link>
            </div>
            <div class="wbm-card wbm-card-upload">
              <p class="wbm-upload-hint">Ready to get started?</p>
              <button class="wbm-btn-primary" @click="goUpload">
                Upload Your First Batch
              </button>
              <!-- <button class="wbm-btn-maybe" @click="dismiss">
                Maybe later
              </button> -->
            </div>
          </div>

          <!-- Don't show again -->
          <div class="wbm-footer">
            <label class="wbm-checkbox-label" @click.stop>
              <input
                type="checkbox"
                v-model="dontShowAgain"
                class="wbm-checkbox"
              />
              <span>Don't show this again</span>
            </label>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { NIcon } from "naive-ui";
import { useUserStore } from "../stores/userStore";
import AppLogo from "./AppLogo.vue";
import {
  SearchOutline,
  BriefcaseOutline,
  ListOutline,
  CubeOutline,
  AnalyticsOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";

const userStore = useUserStore();
const analyzedPhotosLimit = computed(
  () => userStore.user?.usage?.analyzedPhotosLimit ?? null,
);

const props = defineProps({
  show: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const router = useRouter();
const visible = ref(false);
const dontShowAgain = ref(false);

const STORAGE_KEY = "welcome-batch-modal-dismissed";

watch(
  () => props.show,
  (val) => {
    visible.value = val;
  },
  { immediate: true },
);

const features = [
  // { key: "framer", label: "Framer", icon: FramerIcon },
  { key: "search", label: "Search", icon: SearchOutline },
  // { key: "canvas", label: "Canvas", icon: CanvasIcon },
  { key: "chat", label: "ChatLab AI", icon: RobotOutlined },
  { key: "portfolios", label: "Portfolios", icon: BriefcaseOutline },
  { key: "collections_series", label: "Series", icon: ListOutline },
  { key: "atlas", label: "2D/3D Atlas", icon: CubeOutline },
  { key: "report", label: "Patterns", icon: AnalyticsOutline },
];

const tiers = [
  {
    range: "< 50",
    profile: "Casual single-photo use",
    color: "rgba(239, 68, 68, 0.25)",
    statuses: {
      framer: "ok",
      search: "maybe",
      collections_series: "no",
      portfolios: "no",
      canvas: "maybe",
      atlas: "no",
      report: "no",
      chat: "maybe",
    },
  },
  {
    range: "50 – 500",
    profile: "Catalog subset exploration",
    color: "rgba(245, 158, 11, 0.25)",
    statuses: {
      framer: "ok",
      search: "ok",
      collections_series: "maybe",
      portfolios: "maybe",
      canvas: "ok",
      atlas: "maybe",
      report: "maybe",
      chat: "ok",
    },
  },
  {
    range: "500 – 2k",
    profile: "Meaningful collection work",
    color: "rgba(6, 182, 212, 0.25)",
    statuses: {
      framer: "ok",
      search: "ok",
      collections_series: "ok",
      portfolios: "ok",
      canvas: "ok",
      atlas: "maybe",
      report: "maybe",
      chat: "ok",
    },
  },
  {
    range: "2k+",
    profile: "Deep archive analysis",
    color: "rgba(34, 197, 94, 0.25)",
    statuses: {
      framer: "ok",
      search: "ok",
      collections_series: "ok",
      portfolios: "ok",
      canvas: "ok",
      atlas: "ok",
      report: "ok",
      chat: "ok",
    },
  },
  // {
  //   range: "5k+",
  //   profile: "Full professional suite",
  //   color: "rgba(99, 102, 241, 0.3)",
  //   statuses: {
  //     framer: "ok",
  //     search: "ok",
  //     collections_series: "ok",
  //     canvas: "ok",
  //     atlas: "ok",
  //     report: "ok",
  //     chat: "ok",
  //   },
  // },
];

const statusClass = (s) => ({
  "wbm-ok": s === "ok",
  "wbm-maybe": s === "maybe",
  "wbm-no": s === "no",
});
const statusIcon = (s) => (s === "ok" ? "✓" : s === "maybe" ? "?" : "✗");

const dismiss = () => {
  if (dontShowAgain.value) {
    localStorage.setItem(STORAGE_KEY, "true");
  }
  visible.value = false;
  emit("close");
};

const goUpload = () => {
  if (dontShowAgain.value) {
    localStorage.setItem(STORAGE_KEY, "true");
  }
  visible.value = false;
  emit("close");
  router.push({ name: "sync-area", hash: "#upload" });
};
</script>

<style scoped>
/* Overlay */
.wbm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay, rgba(0, 0, 0, 0.6));
  backdrop-filter: blur(4px);
  padding: 16px;
}

/* Modal */
.wbm-modal {
  background: var(--bg-container, #1a1a1f);
  border: 1px solid var(--border-color, #2c2c32);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
  max-width: 860px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px 32px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header */
.wbm-header {
  text-align: center;
}

.wbm-logo-row {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.wbm-title {
  margin: 0;
  font-size: var(--font-size-2xl, 24px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
}

.wbm-subtitle {
  margin: 8px auto 0;
  max-width: 800px;
  font-size: var(--font-size-base, 14px);
  line-height: 1.6;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-subtitle strong {
  color: var(--accent-color, #2563eb);
  font-weight: var(--font-weight-semibold, 600);
}

/* Table wrapper */
.wbm-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--border-color, #2c2c32);
}

/* Table */
.wbm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm, 12px);
  white-space: nowrap;
}

.wbm-table thead {
  background: var(--bg-surface, #2c2c32);
}

.wbm-table th {
  padding: 10px 8px;
  text-align: center;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color, #2c2c32);
}

.wbm-th-photos,
.wbm-th-profile {
  text-align: left;
  padding-left: 14px;
}

.wbm-th-feature {
  display: table-cell;
}

.wbm-feature-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 2px;
}

.wbm-feature-label {
  display: block;
  font-size: 10px;
}

.wbm-table tbody tr {
  transition: background var(--transition-fast, 0.2s ease);
}

.wbm-table tbody tr:hover {
  background: var(--primary-05, rgba(37, 99, 235, 0.05));
}

.wbm-table td {
  padding: 10px 8px;
  text-align: center;
  border-bottom: 1px solid var(--border-color, #2c2c32);
}

.wbm-table tbody tr:last-child td {
  border-bottom: none;
}

.wbm-td-photos {
  text-align: left;
  padding-left: 14px;
}

.wbm-photo-count {
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
  font-size: 13px;
}

.wbm-td-profile {
  text-align: left;
  padding-left: 14px;
}

.wbm-profile-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: 11px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
  white-space: nowrap;
}

/* Status icons */
.wbm-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-round, 50%);
  font-size: 13px;
  font-weight: var(--font-weight-bold, 700);
}

.wbm-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.wbm-maybe {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.wbm-no {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* Highlighted last row */
.wbm-row-highlight {
  background: var(--primary-05, rgba(37, 99, 235, 0.05));
}

/* Legend */
.wbm-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.wbm-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs, 10px);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-legend-item .wbm-status {
  width: 18px;
  height: 18px;
  font-size: 10px;
}

/* Analysis capacity row */
.wbm-capacity-row {
  display: flex;
  gap: 12px;
}

.wbm-card {
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--border-color, #2c2c32);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.wbm-card-quota {
  flex: 1;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(37, 99, 235, 0) 55%),
    var(--bg-surface, #2c2c32);
}

.wbm-card-upload {
  flex: 1;
  background: var(--bg-surface, #2c2c32);
  justify-content: center;
}

.wbm-upload-hint {
  margin: 0;
  font-size: var(--font-size-sm, 12px);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-capacity-free-badge {
  font-size: 10px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--accent-color, #2563eb);
  background: rgba(37, 99, 235, 0.12);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 999px;
  padding: 3px 10px;
}

.wbm-capacity-info {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
}

.wbm-capacity-number {
  font-size: var(--font-size-2xl, 24px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
  line-height: 1;
}

.wbm-capacity-desc {
  font-size: var(--font-size-sm, 12px);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-capacity-upgrade {
  font-size: var(--font-size-xs, 10px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--accent-color, rgba(255, 255, 255, 0.3));
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease;
}

.wbm-capacity-upgrade:hover {
  color: var(--accent-color, #2563eb);
}

.wbm-btn-maybe {
  background: none;
  border: none;
  padding: 4px 8px;
  color: var(--text-tertiary, rgba(255, 255, 255, 0.25));
  font-size: var(--font-size-xs, 10px);
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s ease;
}

.wbm-btn-maybe:hover {
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-btn-primary {
  flex-shrink: 0;
  width: min(100%, 340px);
  padding: 12px 32px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: var(--accent-color, #2563eb);
  color: var(--text-on-accent, #fff);
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.2s ease),
    transform 0.1s ease;
  font-family: inherit;
}

/* .wbm-btn-primary:hover {
  background: var(--accent-color-hover, #1d4ed8);
  transform: translateY(-1px);
} */

/* .wbm-btn-primary:active {
  transform: translateY(0);
} */

/* Footer */
.wbm-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
}

.wbm-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm, 12px);
  color: var(--text-tertiary, rgba(255, 255, 255, 0.3));
  cursor: pointer;
  user-select: none;
}

.wbm-checkbox {
  accent-color: var(--accent-color, #2563eb);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.wbm-btn-dismiss {
  background: none;
  border: 1px solid var(--border-color, #2c2c32);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 20px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
  font-size: var(--font-size-sm, 12px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s ease);
  font-family: inherit;
}

.wbm-btn-dismiss:hover {
  border-color: var(--text-secondary, rgba(255, 255, 255, 0.45));
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
}

/* Transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .wbm-modal,
.modal-fade-leave-active .wbm-modal {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .wbm-modal {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}

.modal-fade-leave-to .wbm-modal {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .wbm-modal {
    padding: 20px 16px 12px;
    max-height: 92vh;
    gap: 16px;
    border-radius: var(--radius-md, 12px);
  }

  .wbm-icon-row {
    font-size: 32px;
  }

  .wbm-title {
    font-size: var(--font-size-lg, 18px);
  }

  .wbm-subtitle {
    font-size: var(--font-size-sm, 12px);
  }

  .wbm-table {
    font-size: 10px;
  }

  .wbm-table th {
    padding: 8px 5px;
    font-size: 9px;
  }

  .wbm-table td {
    padding: 8px 5px;
  }

  .wbm-feature-icon {
    font-size: 14px;
  }

  .wbm-feature-label {
    font-size: 8px;
  }

  .wbm-photo-count {
    font-size: 11px;
  }

  .wbm-profile-badge {
    font-size: 9px;
    padding: 2px 6px;
  }

  .wbm-status {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }

  .wbm-capacity-row {
    flex-direction: column;
    gap: 10px;
  }

  .wbm-btn-primary {
    width: 100%;
    padding: 12px 24px;
  }

  .wbm-footer {
    gap: 12px;
  }

  .wbm-legend {
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .wbm-overlay {
    padding: 8px;
  }

  .wbm-modal {
    padding: 16px 12px;
  }

  .wbm-th-photos,
  .wbm-td-photos {
    padding-left: 8px;
  }

  .wbm-th-profile,
  .wbm-td-profile {
    padding-left: 8px;
  }
}
</style>
