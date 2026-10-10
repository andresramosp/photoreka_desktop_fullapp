<template>
  <button
    type="button"
    class="pkg-card"
    :class="{ selected, 'pkg-card--free': isFree }"
    :style="{ '--accent': accent }"
    :aria-pressed="selected"
    @click="emit('select')"
  >
    <span class="pkg-check">
      <n-icon size="14"><CheckmarkOutline /></n-icon>
    </span>

    <span class="pkg-badge">
      <n-icon size="12"><component :is="badge.icon" /></n-icon>
      {{ badge.label }}
    </span>

    <div class="pkg-amount">
      <span class="pkg-amount-value"
        >+{{ pkg.photos.toLocaleString() }}</span
      >
      <span class="pkg-amount-label">photo analyses</span>
    </div>

    <span v-if="pkg.credits > 0" class="pkg-perk">
      <n-icon size="14"><ConstructOutline /></n-icon>
      +{{ pkg.credits.toLocaleString() }} tool credits
    </span>

    <div v-if="isFree" class="pkg-price">
      <span class="pkg-price-final">Free</span>
      <span class="pkg-price-unit">Included with your account</span>
    </div>
    <div v-else class="pkg-price">
      <div class="pkg-price-row">
        <span v-if="hasDiscount" class="pkg-price-original"
          >€{{ pkg.priceEur.toFixed(2) }}</span
        >
        <span class="pkg-price-final">€{{ finalPrice.toFixed(2) }}</span>
        <span v-if="hasDiscount && percentOff" class="pkg-price-off"
          >−{{ percentOff }}%</span
        >
      </div>
      <span class="pkg-price-unit"
        >{{ ((finalPrice / pkg.photos) * 100).toFixed(2) }} cents / photo</span
      >
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CheckmarkOutline, ConstructOutline } from "@vicons/ionicons5";
import type { PhotoPackage } from "@/composables/usePayments";
import { roleStyle, type PackageRole } from "./packageRoles";

const props = defineProps<{
  pkg: Pick<PhotoPackage, "photos" | "credits" | "priceEur">;
  role: PackageRole;
  selected: boolean;
  finalPrice: number;
  percentOff: number | null;
}>();

const emit = defineEmits<{ (e: "select"): void }>();

const accent = computed(() => roleStyle(props.role).accent);
const badge = computed(() => roleStyle(props.role).badge);
const isFree = computed(() => props.role === "free");
const hasDiscount = computed(() => props.finalPrice < props.pkg.priceEur);
</script>

<style scoped>
.pkg-card {
  --accent: var(--primary-color);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 18px 18px 16px;
  text-align: left;
  font-family: inherit;
  color: inherit;
  background:
    radial-gradient(
      120% 70% at 0% 0%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 60%
    ),
    var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.pkg-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* The free pack stays plain so the paid ones carry the color. */
.pkg-card--free {
  background: var(--bg-card);
}

.pkg-card.selected {
  border-color: var(--accent);
  background:
    radial-gradient(
      120% 70% at 0% 0%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 60%
    ),
    color-mix(in srgb, var(--accent) 6%, var(--bg-card));
  box-shadow:
    inset 0 0 0 1px var(--accent),
    0 10px 28px color-mix(in srgb, var(--accent) 26%, transparent);
}

.pkg-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pkg-card.selected .pkg-check {
  opacity: 1;
  transform: scale(1);
}

.pkg-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 15%, transparent);
}

.pkg-amount {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pkg-amount-value {
  font-size: 38px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.pkg-amount-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}


.pkg-perk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.pkg-perk .n-icon {
  color: var(--secondary-color, #c084fc);
}

/* Pushed to the bottom so prices align even when captions wrap differently. */
.pkg-price {
  margin-top: auto;
  width: 100%;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pkg-price-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pkg-price-original {
  font-size: 13px;
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.pkg-price-final {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pkg-price-off {
  font-size: 11px;
  font-weight: 700;
  color: #22c55e;
}

.pkg-price-unit {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
</style>
