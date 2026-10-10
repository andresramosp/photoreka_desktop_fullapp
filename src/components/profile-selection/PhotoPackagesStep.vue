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
      <n-button secondary @click="fetchPackages">Try again</n-button>
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

        <div ref="trackRef" class="carousel-track" @scroll="update">
          <div v-if="welcomePack" class="carousel-slide">
            <PhotoPackageCard
              :pkg="{ priceEur: 0, ...welcomePack }"
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

      <div
        v-if="isMobile && (canScrollPrev || canScrollNext)"
        class="carousel-dots"
        role="tablist"
        aria-label="Photo packs"
      >
        <button
          v-for="i in slideCount"
          :key="i"
          type="button"
          role="tab"
          class="carousel-dot"
          :class="{ active: activeIndex === i - 1 }"
          :aria-selected="activeIndex === i - 1"
          :aria-label="`Pack ${i} of ${slideCount}`"
          @click="centerOn(i - 1)"
        />
      </div>

      <Transition name="note" mode="out-in">
        <div
          v-if="note"
          :key="selectedId ?? ''"
          class="nudge"
          :style="{ '--accent': selectedAccent }"
        >
          <n-icon size="18" class="nudge-icon"><SparklesOutline /></n-icon>
          <p>
            <strong>{{ note.lead }}</strong>
            {{ note.text }}
          </p>
        </div>
      </Transition>

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
import { ref, computed, watch, nextTick, onMounted } from "vue";
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
import PhotoPackageCard from "./PhotoPackageCard.vue";
import {
  packageNote,
  roleStyle,
  type PackageRole,
} from "./packageRoles";
import { usePayments, type PhotoPackage } from "@/composables/usePayments";
import { useActivityLogger } from "@/composables/useActivityLogger";
import { useSnapCarousel } from "@/composables/useSnapCarousel";
import { useIsMobile } from "@/composables/useIsMobile.js";

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
  welcomePack,
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

const selectedRole = computed<PackageRole>(() =>
  isFreeSelected.value ? "free" : selected.value ? roleOf(selected.value) : null,
);
const selectedAccent = computed(() => roleStyle(selectedRole.value).accent);

const note = computed(() => {
  const pack = isFreeSelected.value ? welcomePack.value : selected.value;
  if (!pack) return null;
  const smallest = starter.value
    ? {
        photos: starter.value.photos,
        finalPrice: priceAfterPromotion(starter.value.priceEur),
      }
    : null;
  return packageNote(selectedRole.value, smallest);
});

// The smallest paid pack starts selected, even next to the free one: the
// lowest-commitment way into a purchase.
watch(
  starter,
  (pkg) => {
    if (pkg && !selectedId.value) selectedId.value = pkg.stripePriceId;
  },
  { immediate: true },
);

// Slides are the free pack (when offered) followed by the paid ones.
const selectedIndex = computed(() => {
  const offset = welcomePack.value ? 1 : 0;
  if (isFreeSelected.value) return 0;
  const i = photoPackages.value.findIndex(
    (p) => p.stripePriceId === selectedId.value,
  );
  return i < 0 ? 0 : i + offset;
});

const select = (pkg: PhotoPackage) => {
  selectedId.value = pkg.stripePriceId;
  nextTick(() => reveal(selectedIndex.value));
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
  nextTick(() => reveal(selectedIndex.value));
  logActivity("ui_action", {
    action: "view_photo_package",
    source: "onboarding",
    packageName: "free",
    photos: welcomePack.value?.photos,
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
const {
  canScrollPrev,
  canScrollNext,
  activeIndex,
  slideCount,
  update,
  centerOn,
  reveal,
  scrollByPage,
} = useSnapCarousel(trackRef);

// The track mounts once the packs load: open it on the preselected pack.
watch(trackRef, (el) => {
  if (el) nextTick(() => reveal(selectedIndex.value, "instant"));
});

onMounted(() => {
  fetchPackages();
  logActivity("ui_action", { action: "open_onboarding_photo_packages" });
});
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
  position: relative;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  /* The scroll container clips the selected card's glow (shadow: 10px down,
     28px blur), so the padding gives it room to fade out, and the negative
     margins keep the layout as if the padding weren't there. */
  padding: 20px 2px 38px;
  margin: -14px 0 -24px;
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

/* ── Dots ── */
.carousel-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 12px 0 16px;
}

.carousel-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background-color: color-mix(in srgb, var(--text-primary) 22%, transparent);
  cursor: pointer;
  transition:
    width 0.25s ease,
    background-color 0.25s ease;
}

.carousel-dot.active {
  width: 22px;
  background-color: var(--accent-color);
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
/* Takes the selected card's color, so it reads as that card's description. */
.nudge {
  --accent: #22c55e;
  display: flex;
  gap: 12px;
  margin-top: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent);
  background-color: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
}

.nudge-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent);
}

.note-enter-active,
.note-leave-active {
  transition: opacity 0.15s ease;
}

.note-enter-from,
.note-leave-to {
  opacity: 0;
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

  /* One centered card with its neighbours peeking on both sides, swiped by
     touch. The peeks are the hint, so the edge fades would only hide them. */
  .carousel {
    --per-view: 1.2;
    --gap: 12px;
  }

  .carousel-slide {
    scroll-snap-align: center;
  }

  .carousel::before,
  .carousel::after,
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
