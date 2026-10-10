<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo layout="icon" :height="isMobile ? 44 : 52" class="header-logo" />
      <div class="header-text">
        <h1 class="profile-title">Pick your first photo pack</h1>
        <p class="profile-subtitle">
          A pack is the number of photos Photoreka will analyze for you
        </p>
      </div>
    </div>

    <div v-if="isLoading" class="pkg-state">
      <SpiralGridLoader variant="primary" :size="48" />
    </div>

    <div v-else-if="!photoPackages.length" class="pkg-state">
      <p class="pkg-state-text">We couldn't load the photo packs.</p>
      <div class="pkg-state-actions">
        <n-button secondary @click="fetchPackages">Try again</n-button>
        <n-button v-if="freePack" quaternary @click="emit('start-free')"
          >Continue for free</n-button
        >
      </div>
    </div>

    <template v-else>
      <div
        class="carousel"
        :class="{ 'can-prev': canScrollPrev, 'can-next': canScrollNext }"
      >
        <button
          v-show="canScrollPrev"
          type="button"
          class="carousel-arrow carousel-arrow--prev"
          aria-label="Previous packs"
          @click="scrollByPage(-1)"
        >
          <n-icon size="20"><ChevronBackOutline /></n-icon>
        </button>

        <div ref="trackRef" class="carousel-track" @scroll="updateArrows">
          <div v-if="freePack" class="carousel-slide">
            <PhotoPackageCard
              :pkg="{ name: 'Welcome pack', priceEur: 0, ...freePack }"
              role="free"
              :selected="isFreeSelected"
              :final-price="0"
              :percent-off="null"
              @select="selectFree"
            />
          </div>
          <div
            v-for="pkg in photoPackages"
            :key="pkg.stripePriceId"
            class="carousel-slide"
          >
            <PhotoPackageCard
              :pkg="pkg"
              :role="roleOf(pkg)"
              :selected="pkg.stripePriceId === selectedId"
              :final-price="priceAfterPromotion(pkg.priceEur)"
              :percent-off="promotion?.percentOff ?? null"
              @select="select(pkg)"
            />
          </div>
        </div>

        <button
          v-show="canScrollNext"
          type="button"
          class="carousel-arrow carousel-arrow--next"
          aria-label="More packs"
          @click="scrollByPage(1)"
        >
          <n-icon size="20"><ChevronForwardOutline /></n-icon>
        </button>
      </div>

      <div v-if="starter" class="nudge">
        <n-icon size="18" class="nudge-icon"><SparklesOutline /></n-icon>
        <p v-if="freePack">
          <strong>Want a bigger first batch?</strong>
          Your welcome pack covers {{ freePack.photos.toLocaleString() }}
          photos. For €{{ priceAfterPromotion(starter.priceEur).toFixed(2) }}
          you add {{ starter.photos.toLocaleString() }} more, and they never
          expire.
        </p>
        <p v-else>
          <strong>Not sure yet? Start small.</strong>
          {{ starter.photos.toLocaleString() }} photos are enough to see how
          Photoreka reads, ranks and organizes your own work. You can add more
          whenever you want.
        </p>
      </div>

      <ul class="trust-row">
        <li>
          <n-icon size="15"><CardOutline /></n-icon>One-time payment, no
          subscription
        </li>
        <li>
          <n-icon size="15"><InfiniteOutline /></n-icon>Photos never expire
        </li>
        <li>
          <n-icon size="15"><ShieldCheckmarkOutline /></n-icon>Secure checkout
          with Stripe
        </li>
      </ul>
    </template>

    <div class="profile-actions">
      <n-button size="large" @click="emit('back')" class="back-button" quaternary>
        <template #icon>
          <n-icon><ArrowBackOutline /></n-icon>
        </template>
        Back
      </n-button>
      <n-button
        v-if="isFreeSelected"
        type="primary"
        size="large"
        icon-placement="right"
        @click="startFree"
        class="buy-button"
      >
        <template #icon>
          <n-icon><ArrowForwardOutline /></n-icon>
        </template>
        Start free
      </n-button>
      <n-button
        v-else
        type="primary"
        size="large"
        :disabled="!selected"
        :loading="isCheckingOut"
        @click="handleBuy"
        class="buy-button"
      >
        <template #icon>
          <n-icon><LockClosedOutline /></n-icon>
        </template>
        <template v-if="selected">
          Continue to payment · €{{
            priceAfterPromotion(selected.priceEur).toFixed(2)
          }}
        </template>
        <template v-else>Continue to payment</template>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useMessage } from "naive-ui";
