<template>
  <div class="applied-card">
    <div class="applied-media">
      <img
        v-if="photo.thumbnailUrl"
        :src="photo.thumbnailUrl"
        :alt="photo.originalFileName ?? String(photo.id)"
        loading="lazy"
        @click="$emit('open', photo)"
      />
      <div v-else class="applied-missing">Sin miniatura</div>
      <span class="applied-id">#{{ photo.id }}</span>
      <span class="applied-shift">Δ {{ photo.totalShift.toFixed(1) }}</span>
    </div>

    <p class="applied-name" :title="photo.originalFileName ?? ''">
      {{ photo.originalFileName ?? "—" }}
    </p>

    <div class="applied-controls">
      <n-button
        size="tiny"
        secondary
        :type="phase > 0.5 ? 'primary' : 'default'"
        @click="toggle()"
      >
        {{ phase > 0.5 ? "Ver antes" : "Ver después" }}
      </n-button>
      <span class="applied-phase">{{
        phase > 0.5 ? "corregido" : "original"
      }}</span>
    </div>

    <ScoreBarsDiff
      :before="photo.before"
      :after="photo.after"
      :keys="visibleKeys"
      :phase="phase"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { NButton } from "naive-ui";
import ScoreBarsDiff from "./ScoreBarsDiff.vue";
import { useScoreMorph } from "@/composables/useScoreMorph";
import {
  getArtisticCriteria,
  detectVariantFromScores,
} from "@/config/photo_schema";
import type { AppliedPhoto } from "../../types/scoreSmoothing";

const props = defineProps<{
  photo: AppliedPhoto;
  /** Cambia para disparar la animación desde fuera ("animar todas"). */
  playToken?: number;
  showAll?: boolean;
}>();

defineEmits<{ (e: "open", photo: AppliedPhoto): void }>();

const CHANGE_EPSILON = 0.05;

const { phase, toggle, reset } = useScoreMorph();

watch(
  () => props.playToken,
  (value, previous) => {
    if (value === undefined || value === previous) return;
    toggle();
  },
);

// Al cambiar de página la tarjeta se reutiliza: hay que volver al estado inicial.
watch(() => props.photo.id, reset);

/** Criterios que se pintan: por defecto solo los que se movieron. */
const visibleKeys = computed<string[]>(() => {
  const variant = detectVariantFromScores(props.photo.before);
  const schemaOrder: string[] = getArtisticCriteria(variant).map(
    (criterion: { key: string }) => criterion.key,
  );

  const present = Object.keys(props.photo.before);
  const ordered = schemaOrder.filter((key) => present.includes(key));
  for (const key of present) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  if (props.showAll) return ordered;

  const changed = ordered.filter(
    (key) =>
      Math.abs(
        Number(props.photo.after?.[key] ?? 0) - Number(props.photo.before[key]),
      ) >= CHANGE_EPSILON,
  );
  return changed.length > 0 ? changed : ordered;
});
</script>

<style scoped>
.applied-card {
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  padding: 8px;
  background: #fff;
}

.applied-media {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
  aspect-ratio: 4 / 3;
}

.applied-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.applied-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: #94a3b8;
}

.applied-id,
.applied-shift {
  position: absolute;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 9px;
}

.applied-id {
  left: 4px;
}

.applied-shift {
  right: 4px;
}

.applied-name {
  margin: 6px 0;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 14px;
}

.applied-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.applied-phase {
  font-size: 10px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
</style>
