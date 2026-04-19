<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :style="{ width: '920px', maxWidth: '95vw' }"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="packages-modal-card"
    >
      <template #header>
        <div class="packages-modal-header">
          <n-icon size="24" color="var(--accent-color)">
            <InProgress />
          </n-icon>
          <span>Photo Analysis Packages</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="$emit('update:show', false)" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <p class="packages-subtitle">
        Buy once, use forever. Each pack adds photos and bonus credits to your
        account instantly.
      </p>

      <div v-if="isLoading" class="packages-loading">
        <n-spin size="medium" />
      </div>

      <div v-else class="packages-grid">
        <div
          v-for="pkg in photoPackages"
          :key="pkg.id"
          class="package-card"
          :class="{ highlighted: pkg.highlighted }"
        >
          <div v-if="pkg.highlighted" class="package-badge">
            <n-icon size="12"><StarOutline /></n-icon>
            Popular
          </div>

          <div class="package-name">{{ pkg.name }}</div>

          <div class="package-photos-block">
            <span class="package-photos-number">{{
              pkg.photos.toLocaleString()
            }}</span>
            <span class="package-photos-label">photos</span>
          </div>

          <div class="package-credits-pill">
            +{{ pkg.credits.toLocaleString() }} credits
          </div>

          <div class="package-divider" />

          <div class="package-price">€{{ pkg.priceEur.toFixed(2) }}</div>

          <n-button
            :type="pkg.highlighted ? 'primary' : 'default'"
            block
            :loading="isCheckingOut"
            @click="handleBuy(pkg.id)"
          >
            Buy now
          </n-button>
        </div>
      </div>

      <template #action>
        <div class="packages-modal-footer">
          <n-icon size="14" color="var(--text-tertiary)">
            <ShieldCheckmarkOutline />
          </n-icon>
          <span class="packages-footer-note">
            One-time purchase &mdash; no subscription. Photos and credits never
            expire.
          </span>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal, NCard, NButton, NIcon, NSpin, useMessage } from "naive-ui";
import {
  CloseOutline,
  StarOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import { InProgress } from "@vicons/carbon";

import { usePayments } from "@/composables/usePayments";
import { useUserStore } from "@/stores/userStore";

defineProps<{ show: boolean }>();
defineEmits<{ (e: "update:show", value: boolean): void }>();

const { photoPackages, isLoading, isCheckingOut, fetchPackages, checkout } =
  usePayments();
const userStore = useUserStore();
const message = useMessage();

fetchPackages();

const handleBuy = async (packageId: string) => {
  try {
    await checkout("photo_package", packageId);
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || "Checkout failed";
    message.error(msg);
  }
};
</script>

<style scoped>
.packages-modal-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.packages-modal-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.packages-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-lg) 0;
}

.packages-loading {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl) 0;
}

/* ── Grid ── */
.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--spacing-md);
}

/* ── Color tiers — basic → pro ── */
.package-card:nth-child(1) {
  --card-accent: #9ca3af;
  --card-accent-bg: rgba(156, 163, 175, 0.10);
  --card-glow: rgba(156, 163, 175, 0.15);
}
.package-card:nth-child(2) {
  --card-accent: var(--primary-color);
  --card-accent-bg: rgba(37, 99, 235, 0.1);
  --card-glow: rgba(37, 99, 235, 0.15);
}
.package-card:nth-child(3) {
  --card-accent: var(--accent-color);
  --card-accent-bg: rgba(0, 255, 255, 0.1);
  --card-glow: rgba(0, 255, 255, 0.15);
}
.package-card:nth-child(4) {
  --card-accent: var(--warning-color);
  --card-accent-bg: rgba(245, 158, 11, 0.1);
  --card-glow: rgba(245, 158, 11, 0.15);
}

/* ── Card ── */
.package-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-xl) var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-lg);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--card-accent);
  text-align: center;
  transition: var(--transition-fast);
  gap: 0;
}

.package-card.highlighted {
  border-color: var(--card-accent);
  border-top-color: var(--card-accent);
  box-shadow:
    0 0 0 1px var(--card-accent),
    0 4px 24px var(--card-glow);
}

/* ── Badge ── */
.package-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, var(--card-accent), var(--primary-color));
  color: #000;
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  padding: 3px 12px;
  border-radius: var(--radius-full);
  white-space: nowrap;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

/* ── Name ── */
.package-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--spacing-md);
}

/* ── Photo count block – fixed height for alignment ── */
.package-photos-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 64px;
  margin-bottom: var(--spacing-sm);
}

.package-photos-number {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--card-accent);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.package-photos-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Credits pill ── */
.package-credits-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--card-accent);
  background: var(--card-accent-bg);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  white-space: nowrap;
  margin-bottom: var(--spacing-md);
}

/* ── Divider ── */
.package-divider {
  width: 100%;
  height: 1px;
  background-color: var(--border-color);
  margin-bottom: var(--spacing-md);
}

/* ── Price ── */
.package-price {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-md);
}

/* ── Footer ── */
.packages-modal-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
}

.packages-footer-note {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-align: center;
}

@media (max-width: 560px) {
  .packages-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