import {
  ArrowBackOutline,
  ArrowForwardOutline,
  CardOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  InfiniteOutline,
  LockClosedOutline,
  ShieldCheckmarkOutline,
  SparklesOutline,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import PhotoPackageCard, { type PackageRole } from "./PhotoPackageCard.vue";
import { usePayments, type PhotoPackage } from "@/composables/usePayments";
import { useActivityLogger } from "@/composables/useActivityLogger";
import { useIsMobile } from "@/composables/useIsMobile.js";

// freePack: the quota the user already has, offered as a first option in the
// hybrid onboarding. Null when buying a pack is required.
const props = defineProps<{
  freePack: { photos: number; credits: number } | null;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "start-free"): void;
}>();

const { isMobile } = useIsMobile();
const message = useMessage();
const { logActivity } = useActivityLogger();
const {
  photoPackages,
  promotion,
  isLoading,
  isCheckingOut,
  fetchPackages,
  checkout,
  priceAfterPromotion,
} = usePayments();

const FREE_ID = "free";
const selectedId = ref<string | null>(null);
const isFreeSelected = computed(() => selectedId.value === FREE_ID);
const selected = computed(
  () => photoPackages.value.find((p) => p.stripePriceId === selectedId.value) ?? null,
);

const pricePerPhoto = (pkg: PhotoPackage) => pkg.priceEur / pkg.photos;

const starter = computed(() =>
  photoPackages.value.reduce<PhotoPackage | null>(
    (min, p) => (!min || p.priceEur < min.priceEur ? p : min),
    null,
  ),
);

const bestValue = computed(() =>
  photoPackages.value.length > 2
    ? photoPackages.value.reduce((best, p) =>
        pricePerPhoto(p) < pricePerPhoto(best) ? p : best,
      )
    : null,
);

const roleOf = (pkg: PhotoPackage): PackageRole => {
  if (pkg === starter.value) return "starter";
  if (pkg.highlighted) return "popular";
  if (pkg === bestValue.value) return "value";
  return null;
};

// The smallest paid pack starts selected, even next to the free one: the
// lowest-commitment way into a purchase.
watch(
  starter,
  (pkg) => {
    if (pkg && !selectedId.value) selectedId.value = pkg.stripePriceId;
  },
  { immediate: true },
);

const select = (pkg: PhotoPackage) => {
  selectedId.value = pkg.stripePriceId;
  logActivity("ui_action", {
    action: "view_photo_package",
    source: "onboarding",
    packageName: pkg.name,
    photos: pkg.photos,
    priceEur: pkg.priceEur,
  });
};

const selectFree = () => {
  selectedId.value = FREE_ID;
  logActivity("ui_action", {
    action: "view_photo_package",
    source: "onboarding",
    packageName: "free",
    photos: props.freePack?.photos,
    priceEur: 0,
  });
};

const startFree = () => {
  logActivity("ui_action", { action: "start_free_clicked", source: "onboarding" });
  emit("start-free");
};

const handleBuy = async () => {
  const pkg = selected.value;
  if (!pkg) return;
  logActivity("ui_action", {
    action: "buy_photo_package_clicked",
    source: "onboarding",
    packageName: pkg.name,
    photos: pkg.photos,
    priceEur: pkg.priceEur,
    stripePriceId: pkg.stripePriceId,
  });
  try {
    await checkout("photo_package", pkg.stripePriceId, "onboarding");
  } catch (err: any) {
    message.error(
      err?.response?.data?.error || err?.message || "Checkout failed",
    );
  }
};

