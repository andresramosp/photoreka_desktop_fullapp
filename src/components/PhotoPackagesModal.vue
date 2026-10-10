<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :style="{ width: '600px', maxWidth: '95vw' }"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="ppm-card">
      <template #header>
        <div class="ppm-header">
          <n-icon size="20" color="var(--primary-color)">
            <LayersOutline />
          </n-icon>
          <span>Expand your photo analysis quota</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="$emit('update:show', false)" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <p class="ppm-subtitle">
        <strong>One-time purchase</strong> — photos are added to your account
        instantly. Use them anytime, there's no time limit.
      </p>

      <div v-if="isLoading" class="ppm-loading">
        <SpiralGridLoader variant="primary" :size="48" />
      </div>

      <template v-else-if="photoPackages.length">
        <label class="ppm-label">Select package</label>
        <div class="ppm-select-wrap">
          <n-select
            :value="selectedIndex"
            @update:value="selectedIndex = $event"
            :options="selectOptions"
            size="medium"
          />
        </div>

        <div v-if="selected" class="ppm-details">
          <div class="ppm-row">
            <span class="ppm-row-label">Photo analysis</span>
            <span class="ppm-row-value"
              >+{{ selected.photos.toLocaleString() }}</span
            >
          </div>
          <div v-if="selected.credits > 0" class="ppm-row">
            <span class="ppm-row-label">Included credits</span>
            <span class="ppm-row-value"
              >+{{ selected.credits.toLocaleString() }}</span
            >
          </div>
          <div class="ppm-row ppm-row--storage">
            <span class="ppm-row-label">Storage cost</span>
            <div class="ppm-price-col">
              <span class="ppm-row-value">€0</span>
              <button
                class="ppm-read-more"
                @click="showStorageInfo = !showStorageInfo"
              >
                {{ showStorageInfo ? "Hide" : "Read more" }}
              </button>
            </div>
          </div>
          <Transition name="ppm-expand">
            <div v-if="showStorageInfo" class="ppm-storage-info">
              <p>
                Storage is <strong>free for the first year</strong> from your
                registration. After that, the cost is very marginal — and still
                free for small catalogs.
              </p>
              <p class="ppm-storage-examples">Monthly cost examples:</p>
              <ul>
                <li>~5,000 photos: <strong>≈ €0.25 / month</strong></li>
                <li>~10,000 photos: <strong>≈ €0.50 / month</strong></li>
                <li>~20,000 photos: <strong>≈ €1.00 / month</strong></li>
              </ul>
            </div>
          </Transition>
          <div class="ppm-row">
            <span class="ppm-row-label">{{
              discountAmount !== null ? "Original price" : "Price"
            }}</span>
            <div class="ppm-price-col">
              <span
                class="ppm-row-value"
                :class="{
                  'ppm-row-value--strikethrough': discountAmount !== null,
                }"
                >€{{ selected.priceEur.toFixed(2) }}</span
              >
              <span class="ppm-unit">
                {{ ((selected.priceEur / selected.photos) * 100).toFixed(2) }}
                cents / photo
              </span>
            </div>
          </div>
          <div v-if="discountAmount !== null" class="ppm-row ppm-row--discount">
            <span class="ppm-row-label">Discount</span>
            <div class="ppm-price-col">
              <span class="ppm-row-value ppm-row-value--discount">
                −€{{ discountAmount.toFixed(2) }}
              </span>
              <span v-if="promotion?.percentOff" class="ppm-unit"
                >{{ promotion.percentOff }}% off</span
              >
            </div>
          </div>
          <div v-if="finalPrice !== null" class="ppm-row ppm-row--total">
            <span class="ppm-row-label ppm-row-label--total">You pay</span>
            <span class="ppm-row-value ppm-row-value--total"
              >€{{ finalPrice.toFixed(2) }}</span
            >
          </div>
        </div>

        <n-button
          block
          size="large"
          :loading="isCheckingOut"
          :disabled="!selected"
          @click="selected && handleBuy(selected.stripePriceId)"
          class="ppm-buy"
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
          Buy for €{{ (finalPrice ?? selected?.priceEur)?.toFixed(2) }}
        </n-button>

        <p class="ppm-note">
          One-time purchase. Photos are added to your quota instantly, with no
          time limit to use them.
        </p>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { NModal, NCard, NButton, NIcon, NSelect, useMessage } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { CloseOutline } from "@vicons/ionicons5";
import { usePayments } from "@/composables/usePayments";
import { LayersOutline } from "@vicons/ionicons5";
import { useActivityLogger } from "@/composables/useActivityLogger";

