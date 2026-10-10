<template>
  <div v-if="showTicket" class="ticket" :class="`ticket--${outcome}`">
    <div class="ticket-main">
      <span class="ticket-status">
        <span v-if="outcome === 'confirming'" class="ticket-spinner" />
        <n-icon v-else-if="outcome === 'completed'" :size="14">
          <CheckmarkSharp />
        </n-icon>
        <n-icon v-else :size="14"><TimeOutline /></n-icon>
        {{ statusLabel }}
      </span>

      <template v-if="summary">
        <div
          v-if="summary.analyzedPhotosGranted > 0"
          class="ticket-amount"
        >
          <span class="ticket-amount-value"
            >+{{ formatCount(summary.analyzedPhotosGranted) }}</span
          >
          <span class="ticket-amount-label">
            <n-icon :size="15"><LayersOutline /></n-icon>
            Photo analyses
          </span>
        </div>

        <span
          v-if="summary.creditsGranted > 0"
          class="ticket-perk"
          :class="{ 'ticket-perk--main': !summary.analyzedPhotosGranted }"
        >
          <n-icon :size="15"><ConstructOutline /></n-icon>
          +{{ formatCount(summary.creditsGranted) }} tool credits
        </span>
      </template>

      <template v-else>
        <span class="ticket-skeleton ticket-skeleton--lg" />
        <span class="ticket-skeleton" />
      </template>
    </div>

    <div class="ticket-cut" aria-hidden="true" />

    <div class="ticket-footer">
      <span class="ticket-product">{{
        summary ? summary.productName || summary.packageId : "Photo pack"
      }}</span>
      <span v-if="summary" class="ticket-price"
        >€{{ Number(summary.amountEur).toFixed(2) }}</span
      >
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

// Failed, refunded or unknown payments grant nothing, so there is no ticket.
const showTicket = computed(() =>
  ["confirming", "delayed", "completed"].includes(props.outcome),
);

const statusLabel = computed(() => {
  if (props.outcome === "completed") return "Added to your account";
  if (props.outcome === "delayed") return "Waiting for Stripe";
  return "Confirming payment";
});

const formatCount = (n: number) => n.toLocaleString();
</script>

<style scoped>
.ticket {
  --tone: var(--primary-color);
  position: relative;
  width: 100%;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 16px;
  background:
    radial-gradient(
      110% 80% at 0% 0%,
      color-mix(in srgb, var(--accent-color) 12%, transparent),
      transparent 60%
    ),
    var(--bg-subtle);
  text-align: left;
  transition:
    border-color 0.4s ease,
    box-shadow 0.4s ease;
}

.ticket--completed {
  --tone: #22c55e;
  border-color: color-mix(in srgb, var(--tone) 45%, var(--border-color));
  box-shadow: 0 14px 36px color-mix(in srgb, var(--tone) 14%, transparent);
}

.ticket--delayed {
  --tone: #f59e0b;
}

/* A light sweep while the payment is being confirmed. */
.ticket--confirming::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 30%,
    color-mix(in srgb, var(--text-primary) 5%, transparent) 50%,
    transparent 70%
  );
  background-size: 250% 100%;
  animation: ticket-sweep 1.8s ease-in-out infinite;
}

@keyframes ticket-sweep {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -20% 0;
  }
}

.ticket-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 24px 22px;
}

.ticket-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 11px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tone);
  background-color: color-mix(in srgb, var(--tone) 14%, transparent);
  transition:
    color 0.3s ease,
    background-color 0.3s ease;
}

.ticket-spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--tone) 30%, transparent);
  border-top-color: var(--tone);
  animation: ticket-spin 0.8s linear infinite;
}

@keyframes ticket-spin {
  to {
    transform: rotate(360deg);
  }
}

.ticket-amount {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ticket-amount-value {
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -1.4px;
  font-variant-numeric: tabular-nums;
  color: var(--accent-color);
}

.ticket-amount-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ticket-perk {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.ticket-perk .n-icon {
  color: var(--secondary-color, #c084fc);
}

.ticket-perk--main {
  font-size: 22px;
  font-weight: 700;
}

.ticket-skeleton {
  display: block;
  width: 45%;
  height: 14px;
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.ticket-skeleton--lg {
  width: 60%;
  height: 42px;
}

/* Perforation: the notches are circles in the page color, half clipped by the
   ticket's own overflow. */
.ticket-cut {
  position: relative;
  margin: 0 20px;
  border-top: 1.5px dashed var(--border-color);
}

.ticket-cut::before,
.ticket-cut::after {
  content: "";
  position: absolute;
  top: -10px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: var(--bg-container);
}

.ticket-cut::before {
  left: -30px;
}

.ticket-cut::after {
  right: -30px;
}

.ticket-footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px 16px;
}

.ticket-product {
  font-size: 13px;
  color: var(--text-secondary);
}

.ticket-price {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

@media (max-width: 480px) {
  .ticket-main {
    padding: 18px 18px 20px;
  }

  .ticket-footer {
    padding: 12px 18px 14px;
  }

  .ticket-amount-value {
    font-size: 38px;
  }
}
</style>
