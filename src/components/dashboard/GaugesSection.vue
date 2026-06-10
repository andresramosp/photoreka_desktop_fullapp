<template>
  <div class="score-gauges">
    <ScoreGauge
      v-for="gauge in activeGauges"
      :key="gauge.key"
      :label="gauge.label"
      :value="gauge.value"
      :color="gauge.color"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ScoreGauge from "@/components/ScoreGauge.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.js";
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

const profileKey = computed(
  () => (userStore.user?.profiles || "general") as UserProfile,
);
const profileVariant = computed(() => getProfileVariant(profileKey.value));

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
</script>

<style scoped>
.score-gauges {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 24px;
}
</style>
