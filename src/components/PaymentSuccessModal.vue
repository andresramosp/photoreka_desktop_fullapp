<template>
  <n-modal
    :show="show"
    :mask-closable="!isVerifying"
    :style="{ width: '560px', maxWidth: '94vw' }"
    @update:show="onUpdateShow"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="ps-card">
      <template #header-extra>
        <n-button
          text
          :disabled="isVerifying"
          aria-label="Close"
          @click="onUpdateShow(false)"
        >
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="ps-content">
        <div class="ps-orbit" :class="{ 'ps-orbit--verifying': isVerifying }">
          <div class="ps-icon" :class="{ 'ps-icon--verifying': isVerifying }">
            <n-icon v-if="isVerifying" size="38">
              <InProgress />
            </n-icon>
            <n-icon v-else size="42">
              <CheckmarkCircleOutline />
            </n-icon>
          </div>
        </div>

        <p class="ps-kicker">
          {{ isVerifying ? "Payment received" : "Unlocked" }}
        </p>
        <h3 class="ps-title">{{ title }}</h3>
        <p class="ps-body">{{ body }}</p>

        <template v-if="summary">
          <div class="ps-reward-grid">
            <div
              v-if="summary.analyzedPhotosGranted > 0"
              class="ps-reward-tile"
            >
              <span class="ps-reward-value"
                >+{{ summary.analyzedPhotosGranted.toLocaleString() }}</span
              >
              <span class="ps-reward-label">photo analyses</span>
            </div>
            <div
              v-if="summary.creditsGranted > 0"
              class="ps-reward-tile ps-reward-tile--credits"
            >
              <span class="ps-reward-value ps-reward-value--credits"
                >+{{ summary.creditsGranted.toLocaleString() }}</span
              >
              <span class="ps-reward-label">AI credits</span>
            </div>
          </div>

          <div class="ps-purchase-strip">
            <div>
              <span class="ps-purchase-label">Purchase</span>
              <span class="ps-purchase-name">{{
                summary.productName || summary.packageId
              }}</span>
            </div>
            <span class="ps-purchase-price"
              >€{{ Number(summary.amountEur).toFixed(2) }}</span
            >
          </div>
        </template>

        <div v-else class="ps-loading">
          <div class="ps-loading-tile" />
          <div class="ps-loading-tile" />
        </div>
      </div>

      <template #action>
        <div class="ps-actions">
          <n-button v-if="isVerifying" block disabled
            >Applying rewards…</n-button
          >
          <n-button
            v-else
            type="primary"
            block
            size="large"
            @click="onUpdateShow(false)"
          >
            Continue
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NModal, NCard, NButton, NIcon } from "naive-ui";
import { CheckmarkCircleOutline, CloseOutline } from "@vicons/ionicons5";
import { InProgress } from "@vicons/carbon";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

interface PaymentSummary {
  status: PaymentStatus;
  type: "photo_package" | "credits";
  packageId: string;
  stripePriceId: string | null;
  stripeProductId: string | null;
  productName: string | null;
  photosGranted: number;
  analyzedPhotosGranted: number;
  creditsGranted: number;
  amountEur: number;
}

// ─── Props / Emits ────────────────────────────────────────────────────────────

const props = defineProps<{ show: boolean; sessionId: string | null }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

// ─── Composables ─────────────────────────────────────────────────────────────

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

// ─── State ────────────────────────────────────────────────────────────────────

const summary = ref<PaymentSummary | null>(null);
const isVerifying = ref(false);

// ─── Computed labels ──────────────────────────────────────────────────────────

const title = computed(() => {
  if (!summary.value) return "Preparing your rewards";
  if (summary.value.status === "pending") return "Rewards are on the way";
  if (summary.value.status === "refunded") return "Purchase refunded";
  if (summary.value.status === "failed") return "Payment not completed";
  return summary.value.type === "photo_package"
    ? "Your photo pack is ready"
    : "Your credits are ready";
});

