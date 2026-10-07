<script setup lang="ts">
import { computed } from "vue";
import PicksRankingBar from "./PicksRankingBar.vue";
import PicksPodium from "./PicksPodium.vue";
import PicksGrid from "./PicksGrid.vue";
import PicksTrialUpsell from "./PicksTrialUpsell.vue";
import { getPicksCriterion, getPicksJury } from "@/config/picks";
import { formatCount } from "@/utils/picks/format";
import type { PicksRankingMode, RankedPhoto } from "@/utils/picks/types";

const PODIUM_SIZE = 3;

const props = defineProps<{
  ranked: RankedPhoto[];
  judgedCount: number;
  juryCounts: Record<string, number>;
  scroller: HTMLElement | null;
  trial?: boolean;
}>();

const copies = computed(() =>
  props.ranked.reduce((sum, item) => sum + (item.photo.duplicates?.length ?? 0), 0),
);

const eyebrow = computed(() => {
  const base =
    props.ranked.length < props.judgedCount
      ? `${formatCount(props.ranked.length)} of ${formatCount(props.judgedCount)} photos fit this jury`
      : `${formatCount(props.judgedCount)} photos judged`;
  return copies.value > 0 ? `${base} · ${formatCount(copies.value)} identical copies grouped` : base;
});
const mode = defineModel<PicksRankingMode>("mode", { required: true });
const emit = defineEmits<{ open: [photoId: string]; upgrade: [] }>();

const heading = computed(() => {
  if (mode.value.kind === "jury") {
    const jury = getPicksJury(mode.value.juryId);
    return {
      key: `jury-${jury.id}`,
      lead: "Your best shots, through the eyes of the",
      accent: jury.label,
      tail: " jury.",
      tagline: jury.tagline,
      url: jury.url,
    };
  }
  const criterion = getPicksCriterion(mode.value.criterion);
  return {
    key: `criterion-${criterion?.key}`,
    lead: "Your photos, ranked by",
    accent: criterion?.label.toLowerCase() ?? "",
    tail: ".",
    tagline: criterion?.description ?? "",
    url: undefined,
  };
});

const podium = computed(() => props.ranked.slice(0, PODIUM_SIZE));
const rest = computed(() => props.ranked.slice(PODIUM_SIZE));
</script>

<template>
  <section class="pk-results">
    <header class="pk-results-head">
      <Transition name="pk-heading" mode="out-in">
        <p :key="eyebrow" class="pk-eyebrow">{{ eyebrow }}</p>
      </Transition>
      <Transition name="pk-heading" mode="out-in">
        <div :key="heading.key">
          <h1 class="pk-results-title">
            {{ heading.lead }} <em>{{ heading.accent }}</em>{{ heading.tail }}
          </h1>
          <p class="pk-results-tagline">
            {{ heading.tagline }}
            <a
              v-if="heading.url"
              class="pk-results-link"
              :href="heading.url"
              target="_blank"
              rel="noopener noreferrer"
            >Official site ↗</a>
          </p>
        </div>
      </Transition>
    </header>

    <PicksTrialUpsell v-if="trial" @upgrade="emit('upgrade')" />

    <div class="pk-rankbar-sticky">
      <PicksRankingBar v-model="mode" :jury-counts="juryCounts" />
    </div>

    <PicksPodium :items="podium" @open="emit('open', $event)" />

    <div v-if="rest.length" class="pk-results-divider">
      <span>The full ranking</span>
      <span class="pk-results-divider-line" />
      <span class="pk-results-divider-count">
        No. {{ PODIUM_SIZE + 1 }} – {{ formatCount(ranked.length) }}
      </span>
    </div>

    <PicksGrid :items="rest" :scroller="scroller" @open="emit('open', $event)" />
  </section>
</template>

<style scoped>
.pk-results {
  padding: 8px clamp(16px, 4vw, 48px) 96px;
  max-width: 1680px;
  margin: 0 auto;
}

.pk-results-head {
  padding: clamp(16px, 4vh, 40px) 0 28px;
  max-width: 980px;
}

.pk-results-title {
  margin: 14px 0 0;
  font-family: var(--pk-serif);
  font-weight: 400;
  font-size: clamp(34px, 4.6vw, 62px);
  line-height: 1.04;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.pk-results-title em {
  font-style: italic;
  font-weight: 300;
  background: var(--pk-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  padding-right: 0.05em;
}

.pk-results-tagline {
  margin: 14px 0 0;
  font-size: 16px;
  color: var(--pk-text-2);
}

.pk-results-link {
  margin-left: 8px;
  font-size: 12px;
  color: var(--pk-text-3);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.2s var(--pk-ease);
}

.pk-results-link:hover {
  color: var(--pk-text);
  text-decoration: underline;
}

.pk-rankbar-sticky {
  position: sticky;
  top: var(--pk-topbar-h);
  z-index: 20;
  margin: 0 calc(-1 * clamp(16px, 4vw, 48px)) 22px;
  padding: 10px clamp(16px, 4vw, 48px);
  background: rgba(7, 7, 10, 0.78);
  backdrop-filter: blur(18px) saturate(1.3);
  border-bottom: 1px solid var(--pk-line);
}

.pk-results-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 48px 0 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pk-text-3);
}

.pk-results-divider-line {
  flex: 1;
  height: 1px;
  background: var(--pk-line);
}

.pk-results-divider-count {
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

.pk-heading-enter-active,
.pk-heading-leave-active {
  transition:
    opacity 0.35s var(--pk-ease),
    transform 0.35s var(--pk-ease),
    filter 0.35s var(--pk-ease);
}
.pk-heading-enter-from {
  opacity: 0;
  transform: translateY(10px);
  filter: blur(4px);
}
.pk-heading-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  filter: blur(4px);
}
</style>
