<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :style="{ width: '520px', maxWidth: '95vw' }"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="cpm-card">
      <template #header>
        <div class="cpm-header">
          <n-icon size="20" color="var(--accent-color)">
            <SparklesOutline />
          </n-icon>
          <span>Buy Credits</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="$emit('update:show', false)" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <p class="cpm-subtitle">
        Buy credits to power AI analysis features. One-time purchase &mdash;
        credits are added to your balance instantly and never expire.
      </p>

      <div v-if="isLoading" class="cpm-loading">
        <n-spin size="medium" />
      </div>

      <template v-else-if="creditSteps.length">
        <label class="cpm-label">Select amount</label>
        <div class="cpm-select-wrap">
          <n-select
            :value="selectedIndex"
            @update:value="selectedIndex = $event"
            :options="selectOptions"
            size="medium"
          />
        </div>

        <div v-if="selected" class="cpm-details">
          <div class="cpm-row">
            <span class="cpm-row-label">Credits</span>
            <span class="cpm-row-value">{{
              selected.credits.toLocaleString()
            }}</span>
          </div>
          <div class="cpm-row">
            <span class="cpm-row-label">Price</span>
            <div class="cpm-price-col">
              <span class="cpm-row-value"
                >€{{ selected.priceEur.toFixed(2) }}</span
              >
              <span class="cpm-unit">
                {{ ((selected.priceEur / selected.credits) * 100).toFixed(2) }}
                cents / credit
              </span>
            </div>
          </div>
          <div v-if="selected.description" class="cpm-row">
            <span class="cpm-row-label">Details</span>
            <span class="cpm-row-value cpm-row-description">{{
              selected.description
            }}</span>
          </div>
        </div>

        <n-button
          block
          size="large"
          :loading="isCheckingOut"
          :disabled="!selected"
          @click="selected && handleBuy(selected.stripePriceId)"
          class="cpm-buy"
          style="
            --n-color: var(--accent-color);
            --n-color-hover: var(--accent-color);
            --n-color-pressed: var(--accent-color);
            --n-color-focus: var(--accent-color);
            --n-text-color: #0a0a0a;
            --n-text-color-hover: #0a0a0a;
            --n-text-color-pressed: #0a0a0a;
            --n-border: none;
            --n-ripple-color: var(--accent-color);
          "
        >
          Buy for €{{ selected?.priceEur.toFixed(2) }}
        </n-button>

        <p class="cpm-note">
          One-time purchase. Credits are added to your balance instantly.
        </p>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  NModal,
  NCard,
  NButton,
  NIcon,
  NSpin,
  NSelect,
  useMessage,
} from "naive-ui";
import { SparklesOutline, CloseOutline } from "@vicons/ionicons5";
import { usePayments } from "@/composables/usePayments";

defineProps<{ show: boolean }>();
defineEmits<{ (e: "update:show", value: boolean): void }>();

const { creditSteps, isLoading, isCheckingOut, fetchPackages, checkout } =
  usePayments();
const message = useMessage();

const selectedIndex = ref(0);

fetchPackages().then(() => {
  if (creditSteps.value.length) {
    selectedIndex.value = 0;
  }
});

const selected = computed(() => creditSteps.value[selectedIndex.value] ?? null);

const selectOptions = computed(() =>
  creditSteps.value.map((s, i) => ({
    label: `${s.credits.toLocaleString()} credits · €${s.priceEur.toFixed(2)}`,
    value: i,
  })),
);

const handleBuy = async (stripePriceId: string) => {
  try {
    await checkout("credits", stripePriceId);
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || "Checkout failed";
    message.error(msg);
  }
};
</script>

<style scoped>
.cpm-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.cpm-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* ── Subtitle ── */
.cpm-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-lg) 0;
  line-height: 1.5;
}

.cpm-loading {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl) 0;
}

/* ── Label ── */
.cpm-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

/* ── Select ── */
.cpm-select-wrap {
  margin-bottom: var(--spacing-lg);
}

/* ── Details rows ── */
.cpm-details {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding-left: var(--spacing-md);
  padding-right: var(--spacing-md);
  padding-top: 5px;
  padding-bottom: 5px;
  margin-bottom: var(--spacing-lg);
}

.cpm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
}

.cpm-row + .cpm-row {
  border-top: 1px solid var(--border-color);
}

.cpm-row-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.cpm-row-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.cpm-price-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.cpm-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.cpm-row-description {
  font-style: italic;
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

/* ── Buy button ── */
.cpm-buy {
  margin-bottom: var(--spacing-sm);
}

/* ── Footer note ── */
.cpm-note {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin: 0;
}
</style>
