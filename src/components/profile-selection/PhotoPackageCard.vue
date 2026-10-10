<template>
  <button
    type="button"
    class="pkg-card"
    :class="{
      selected,
      'pkg-card--free': isFree,
      'pkg-card--compact': compact,
    }"
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
      <!-- Paid packs add on top of the free one, which is already granted. -->
      <span class="pkg-amount-value"
        >{{ isFree ? "" : "+" }}{{ pkg.photos.toLocaleString() }}</span
      >
      <span class="pkg-amount-label">photo analyses</span>
    </div>

    <span v-if="pkg.credits > 0" class="pkg-perk">
      <n-icon size="14"><ConstructOutline /></n-icon>
      +{{ pkg.credits.toLocaleString() }} tool credits
    </span>

    <!-- Compact cards carry the purchase terms, which on desktop sit under
         the carousel. -->
    <span v-if="compact" class="pkg-terms">
      <!-- The free pack is lost if the account is deleted for inactivity
           (Terms, section 12), so only paid packs promise no time limit. -->
      {{ isFree ? "Already included" : "One-time payment" }}
      <span class="pkg-terms-dot">·</span>
      {{ isFree ? "Free to try" : "Use it anytime" }}
    </span>

    <div v-if="isFree" class="pkg-price">
      <span class="pkg-price-final">Free</span>
      <span class="pkg-price-unit">Already in your account</span>
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
  // Mobile: shorter card for a vertical list, without the secondary price info.
  compact?: boolean;
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
    var(--bg-subtle);
  /* Theme flat surface: lighter than the panel and borderless at rest; the
     transparent border only reserves the selection's, so nothing shifts. */
  border: 1.5px solid transparent;
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
  background: var(--bg-subtle);
}

.pkg-card.selected {
  border-color: var(--accent);
  background:
    radial-gradient(
      120% 70% at 0% 0%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 60%
    ),
    linear-gradient(
      color-mix(in srgb, var(--accent) 6%, transparent),
      color-mix(in srgb, var(--accent) 6%, transparent)
    ),
    var(--bg-subtle);
  box-shadow:
    inset 0 0 0 1px var(--accent),
    0 4px 16px color-mix(in srgb, var(--accent) 22%, transparent);
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

/* ── Compact (mobile list) ── */
.pkg-card--compact {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "badge badge"
    "amount price"
    "perk price"
    "terms terms";
  align-items: center;
  gap: 8px 12px;
  padding: 14px 16px;
}

.pkg-card--compact .pkg-badge {
  grid-area: badge;
  justify-self: start;
}

.pkg-card--compact .pkg-amount {
  grid-area: amount;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.pkg-card--compact .pkg-amount-value {
  font-size: 30px;
}

.pkg-card--compact .pkg-amount-label {
  font-size: 11px;
}

.pkg-card--compact .pkg-perk {
  grid-area: perk;
  font-size: 12px;
}

.pkg-card--compact .pkg-price {
  grid-area: price;
  width: auto;
  margin: 0;
  padding: 0;
  border: none;
  align-items: flex-end;
  align-self: center;
}

.pkg-card--compact .pkg-price-row {
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}

.pkg-card--compact .pkg-price-original,
.pkg-card--compact .pkg-price-unit {
  display: none;
}

.pkg-card--compact .pkg-price-final {
  font-size: 20px;
}

.pkg-terms {
  grid-area: terms;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pkg-terms-dot {
  margin: 0 4px;
}
</style>
