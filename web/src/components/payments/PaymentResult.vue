<template>
  <div v-if="showCard" class="pr" :class="`pr--${outcome}`">
    <div class="pr-head">
      <span class="pr-status-icon">
        <span v-if="outcome === 'confirming'" class="pr-spinner" />
        <n-icon v-else-if="outcome === 'completed'" :size="20">
          <CheckmarkSharp />
        </n-icon>
        <n-icon v-else :size="20"><TimeOutline /></n-icon>
      </span>
      <div class="pr-head-text">
        <span class="pr-product">{{
          summary ? summary.productName || summary.packageId : "Your pack"
        }}</span>
        <span class="pr-status">{{ statusLabel }}</span>
      </div>
      <span v-if="summary" class="pr-price"
        >€{{ Number(summary.amountEur).toFixed(2) }}</span
      >
    </div>

    <div class="pr-grants">
      <template v-if="summary">
        <span v-if="summary.analyzedPhotosGranted > 0" class="pr-grant">
          <n-icon :size="16" class="pr-grant-icon pr-grant-icon--photos">
            <LayersOutline />
          </n-icon>
          <strong>+{{ formatCount(summary.analyzedPhotosGranted) }}</strong>
          photo analyses
        </span>
        <span v-if="summary.creditsGranted > 0" class="pr-grant">
          <n-icon :size="16" class="pr-grant-icon pr-grant-icon--credits">
            <ConstructOutline />
          </n-icon>
          <strong>+{{ formatCount(summary.creditsGranted) }}</strong>
          tool credits
        </span>
      </template>
      <template v-else>
        <span class="pr-skeleton" />
        <span class="pr-skeleton" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import {
  CheckmarkSharp,
  ConstructOutline,
  LayersOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import type {
  PaymentOutcome,
  PaymentSummary,
} from "@/composables/usePaymentVerification";

const props = defineProps<{
  outcome: PaymentOutcome;
  summary: PaymentSummary | null;
}>();

// Failed, refunded or unknown payments grant nothing, so there is no card.
const showCard = computed(() =>
  ["confirming", "delayed", "completed"].includes(props.outcome),
);

const statusLabel = computed(() => {
  if (props.outcome === "completed") return "Added to your account";
  if (props.outcome === "delayed") return "Waiting for Stripe to confirm";
  return "Confirming payment…";
});

const formatCount = (n: number) => n.toLocaleString();
</script>

<style scoped>
/* Theme flat surface, like the wizard's option cards. */
.pr {
  --tone: var(--primary-color);
  width: 100%;
  border-radius: 14px;
  background-color: var(--bg-subtle);
  text-align: left;
  overflow: hidden;
}

.pr--completed {
  --tone: #22c55e;
}

.pr--delayed {
  --tone: #f59e0b;
}

.pr-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}

.pr-status-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tone);
  background-color: color-mix(in srgb, var(--tone) 14%, transparent);
  transition:
    color 0.3s ease,
    background-color 0.3s ease;
}

.pr--completed .pr-status-icon {
  animation: pr-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pr-pop {
  from {
    transform: scale(0.6);
  }
  to {
    transform: scale(1);
  }
}

.pr-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--tone) 30%, transparent);
  border-top-color: var(--tone);
  animation: pr-spin 0.8s linear infinite;
}

@keyframes pr-spin {
  to {
    transform: rotate(360deg);
  }
}

.pr-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pr-product {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pr-status {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tone);
}

.pr-price {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pr-grants {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 12px 18px 14px;
  border-top: 1px solid var(--border-color);
}

.pr--confirming .pr-grants {
  opacity: 0.55;
}

.pr-grant {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-secondary);
}

.pr-grant strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pr-grant-icon--photos {
  color: var(--primary-color-hover, #3b82f6);
}

.pr-grant-icon--credits {
  color: var(--secondary-color, #c084fc);
}

.pr-skeleton {
  display: block;
  width: 140px;
  height: 16px;
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--text-primary) 8%, transparent);
}
</style>