const props = defineProps<{ show: boolean }>();
defineEmits<{ (e: "update:show", value: boolean): void }>();

const {
  photoPackages,
  promotion,
  isLoading,
  isCheckingOut,
  fetchPackages,
  checkout,
} = usePayments();
const message = useMessage();
const { logActivity } = useActivityLogger();

const selectedIndex = ref(0);
const showStorageInfo = ref(false);

watch(
  () => props.show,
  (val) => {
    if (val) logActivity("ui_action", { action: "open_photo_packages_modal" });
  },
);

watch(selectedIndex, (idx) => {
  const pkg = photoPackages.value[idx];
  if (pkg) {
    logActivity("ui_action", {
      action: "view_photo_package",
      packageName: pkg.name,
      photos: pkg.photos,
      priceEur: pkg.priceEur,
    });
  }
});

fetchPackages().then(() => {
  if (photoPackages.value.length) {
    selectedIndex.value = 0;
  }
});

const selected = computed(
  () => photoPackages.value[selectedIndex.value] ?? null,
);

const discountAmount = computed(() => {
  if (!selected.value || !promotion.value) return null;
  if (promotion.value.percentOff) {
    return (selected.value.priceEur * promotion.value.percentOff) / 100;
  }
  if (promotion.value.amountOff) {
    return promotion.value.amountOff / 100;
  }
  return null;
});

const finalPrice = computed(() =>
  discountAmount.value !== null
    ? Math.max(0, selected.value!.priceEur - discountAmount.value)
    : null,
);

const selectOptions = computed(() =>
  photoPackages.value.map((pkg, i) => ({
    label: `${pkg.name}`,
    value: i,
  })),
);

const handleBuy = async (stripePriceId: string) => {
  const pkg = selected.value;
  if (pkg) {
    logActivity("ui_action", {
      action: "buy_photo_package_clicked",
      packageName: pkg.name,
      photos: pkg.photos,
      priceEur: pkg.priceEur,
      stripePriceId,
    });
  }
  try {
    await checkout("photo_package", stripePriceId);
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || "Checkout failed";
    message.error(msg);
  }
};
</script>

<style scoped>
.ppm-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.ppm-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.ppm-loading {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl) 0;
}

/* ── Label ── */
.ppm-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

/* ── Select ── */
.ppm-select-wrap {
  margin-bottom: var(--spacing-lg);
}

/* ── Details rows ── */
.ppm-details {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding-left: var(--spacing-md);
  padding-right: var(--spacing-md);
  padding-top: 5px;
  padding-bottom: 5px;
  margin-bottom: var(--spacing-lg);
}

.ppm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
}

.ppm-row + .ppm-row {
  border-top: 1px solid var(--border-color);
}

.ppm-row-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.ppm-row-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.ppm-price-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.ppm-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

/* ── Buy button ── */
.ppm-buy {
  margin-bottom: var(--spacing-sm);
}

/* ── Subtitle ── */
.ppm-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-lg) 0;
  line-height: 1.5;
}

/* ── Footer note ── */
.ppm-note {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin: 0;
}

/* ── Read more button ── */
.ppm-read-more {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--primary-color);
  text-decoration: underline;
  text-underline-offset: 2px;
  line-height: 1;
}
.ppm-read-more:hover {
  opacity: 0.75;
}

/* ── Storage expand transition ── */
.ppm-expand-enter-active,
.ppm-expand-leave-active {
  transition:
    max-height 0.28s ease,
    opacity 0.22s ease;
  overflow: hidden;
  max-height: 200px;
}
.ppm-expand-enter-from,
.ppm-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ── Storage expandable info ── */
.ppm-storage-info {
  padding: var(--spacing-sm) 0 var(--spacing-xs) 0;
  border-bottom: 1px solid var(--border-color);
}
.ppm-storage-info p {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: 1.5;
}
.ppm-storage-examples {
  font-weight: var(--font-weight-medium);
  color: var(--text-primary) !important;
  margin-top: var(--spacing-xs) !important;
}
.ppm-storage-info ul {
  margin: 2px 0 0 0;
  padding-left: 1.2em;
}
.ppm-storage-info li {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ── Discount / total rows ── */
.ppm-row-value--strikethrough {
  text-decoration: line-through;
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
}

.ppm-row-value--discount {
  color: #22c55e;
}

.ppm-row-label--total {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.ppm-row-value--total {
  color: var(--accent-color);
  font-size: var(--font-size-base);
}
</style>