const body = computed(() => {
  if (!summary.value)
    return "We are checking Stripe and updating your account.";
  if (summary.value.status === "pending") {
    return isVerifying.value
      ? "Stripe confirmed the checkout. We are applying the new quota to your account now."
      : "Stripe confirmed the checkout. The webhook is still finalizing — your balance should update shortly.";
  }
  if (summary.value.status === "refunded")
    return "This payment has been refunded, so the related rewards are no longer active.";
  if (summary.value.status === "failed")
    return "The checkout session was not completed. Your balance has not changed.";
  return "The new allowance has been added to your account.";
});

// ─── Logic ────────────────────────────────────────────────────────────────────

watch(
  () => props.show,
  (opened) => {
    if (opened && props.sessionId) {
      clearPaymentQuery();
      verify(props.sessionId);
    }
  },
  { immediate: true },
);

async function verify(sessionId: string) {
  summary.value = null;
  isVerifying.value = true;

  try {
    summary.value = await fetchSummary(sessionId);

    if (summary.value.status === "pending") {
      summary.value = await poll(sessionId, summary.value);
    }

    await userStore.fetchUsage();
  } finally {
    isVerifying.value = false;
  }
}

async function fetchSummary(sessionId: string): Promise<PaymentSummary> {
  const { data } = await api.get("/api/payments/verify", {
    params: { session_id: sessionId },
  });
  return data.data;
}

async function poll(
  sessionId: string,
  fallback: PaymentSummary,
): Promise<PaymentSummary> {
  let latest = fallback;
  for (let i = 0; i < 8; i++) {
    await sleep(1200);
    latest = await fetchSummary(sessionId);
    if (latest.status !== "pending") break;
  }
  return latest;
}

function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

function onUpdateShow(v: boolean) {
  emit("update:show", v);
}

function clearPaymentQuery() {
  if (!route.query.payment && !route.query.session_id) return;

  const next = { ...route.query };
  delete next.payment;
  delete next.session_id;
  router.replace({ query: next });
}
</script>

<style scoped>
.ps-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.ps-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0 var(--spacing-md);
}

/* ── Orbit ring ── */
.ps-orbit {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, var(--primary-15) 0%, transparent 68%);
  border: 1px solid var(--primary-30);
  transition:
    border-color 0.5s ease,
    box-shadow 0.5s ease;
}

.ps-orbit--verifying {
  animation: ps-orbit-pulse 2.2s ease-in-out infinite;
}

@keyframes ps-orbit-pulse {
  0%,
  100% {
    box-shadow: none;
  }
  50% {
    box-shadow: 0 0 28px var(--primary-15);
  }
}

/* ── Icon circle ── */
.ps-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-on-primary);
  background: linear-gradient(
    135deg,
    var(--primary-color),
    var(--accent-color)
  );
  box-shadow: 0 8px 28px var(--primary-30);
  transition:
    background 0.5s ease,
    box-shadow 0.5s ease;
}

.ps-icon--verifying {
  background: var(--primary-color);
  animation: ps-icon-breathe 2.2s ease-in-out infinite;
}

@keyframes ps-icon-breathe {
  0%,
  100% {
    box-shadow: 0 8px 24px var(--primary-30);
  }
  50% {
    box-shadow: 0 8px 36px var(--primary-50);
  }
}

/* ── Labels ── */
.ps-kicker {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--accent-color);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ps-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0;
}

.ps-body {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
  max-width: 420px;
}

/* ── Reward grid ── */
.ps-reward-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacing-sm);
}

.ps-reward-tile {
  min-height: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2xs);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-top: 2px solid var(--primary-color);
}

.ps-reward-tile--credits {
  border-top-color: var(--accent-color);
}

.ps-reward-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--primary-color);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.ps-reward-value--credits {
  color: var(--accent-color);
}

.ps-reward-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Purchase strip ── */
.ps-purchase-strip {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--primary-08);
  border: 1px solid var(--primary-30);
  text-align: left;
}

.ps-purchase-label {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

.ps-purchase-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.ps-purchase-price {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Pending placeholder ── */
.ps-loading {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}

.ps-loading-tile {
  height: 88px;
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-top: 2px solid var(--border-color);
  animation: ps-shimmer 1.8s ease-in-out infinite;
}

.ps-loading-tile:nth-child(2) {
  animation-delay: 0.3s;
}

@keyframes ps-shimmer {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.ps-actions {
  width: 100%;
}
</style>
