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
            <StarOutline />
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

      <div v-if="isLoading" class="cpm-loading">
        <n-spin size="medium" />
      </div>

      <template v-else-if="creditSteps.length">
        <label class="cpm-label">Select amount</label>
        <div class="cpm-slider-wrap">
          <n-slider
            :value="selectedIndex"
            @update:value="selectedIndex = $event"
            :min="0"
            :max="creditSteps.length - 1"
            :step="1"
            :marks="sliderMarks"
            :tooltip="false"
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
          type="primary"
          block
          size="large"
          :loading="isCheckingOut"
          :disabled="!selected"
          @click="selected && handleBuy(selected.id)"
          class="cpm-buy"
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
  NSlider,
  useMessage,
} from "naive-ui";
import { StarOutline, CloseOutline } from "@vicons/ionicons5";
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

const sliderMarks = computed(() => {
  const m: Record<number, string> = {};
  creditSteps.value.forEach((s, i) => {
    m[i] = formatCredits(s.credits);
  });
  return m;
});

function formatCredits(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

const handleBuy = async (stepId: string) => {
  try {
    await checkout("credits", stepId);
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

/* ── Slider ── */
.cpm-slider-wrap {
  padding: 0 var(--spacing-sm);
  margin-bottom: var(--spacing-xl);
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
