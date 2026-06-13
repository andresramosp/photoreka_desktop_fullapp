<template>
  <div class="gauges-section">
    <div class="tab-panel-fixed">
      <Transition name="mode-fade" mode="out-in">
        <div v-if="mode === 'main'" key="main" class="score-gauges">
          <ScoreGauge
            v-for="gauge in activeGauges"
            :key="gauge.key"
            :label="gauge.label"
            :value="gauge.value"
            :color="gauge.color"
            :clickable="true"
            @click="navigateToReportSection('artistic')"
          />
        </div>
        <div v-else key="genre" class="genre-panel">
          <div
            v-if="genreAspect"
            class="genre-card-button"
            role="button"
            tabindex="0"
            aria-label="Open visual aspects report"
            @click="navigateToReportSection('visual')"
            @keydown.enter.prevent="navigateToReportSection('visual')"
            @keydown.space.prevent="navigateToReportSection('visual')"
          >
            <AspectCard
              :min-height="null"
              :aspect="genreAspect"
              :compact="true"
            />
          </div>
          <div v-else class="genre-empty">No genre stats available</div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import ScoreGauge from "@/components/ScoreGauge.vue";
import AspectCard from "@/components/report/AspectCard.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.js";
// @ts-ignore
import { getVisualAspectsOptions } from "@/stores/searchStore.js";
// @ts-ignore
import { buildVisualAspectsData } from "@/components/report/visualAspectsUtils.js";
// @ts-ignore
import { getProfileVariant, getArtisticSchema } from "@/config/photo_schema";
import type { UserProfile } from "@/stores/userStore.js";

const FUNDAMENTALS_COLOR = "#3b82f6";

type GaugeEntry = {
  key: string;
  label: string;
  value: number | null;
  color: string;
};

const photosStore = usePhotosStore();
const userStore = useUserStore();
const router = useRouter();

withDefaults(
  defineProps<{
    mode?: "main" | "genre";
  }>(),
  {
    mode: "main",
  },
);

const profileKey = computed(
  () => (userStore.user?.profiles || "general") as UserProfile,
);
const profileVariant = computed(() => getProfileVariant(profileKey.value));
const visualAspectsOptions = computed(() =>
  getVisualAspectsOptions(userStore.user?.profiles),
);

/** Build a lookup: key → { label, color } from the schema for the current variant */
const criteriaByKey = computed<
  Record<string, { label: string; color: string }>
>(() => {
  const schema = getArtisticSchema(profileVariant.value);
  const result: Record<string, { label: string; color: string }> = {};
  for (const group of schema) {
    for (const criterion of group.criteria || []) {
      result[criterion.key] = {
        label: criterion.label,
        color: group.color || FUNDAMENTALS_COLOR,
      };
    }
  }
  return result;
});

const getAvgScore = (key: string) => {
  const photoList = (photosStore.photos || []) as any[];
  if (!photoList.length) return null;
  const scores = photoList
    .map((p) => Number(p.descriptions?.artistic_scores?.[key]))
    .filter((s) => Number.isFinite(s));
  if (!scores.length) return null;
  return scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
};

/** Returns the 2 bottom-row keys based on profile */
function getBottomRowKeys(profile: UserProfile): [string, string] {
  if (profile === "commercial") {
    return ["commercial_intent", "subject_clarity"];
  }
  if (profile.includes("street")) {
    return ["humor", "visual_games"];
  }
  if (profile.includes("documentary")) {
    return ["message", "storytelling"];
  }
  if (profile === "artistic") {
    return ["visual_games", "composition"];
  }
  // general (default)
  return ["composition", "storytelling"];
}

const activeGauges = computed<GaugeEntry[]>(() => {
  const topKeys: [string, string] = ["aesthetic_quality", "strangeness"];
  const bottomKeys = getBottomRowKeys(profileKey.value);
  const allKeys = [...topKeys, ...bottomKeys];

  return allKeys.map((key) => {
    const meta = criteriaByKey.value[key];
    return {
      key,
      label: meta?.label || key,
      value: getAvgScore(key),
      color: meta?.color || FUNDAMENTALS_COLOR,
    };
  });
});

const genreAspect = computed(() => {
  const visualAspects = buildVisualAspectsData(
    photosStore.photos || [],
    visualAspectsOptions.value,
  );
  return visualAspects.find((aspect: any) => aspect.key === "genre") || null;
});

const navigateToReportSection = (section: "artistic" | "visual") => {
  router.push({
    name: "report",
    query: { section },
  });
};
</script>

<style scoped>
.gauges-section {
  margin: 0;
}

.score-gauges {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tab-panel-fixed {
  height: auto;
  overflow: visible;
}

.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 140ms ease;
}

.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
}

.mode-fade-enter-to,
.mode-fade-leave-from {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .mode-fade-enter-active,
  .mode-fade-leave-active {
    transition: opacity 100ms linear;
  }
}

.genre-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.genre-card-button {
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.genre-card-button:hover :deep(.aspect-card),
.genre-card-button:focus-visible :deep(.aspect-card) {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.genre-card-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  outline-offset: 2px;
}

/* @media (max-width: 768px) {
  .score-gauges {
    grid-template-columns: 1fr;
  }
} */
</style>