// ── Carousel ──
const trackRef = ref<HTMLElement | null>(null);
const canScrollPrev = ref(false);
const canScrollNext = ref(false);

const updateArrows = () => {
  const el = trackRef.value;
  if (!el) return;
  canScrollPrev.value = el.scrollLeft > 4;
  canScrollNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
};

const scrollByPage = (direction: 1 | -1) => {
  const el = trackRef.value;
  if (!el) return;
  el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
};

let resizeObserver: ResizeObserver | null = null;

watch(trackRef, (el) => {
  resizeObserver?.disconnect();
  if (!el) return;
  resizeObserver = new ResizeObserver(updateArrows);
  resizeObserver.observe(el);
  nextTick(updateArrows);
});

onMounted(() => {
  fetchPackages();
  logActivity("ui_action", { action: "open_onboarding_photo_packages" });
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
.step-content {
  animation: fadeIn 0.3s ease;
  max-width: 900px;
  margin: 0 auto;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Header (same as the other wizard steps) */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 28px;
}

.header-logo {
  flex-shrink: 0;
}

.header-text {
  text-align: left;
}

.profile-title {
  margin: 0 0 2px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.profile-subtitle {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 400;
}

/* Loading / error */
.pkg-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
}

.pkg-state-actions {
  display: flex;
  gap: 8px;
}

.pkg-state-text {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

/* ── Carousel ── */
.carousel {
  --gap: 16px;
  --per-view: 3;
  position: relative;
}

/* Edge fades hint that more cards sit beyond the visible ones. */
.carousel::before,
.carousel::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 36px;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.carousel::before {
  left: 0;
  background: linear-gradient(to right, var(--bg-container), transparent);
}

.carousel::after {
  right: 0;
  background: linear-gradient(to left, var(--bg-container), transparent);
}

.carousel.can-prev::before,
.carousel.can-next::after {
  opacity: 1;
}

.carousel-track {
  display: flex;
  gap: var(--gap);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  /* Room for the selected glow, which overflow would clip. */
  padding: 6px 2px 14px;
  scrollbar-width: none;
}

.carousel-track::-webkit-scrollbar {
  display: none;
}

.carousel-slide {
  flex: 0 0
    calc((100% - (var(--per-view) - 1) * var(--gap)) / var(--per-view));
  scroll-snap-align: start;
  display: flex;
}

.carousel-arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 40px;
  height: 40px;
  margin-top: -24px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background-color: var(--bg-surface);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.carousel-arrow:hover {
  border-color: var(--primary-color);
  transform: scale(1.06);
}

.carousel-arrow--prev {
  left: -20px;
}

.carousel-arrow--next {
  right: -20px;
}

/* ── Nudge ── */
.nudge {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  border-left: 3px solid #22c55e;
  background-color: color-mix(in srgb, #22c55e 6%, var(--bg-card));
}

.nudge-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: #22c55e;
}

.nudge p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.nudge strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* ── Trust row ── */
.trust-row {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 22px;
}

.trust-row li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ── Actions ── */
.profile-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.back-button {
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  padding: 0 20px;
}

.buy-button {
  min-width: 220px;
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}

/* ── Responsive ── */
@media (max-width: 880px) {
  .carousel {
    --per-view: 2;
  }
}

@media (max-width: 768px) {
  .profile-header {
    gap: 12px;
    margin-bottom: 24px;
  }

  .profile-title {
    font-size: 22px;
  }

  .profile-subtitle {
    font-size: 14px;
  }

  /* One card and a peek of the next, swiped by touch. */
  .carousel {
    --per-view: 1.25;
    --gap: 12px;
  }

  .carousel-arrow {
    display: none !important;
  }

  .trust-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-actions {
    flex-direction: column-reverse;
  }

  .back-button,
  .buy-button {
    width: 100%;
  }
}
</style>
