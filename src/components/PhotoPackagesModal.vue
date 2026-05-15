<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :style="{ width: '520px', maxWidth: '95vw' }"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="ppm-card">
      <template #header>
        <div class="ppm-header">
          <n-icon size="20" color="var(--primary-color)">
            <LayersOutline />
          </n-icon>
          <span>Expand your catalog</span>
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
        Add photos to your library quota. One-time purchase — photos and bonus
        credits are added to your account instantly and never expire.
      </p>

      <div v-if="isLoading" class="ppm-loading">
        <n-spin size="medium" />
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
            <span class="ppm-row-label">Photos</span>
            <span class="ppm-row-value">{{
              selected.photos.toLocaleString()
            }}</span>
          </div>
          <div
            v-if="
              selected.analyzedPhotos &&
              selected.analyzedPhotos !== selected.photos
            "
            class="ppm-row"
          >
            <span class="ppm-row-label">Analyzed photos</span>
            <span class="ppm-row-value">{{
              selected.analyzedPhotos.toLocaleString()
            }}</span>
          </div>
          <div v-if="selected.credits > 0" class="ppm-row">
            <span class="ppm-row-label">Included credits</span>
            <span class="ppm-row-value"
              >+{{ selected.credits.toLocaleString() }}</span
            >
          </div>
          <div class="ppm-row">
            <span class="ppm-row-label">Price</span>
            <div class="ppm-price-col">
              <span class="ppm-row-value"
                >€{{ selected.priceEur.toFixed(2) }}</span
              >
              <span class="ppm-unit">
                {{ ((selected.priceEur / selected.photos) * 100).toFixed(2) }}
                cents / photo
              </span>
            </div>
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
          Buy for €{{ selected?.priceEur.toFixed(2) }}
        </n-button>

        <p class="ppm-note">
          One-time purchase. Photos are added to your quota instantly and never
          expire.
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
import { CloseOutline } from "@vicons/ionicons5";
import { usePayments } from "@/composables/usePayments";
import { LayersOutline } from "@vicons/ionicons5";

defineProps<{ show: boolean }>();
defineEmits<{ (e: "update:show", value: boolean): void }>();

const { photoPackages, isLoading, isCheckingOut, fetchPackages, checkout } =
  usePayments();
const message = useMessage();

const selectedIndex = ref(0);

fetchPackages().then(() => {
  if (photoPackages.value.length) {
    selectedIndex.value = 0;
  }
});

const selected = computed(
  () => photoPackages.value[selectedIndex.value] ?? null,
);

const selectOptions = computed(() =>
  photoPackages.value.map((pkg, i) => ({
    label: `${pkg.name} · ${pkg.photos.toLocaleString()} photos`,
    value: i,
  })),
);

const handleBuy = async (stripePriceId: string) => {
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
</style>
