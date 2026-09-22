<template>
  <div class="cluster-menu">
    <n-select
      :value="chunk"
      :options="CLUSTER_CHUNKS"
      :render-label="renderChunkLabel"
      :menu-props="{ class: 'cluster-dropdown' }"
      placement="top-start"
      :disabled="loading"
      :filterable="false"
      :show-checkmark="false"
      placeholder="Similarity"
      size="tiny"
      class="cluster-menu__select"
      @update:value="onChunkChange"
    />
    <n-select
      v-if="scoring"
      :value="scoreKey"
      :options="scoreOptions"
      :render-label="renderChunkLabel"
      :menu-props="{ class: 'cluster-dropdown' }"
      placement="top-start"
      :disabled="loading"
      :filterable="false"
      :show-checkmark="false"
      :consistent-menu-width="false"
      size="tiny"
      class="cluster-menu__score"
      @update:value="(value) => emit('cluster-by', SCORING_CHUNK, value)"
    />
    <span class="cluster-menu__divider" />
    <n-button
      size="tiny"
      :quaternary="layout !== 'blocks'"
      :secondary="layout === 'blocks'"
      :type="layout === 'blocks' ? 'primary' : 'default'"
      class="cluster-menu__toggle"
      :disabled="loading || scoring"
      @click="emit('set-layout', layout === 'blocks' ? 'cloud' : 'blocks')"
    >
      Blocks
    </n-button>
    <n-select
      v-if="layout === 'blocks'"
      :value="k"
      :options="groupOptions"
      :menu-props="{ class: 'cluster-dropdown' }"
      placement="top-start"
      :disabled="!hasCluster || loading"
      :filterable="false"
      :show-checkmark="false"
      :consistent-menu-width="false"
      size="tiny"
      class="cluster-menu__groups"
      @update:value="(value) => emit('set-k', value)"
    />
  </div>
</template>

<script setup>
import { computed, h } from "vue";
import { NSelect, NButton, NIcon } from "naive-ui";
import { PodiumOutline, TrophyOutline } from "@vicons/ionicons5";
import { buildChunkOptions } from "@/config/searchCriteria";
import { getArtisticSchemaForProfile } from "@/config/photo_schema";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { useUserStore } from "@/stores/userStore";

const props = defineProps({
  chunk: { type: String, default: null },
  /** The score a `scoring` cluster bands by: a criterion key or `overall`. */
  scoreKey: { type: String, default: null },
  layout: { type: String, default: "cloud" },
  k: { type: Number, default: 1 },
  maxK: { type: Number, default: 1 },
  loading: { type: Boolean, default: false },
  hasCluster: { type: Boolean, default: false },
});

const emit = defineEmits(["cluster-by", "set-layout", "set-k"]);

/** The chunk name the server routes to the score ladder instead of the vector one. */
const SCORING_CHUNK = "scoring";
const OVERALL_SCORE_KEY = "overall";

// Same similarity criteria as the atlas embeddings; a single result serves both layouts.
// Scoring is the odd one out: bands by a score rather than similarity, blocks only.
const CLUSTER_CHUNKS = [
  ...buildChunkOptions([
    { value: "general", label: "General", criterion: "embedding" },
    { value: "story", label: "Narrative", criterion: "story" },
    { value: "context", label: "Contextual", criterion: "context" },
    { value: "color_histogram", label: "Chromatic", criterion: "chromatic" },
    { value: "visual_aspects", label: "Technical", criterion: "technical" },
  ]),
  { value: SCORING_CHUNK, label: "Scoring", icon: PodiumOutline },
];

const scoring = computed(() => props.chunk === SCORING_CHUNK);

const userStore = useUserStore();
const { criterionIcons } = useArtisticScores({
  profile: () => userStore.user?.profiles,
});

/** Overall first, then the profile's own criteria with their labels already resolved. */
const scoreOptions = computed(() => [
  { value: OVERALL_SCORE_KEY, label: "Overall", icon: TrophyOutline },
  ...getArtisticSchemaForProfile(userStore.user?.profiles)
    .flatMap((group) => group.criteria)
    .map((criterion) => ({
      value: criterion.key,
      label: criterion.label,
      icon: criterionIcons[criterion.key] ?? null,
    })),
]);

// Picking "Scoring" phases by the overall rating straight away; the second select then
// narrows it to one criterion. The other chunks need no second choice.
const onChunkChange = (value) => {
  if (value === SCORING_CHUNK) emit("cluster-by", SCORING_CHUNK, OVERALL_SCORE_KEY);
  else emit("cluster-by", value);
};

const groupOptions = computed(() =>
  Array.from({ length: Math.max(1, props.maxK) }, (_, index) => ({
    label: String(index + 1),
    value: index + 1,
  })),
);

/**
 * Icono + texto, sin el tooltip que `renderCriteriaLabel` envuelve: aquí el select vive
 * dentro de una píldora ya estrecha, y un tooltip por opción la emborrona.
 */
const renderChunkLabel = (option) =>
  h("div", { style: "display:flex;align-items:center;gap:6px;line-height:1" }, [
    option.icon ? h(NIcon, { component: option.icon, size: 14 }) : null,
    option.label,
  ]);
</script>

<style scoped>
.cluster-menu {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Ocupa la fila entera para que el select pueda estirarse hasta el borde izquierdo. */
  flex: 1;
  min-width: 0;
}

.cluster-menu__select {
  flex: 1;
  min-width: 132px;
}

.cluster-menu__score {
  flex: 1;
  min-width: 120px;
}

.cluster-menu__divider {
  width: 1px;
  align-self: stretch;
  margin: 2px 0;
  background: var(--border-color, rgba(255, 255, 255, 0.12));
}

.cluster-menu__toggle {
  font-size: var(--font-size-xs) !important;
}

.cluster-menu__groups {
  width: 56px;
}
</style>

<!-- El desplegable se teletransporta al body, fuera del alcance de los estilos scoped. -->
<style>
.cluster-dropdown {
  border-radius: var(--radius-sm, 8px) !important;
}

.cluster-dropdown .n-base-select-menu__content {
  padding: 3px !important;
}

.cluster-dropdown .n-base-select-option {
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 8px !important;
  font-size: var(--font-size-xs) !important;
  border-radius: var(--radius-sm, 6px) !important;
}
</style>
